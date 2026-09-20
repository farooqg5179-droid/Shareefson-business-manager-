import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./lib/supabase";
import "./App.css";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Media } from "@capacitor-community/media";
import { Printer } from "@capgo/capacitor-printer";

const REMINDER_CHANNEL_ID = "shareef-son-booking-reminders-v2";

function hashToNotificationId(value) {
  const str = String(value || "");
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 2147483000 || 1;
}

function getBookingReminderDate(booking) {
  if (!booking) return null;

  let dateText = String(booking.reminder_date || "").trim();
  let timeText = String(booking.reminder_time || "09:00").trim();

  // If an enabled booking has no explicit reminder date, use one day before
  // the event date. This also repairs older bookings saved without reminder_date.
  if (!dateText && booking.event_date) {
    dateText = getDefaultReminderDate(booking.event_date);
  }

  if (!dateText) return null;
  if (!/^\d{2}:\d{2}$/.test(timeText)) timeText = "09:00";

  const when = new Date(`${dateText}T${timeText}:00`);
  return Number.isNaN(when.getTime()) ? null : when;
}

async function ensureNativeReminderReady(openExactSettings = false) {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    const permission = await LocalNotifications.checkPermissions();
    if (permission.display !== "granted") {
      const requested = await LocalNotifications.requestPermissions();
      if (requested.display !== "granted") return false;
    }

    await LocalNotifications.createChannel({
      id: REMINDER_CHANNEL_ID,
      name: "Booking Reminders",
      description: "Shareef Sons event booking reminders",
      importance: 5,
      visibility: 1,
      vibration: true,
    }).catch(() => {});

    if (typeof LocalNotifications.checkExactNotificationSetting === "function") {
      const exact = await LocalNotifications.checkExactNotificationSetting().catch(() => ({ exact_alarm: "prompt" }));
      if (exact.exact_alarm !== "granted" && openExactSettings && typeof LocalNotifications.changeExactNotificationSetting === "function") {
        await LocalNotifications.changeExactNotificationSetting().catch(() => {});
      }
      // Do not block scheduling here. Android declares both exact-alarm permissions.
      // The native scheduler will report an actual scheduling error if the OS rejects it.
    }

    return true;
  } catch (e) {
    console.error("Notification setup error", e);
    return false;
  }
}

async function scheduleBookingReminder(booking, openExactSettings = false) {
  if (!Capacitor.isNativePlatform() || !booking?.id) return false;
  const notifId = hashToNotificationId(booking.id);

  try {
    await LocalNotifications.cancel({ notifications: [{ id: notifId }] });
  } catch (e) {}

  if (!booking.reminder_enabled) return true;

  const when = getBookingReminderDate(booking);
  if (!when || when.getTime() <= Date.now()) return false;

  const ready = await ensureNativeReminderReady(openExactSettings);
  if (!ready) return false;

  const customerName = booking.customer_name || booking.ss_customers?.name || "Customer";
  const title = "Shareef Sons Reminder";
  const body = `${booking.event_type || "Event"} for ${customerName}${booking.reminder_note ? " — " + booking.reminder_note : ""}`;

  try {
    const result = await LocalNotifications.schedule({
      notifications: [{
        id: notifId,
        title,
        body,
        channelId: REMINDER_CHANNEL_ID,
        schedule: { at: when, allowWhileIdle: true },
        largeIcon: "shareef_sons_notification",
        extra: { bookingId: booking.id },
      }],
    });
    const pending = typeof LocalNotifications.getPending === "function"
      ? await LocalNotifications.getPending().catch(() => ({ notifications: [] }))
      : null;
    const stillPending = pending?.notifications?.some(item => Number(item.id) === Number(notifId));
    console.log("Booking reminder scheduled", {
      notificationId: notifId,
      bookingId: booking.id,
      scheduledFor: when.toString(),
      result,
      stillPending,
      pending
    });
    return stillPending !== false;
  } catch (e) {
    console.error("Reminder schedule error", e);
    return false;
  }
}

async function syncBookingReminders(bookings) {
  if (!Capacitor.isNativePlatform()) return;

  const ready = await ensureNativeReminderReady(false);
  if (!ready) return;

  const rows = Array.isArray(bookings) ? bookings : [];

  // IMPORTANT: Do not blindly cancel + recreate reminders every time
  // bookings are loaded. That caused a possible cancel/reschedule race.
  // Only create a reminder when Android does not already have it pending.
  let pending = null;
  if (typeof LocalNotifications.getPending === "function") {
    pending = await LocalNotifications.getPending().catch(() => ({ notifications: [] }));
  }

  const pendingIds = new Set(
    (pending?.notifications || []).map(item => Number(item.id))
  );

  for (const booking of rows) {
    if (!booking?.id) continue;

    const notifId = hashToNotificationId(booking.id);

    if (!booking.reminder_enabled) {
      try {
        await LocalNotifications.cancel({ notifications: [{ id: notifId }] });
      } catch (e) {}
      continue;
    }

    const when = getBookingReminderDate(booking);

    // Reminder date/time has already passed: make sure an old alarm is removed.
    if (!when || when.getTime() <= Date.now()) {
      try {
        await LocalNotifications.cancel({ notifications: [{ id: notifId }] });
      } catch (e) {}
      continue;
    }

    // Android already has this exact reminder. Leave it alone.
    if (pending && pendingIds.has(notifId)) continue;

    // Missing from Android: create it now.
    await scheduleBookingReminder(booking, false);
  }
}

async function cancelBookingReminder(bookingId) {
  if (!Capacitor.isNativePlatform() || !bookingId) return;
  try {
    await LocalNotifications.cancel({
      notifications: [{ id: hashToNotificationId(bookingId) }],
    });
  } catch (e) {}
}

const EVENT_TYPES = [
  "Mehndi", "Wedding", "Walima", "Birthday", "Dholki",
  "Mayon", "Nikah", "Barat", "Qawali", "Milad",
  "School", "Dawat", "Corporate", "Brand Activation",
  "Exhibition / Stall Fabrication", "Other"
];

const STATUSES = ["Pending", "Confirmed", "Completed", "Cancelled"];
const PAYMENT_METHODS = ["Cash", "Bank Transfer", "JazzCash", "EasyPaisa", "Card", "Other"];

const emptyBooking = {
  customer_id: "", customer_name: "", event_type: "Wedding", event_date: "", event_time: "",
  venue: "", guests: 0, package_name: "", services: "",
  total_amount: 0, advance_amount: 0, remaining_amount: 0,
  status: "Pending", reminder_enabled: false, reminder_date: "", reminder_time: "", reminder_note: "", custom_data: {}, attachments: [], notes: ""
};

const emptyInvoice = {
  customer_id: "", customer_name: "", booking_id: "", invoice_number: "",
  invoice_date: new Date().toISOString().slice(0, 10),
  event_type: "Wedding", event_date: "", event_time: "",
  venue: "", items: "", subtotal: 0, discount: 0, total_amount: 0, custom_data: {},
  paid_amount: 0, remaining_amount: 0, due_date: "", attachments: [], notes: ""
};

function money(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-PK")}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function getDefaultReminderDate(eventDate) {
  if (!eventDate) return "";
  const date = new Date(`${eventDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() - 1);
  return date.toISOString().slice(0, 10);
}

function calcRemaining(total, paid) {
  return Math.max(Number(total || 0) - Number(paid || 0), 0);
}

function AttachmentUploader({ section, attachments = [], onUpload, onRemove, uploading, message }) {
  const inputRef = useRef(null);
  return (
    <div className="attachment-card">
      <div className="attachment-head"><div><strong>Files & Images</strong><span>Upload photos, PDFs or other files for this {section}.</span></div><button type="button" className="secondary-button" onClick={() => inputRef.current?.click()} disabled={uploading}>{uploading ? "Uploading..." : "＋ Add File"}</button></div>
      <input ref={inputRef} type="file" hidden accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" onChange={e => { const file=e.target.files?.[0]; if(file) onUpload(file, section); e.target.value=""; }} />
      {message && <p className="form-message">{message}</p>}
      {attachments.length > 0 && <div className="attachment-list">{attachments.map(a => <div className="attachment-item" key={a.id || a.path}><div className="attachment-thumb">{String(a.type || "").startsWith("image/") ? <img src={a.url} alt={a.name} /> : <span>FILE</span>}</div><div className="attachment-info"><strong>{a.name}</strong><small>{a.type || "File"}</small><div className="button-row compact"><ImageActions url={a.url} label={a.name} /><button type="button" className="mini-danger" onClick={() => onRemove(section, a.id)}>Remove</button></div></div></div>)}</div>}
    </div>
  );
}

function SuggestionPicker({ value, onChange, options = [], placeholder, required = false, emptyText = "No matching suggestions" }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const query = String(value || "").trim().toLowerCase();
  const matches = options.filter(x => String(x || "").toLowerCase().includes(query)).slice(0, 8);

  useEffect(() => {
    const close = e => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("touchstart", close); };
  }, []);

  return (
    <div className="picker-wrap" ref={rootRef}>
      <input
        value={value || ""}
        required={required}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
      />
      {open && query && (
        <div className="suggestion-menu">
          {matches.length ? matches.map(item => (
            <button type="button" className="suggestion-item" key={item} onClick={() => { onChange(item); setOpen(false); }}>
              <span>{item}</span><small>Select</small>
            </button>
          )) : <div className="suggestion-empty">{emptyText}</div>}
        </div>
      )}
      <small className="field-hint">Type any name, or type the first letters to choose a saved suggestion.</small>
    </div>
  );
}

function CustomerPicker({ value, customerId, customers, onChange, required = false }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const query = String(value || "").trim().toLowerCase();
  const matches = customers.filter(c => String(c.name || "").toLowerCase().includes(query)).slice(0, 8);
  useEffect(() => {
    const close = e => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("touchstart", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("touchstart", close); };
  }, []);
  return (
    <div className="picker-wrap" ref={rootRef}>
      <input value={value || ""} required={required} placeholder="Type customer name or select saved customer" autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={e => { onChange(e.target.value, ""); setOpen(true); }} />
      {open && query && (
        <div className="suggestion-menu">
          {matches.length ? matches.map(c => (
            <button type="button" className="suggestion-item" key={c.id} onClick={() => { onChange(c.name, c.id); setOpen(false); }}>
              <span><b>{c.name}</b><small>{c.phone || c.whatsapp_number || "Saved customer"}</small></span><small>Select</small>
            </button>
          )) : <div className="suggestion-empty">No saved customer matches. You can keep typing a new name.</div>}
        </div>
      )}
      <small className="field-hint">Manual name is allowed. Start typing A, B, C etc. to see saved customers.</small>
    </div>
  );
}

function ImageActions({ url, label = "Image" }) {
  if (!url) return null;
  async function shareImage() {
    try {
      if (navigator.share) {
        if (navigator.canShare) {
          const res = await fetch(url);
          const blob = await res.blob();
          const file = new File([blob], `${label.replace(/\s+/g, "-").toLowerCase()}.png`, { type: blob.type || "image/png" });
          if (navigator.canShare({ files: [file] })) { await navigator.share({ title: label, files: [file] }); return; }
        }
        await navigator.share({ title: label, url });
      } else {
        await navigator.clipboard?.writeText(url);
        alert("Share is not supported here. Image link copied if your browser allows it.");
      }
    } catch (e) { if (e?.name !== "AbortError") alert(e?.message || "Could not share image."); }
  }
  async function downloadImage() {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = objectUrl; a.download = `${label.replace(/\s+/g, "-").toLowerCase()}.png`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
    } catch { window.open(url, "_blank"); }
  }
  return <div className="image-actions"><button type="button" className="mini-button" onClick={shareImage}>↗ Share</button><button type="button" className="mini-button" onClick={downloadImage}>↓ Save to Gallery</button></div>;
}

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  const [isSignup, setIsSignup] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authSaving, setAuthSaving] = useState(false);

  const [currentPage, setCurrentPage] = useState("home");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [selectedExpense, setSelectedExpense] = useState(null);
  const [selectedNote, setSelectedNote] = useState(null);
  const [notificationMessage, setNotificationMessage] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(today().slice(0, 7));
  const [dashboardFromDate, setDashboardFromDate] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [dashboardToDate, setDashboardToDate] = useState(today());
  const [moreOpen, setMoreOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [fileUploading, setFileUploading] = useState(false);
  const [fileMessage, setFileMessage] = useState("");
  const [businessName, setBusinessName] = useState("Shareef Sons Events Organizer");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [address, setAddress] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);

  const [logoUploading, setLogoUploading] = useState(false);
  const [logoMessage, setLogoMessage] = useState("");
  const [logoPreview, setLogoPreview] = useState("");
  const logoInputRef = useRef(null);

  const [signatureUploading, setSignatureUploading] = useState(false);
  const [signatureMessage, setSignatureMessage] = useState("");
  const [signaturePreview, setSignaturePreview] = useState("");
  const signatureInputRef = useRef(null);

  const [customers, setCustomers] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerWhatsapp, setCustomerWhatsapp] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [customerCustomData, setCustomerCustomData] = useState({});
  const [customerMessage, setCustomerMessage] = useState("");
  const [customerSaving, setCustomerSaving] = useState(false);

  const [editingCustomer, setEditingCustomer] = useState(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editWhatsapp, setEditWhatsapp] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editCustomData, setEditCustomData] = useState({});
  const [editSaving, setEditSaving] = useState(false);
  const [editMessage, setEditMessage] = useState("");

  const [bookings, setBookings] = useState([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingSearch, setBookingSearch] = useState("");
  const [bookingForm, setBookingForm] = useState(emptyBooking);
  const [bookingEditing, setBookingEditing] = useState(null);
  const [bookingMessage, setBookingMessage] = useState("");
  const [bookingSaving, setBookingSaving] = useState(false);

  const [invoices, setInvoices] = useState([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceForm, setInvoiceForm] = useState(emptyInvoice);
  const [invoiceEditing, setInvoiceEditing] = useState(null);
  const [invoiceMessage, setInvoiceMessage] = useState("");
  const [invoiceSaving, setInvoiceSaving] = useState(false);

  const [payments, setPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentType, setPaymentType] = useState("in");
  const [paymentForm, setPaymentForm] = useState({
    customer_id: "", customer_name: "", booking_id: "", invoice_id: "", amount: 0,
    payment_date: today(), payment_method: "Cash", title: "", notes: ""
  });
  const [paymentMessage, setPaymentMessage] = useState("");
  const [paymentSaving, setPaymentSaving] = useState(false);

  const [expenses, setExpenses] = useState([]);
  const [expensesLoading, setExpensesLoading] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    title: "", category: "", amount: 0, expense_date: today(),
    payment_method: "Cash", notes: ""
  });
  const [expenseMessage, setExpenseMessage] = useState("");
  const [expenseSaving, setExpenseSaving] = useState(false);

  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteForm, setNoteForm] = useState({
    title: "", note: "", priority: "Normal", status: "Open"
  });
  const [noteEditing, setNoteEditing] = useState(null);
  const [noteMessage, setNoteMessage] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function init() {
      if (!supabase?.auth) {
        if (mounted) {
          setAuthError("Supabase authentication is not available. Please check the app configuration.");          setLoading(false);
        }
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (mounted) {
        setSession(data.session);
        setLoading(false);
      }
    }

    init();

    let listener = null;

    if (supabase?.auth) {
      const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        setSession(nextSession);
        setLoading(false);
      });
      listener = data;
    }

    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user?.id) return;
    loadProfile();
    loadCustomers();
    loadBookings();
    loadInvoices();
    loadPayments();
    loadExpenses();
    loadNotes();
  }, [session?.user?.id]);

  async function requestReminderPermission() {
    if (!Capacitor.isNativePlatform()) {
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        await Notification.requestPermission().catch(() => {});
      }
      return;
    }

    const ready = await ensureNativeReminderReady(true);
    if (!ready) {
      setNotificationMessage("Please allow Notifications and Alarms & reminders for booking reminders.");
    } else {
      setNotificationMessage("Notifications and Alarms & reminders are ready.");
    }
  }

  async function testBookingNotification() {
    if (!Capacitor.isNativePlatform()) {
      setNotificationMessage("Test notification is available in the Android app.");
      return;
    }

    const ready = await ensureNativeReminderReady(true);
    if (!ready) {
      setNotificationMessage("Please allow Notifications and Alarms & reminders first.");
      return;
    }

    const testId = 1900000000 + Math.floor(Math.random() * 40000000);

    try {
      await LocalNotifications.schedule({
        notifications: [{
          id: testId,
          title: "Shareef Sons Test Notification",
          body: "Notification system is working. This is a 10-second test.",
          channelId: REMINDER_CHANNEL_ID,
          schedule: {
            at: new Date(Date.now() + 10000),
          },
          largeIcon: "shareef_sons_notification",
          extra: { testNotification: true },
        }],
      });

      const pending = typeof LocalNotifications.getPending === "function"
        ? await LocalNotifications.getPending().catch(() => ({ notifications: [] }))
        : null;
      const scheduled = pending?.notifications?.some(item => item.id === testId);
      setNotificationMessage(
        scheduled === false
          ? "Test notification schedule nahi hui. Android notification/alarm permission check karein."
          : "Test notification scheduled. Phone ko lock karke 10 seconds wait karein."
      );
    } catch (e) {
      console.error("Test notification error", e);
      setNotificationMessage(e?.message || "Test notification schedule failed.");
    }
  }

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let receivedHandle;
    let actionHandle;

    LocalNotifications.addListener("localNotificationReceived", notification => {
      setNotificationMessage(notification.body || notification.title || "Booking reminder");
    }).then(handle => { receivedHandle = handle; }).catch(() => {});

    LocalNotifications.addListener("localNotificationActionPerformed", action => {
      const bookingId = action?.notification?.extra?.bookingId;
      if (!bookingId) return;
      const booking = bookings.find(item => item.id === bookingId);
      if (booking) {
        setSelectedBooking(booking);
        setCurrentPage("booking-detail");
      } else {
        loadBookings();
        setCurrentPage("bookings");
      }
    }).then(handle => { actionHandle = handle; }).catch(() => {});

    return () => {
      receivedHandle?.remove?.();
      actionHandle?.remove?.();
      LocalNotifications.removeAllListeners().catch(() => {});
    };
  }, [bookings]);

  async function handleAuth(e) {
    e.preventDefault();
    setAuthError("");
    setAuthMessage("");
    setAuthSaving(true);

    try {
      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: name.trim() } }
        });

        if (error) throw error;

        if (data.session) {
          setAuthMessage("Account created successfully.");
        } else {
          setAuthMessage("Account created. Please verify your email if required, then login.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });
        if (error) throw error;
      }
    } catch (error) {
      setAuthError(error.message || "Authentication failed.");
    } finally {
      setAuthSaving(false);
    }
  }

  async function handleDeleteAccount() {
    const ok = window.confirm("Delete your account and business data permanently? This cannot be undone.");
    if (!ok) return;
    try {
      const { error } = await supabase.functions.invoke("delete-my-account");
      if (error) throw error;
      await supabase.auth.signOut();
      alert("Account deleted successfully.");
    } catch (e) {
      alert(e?.message || "Account deletion failed. Please check the Supabase delete-my-account function.");
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setCurrentPage("home");
  }

  async function loadProfile() {
    const { data } = await supabase
      .from("ss_business_profiles")
      .select("*")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (data) {
      setBusinessName(data.business_name || "Shareef Sons Events Organizer");
      setPhone(data.phone || "");
      setWhatsapp(data.whatsapp_number || "");
      setAddress(data.address || "");
      setLogoPreview(data.logo_url || "");
      setSignaturePreview(data.signature_url || "");
    }
  }

  async function saveBusinessProfile(e) {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMessage("");

    const { error } = await supabase.from("ss_business_profiles").upsert({
      user_id: session.user.id,
      business_name: businessName.trim(),
      phone: phone.trim(),
      whatsapp_number: whatsapp.trim(),
      address: address.trim()
    }, { onConflict: "user_id" });

    setProfileSaving(false);
    setProfileMessage(error ? error.message : "Business profile saved.");
  }

  async function makeTransparentSignature(file) {
    if (!file || !file.type.startsWith("image/")) return file;
    const img = new Image();
    const url = URL.createObjectURL(file);
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = image.data;
    for (let i = 0; i < d.length; i += 4) {
      const r=d[i], g=d[i+1], b=d[i+2];
      const brightness=(r+g+b)/3;
      const spread=Math.max(r,g,b)-Math.min(r,g,b);
      if (brightness > 225 && spread < 35) d[i+3]=0;
      else if (brightness > 190 && spread < 45) d[i+3]=Math.max(0, Math.round((225-brightness)*3));
    }
    ctx.putImageData(image,0,0);
    URL.revokeObjectURL(url);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    return new File([blob], "signature-transparent.png", { type: "image/png" });
  }

  async function uploadAttachment(file, section) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setFileMessage("File must be 10MB or smaller.");
      return;
    }
    setFileUploading(true);
    setFileMessage("");
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const path = `${session.user.id}/${section}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("ss-attachments")
        .upload(path, file, { upsert: false, contentType: file.type || "application/octet-stream" });
      if (uploadError) throw uploadError;

      const { data: signed, error: signedError } = await supabase.storage
        .from("ss-attachments")
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (signedError) throw signedError;

      const item = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        path,
        url: signed.signedUrl
      };
      if (section === "booking") setBookingForm(prev => ({ ...prev, attachments: [...(prev.attachments || []), item] }));
      else setInvoiceForm(prev => ({ ...prev, attachments: [...(prev.attachments || []), item] }));
      setFileMessage("File uploaded and attached.");
    } catch (e) {
      setFileMessage(e?.message || "File upload failed.");
    } finally {
      setFileUploading(false);
    }
  }

  function removeAttachment(section, id) {
    if (section === "booking") setBookingForm(prev => ({ ...prev, attachments: (prev.attachments || []).filter(x => x.id !== id) }));
    else setInvoiceForm(prev => ({ ...prev, attachments: (prev.attachments || []).filter(x => x.id !== id) }));
  }

  async function uploadPrivateImage(file, type) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      if (type === "logo") setLogoMessage("Please select an image.");
      else setSignatureMessage("Please select an image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      if (type === "logo") setLogoMessage("Image must be 5MB or smaller.");
      else setSignatureMessage("Image must be 5MB or smaller.");
      return;
    }

    if (type === "signature") file = await makeTransparentSignature(file);
    const ext = type === "signature" ? "png" : (file.name.split(".").pop()?.toLowerCase() || "png");
    const path = `${session.user.id}/${type}-${Date.now()}.${ext}`;
    const bucket = type === "logo" ? "ss-logos" : "ss-signatures";

    if (type === "logo") {
      setLogoUploading(true); setLogoMessage("");
    } else {
      setSignatureUploading(true); setSignatureMessage("");
    }

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      if (type === "logo") { setLogoMessage(uploadError.message); setLogoUploading(false); }
      else { setSignatureMessage(uploadError.message); setSignatureUploading(false); }
      return;
    }

    const { data: signed, error: signedError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 60 * 24 * 365);

    if (signedError) {
      if (type === "logo") { setLogoMessage(signedError.message); setLogoUploading(false); }
      else { setSignatureMessage(signedError.message); setSignatureUploading(false); }
      return;
    }

    const column = type === "logo" ? "logo_url" : "signature_url";
    const { error: dbError } = await supabase.from("ss_business_profiles").upsert({
      user_id: session.user.id,
      business_name: businessName.trim(),
      phone: phone.trim(),
      whatsapp_number: whatsapp.trim(),
      address: address.trim(),
      [column]: signed.signedUrl
    }, { onConflict: "user_id" });

    if (dbError) {
      if (type === "logo") setLogoMessage(dbError.message);
      else setSignatureMessage(dbError.message);
    } else if (type === "logo") {
      setLogoPreview(signed.signedUrl); setLogoMessage("Logo uploaded.");
    } else {
      setSignaturePreview(signed.signedUrl); setSignatureMessage("Signature uploaded.");
    }

    if (type === "logo") setLogoUploading(false);
    else setSignatureUploading(false);
  }

  async function loadCustomers() {
    setCustomersLoading(true);
    const { data, error } = await supabase
      .from("ss_customers")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });

    setCustomersLoading(false);
    if (!error) setCustomers(data || []);
  }

  async function saveCustomer(e) {
    e.preventDefault();
    setCustomerSaving(true);
    setCustomerMessage("");

    if (!customerName.trim()) {
      setCustomerMessage("Customer name is required.");
      setCustomerSaving(false);
      return;
    }

    const { error } = await supabase.from("ss_customers").insert({
      user_id: session.user.id,
      name: customerName.trim(),
      phone: customerPhone.trim(),
      whatsapp_number: customerWhatsapp.trim(),
      address: customerAddress.trim(),
      notes: customerNotes.trim(),
      custom_data: customerCustomData
    });

    if (!error) {
      setCustomerName("");
      setCustomerPhone("");
      setCustomerWhatsapp("");
      setCustomerAddress("");
      setCustomerNotes("");
      setShowCustomerForm(false);
      await loadCustomers();
      setCustomerMessage("Customer added.");
    } else {
      setCustomerMessage(error.message);
    }
    setCustomerSaving(false);
  }

  function openEditCustomer(customer) {
    setEditingCustomer(customer);
    setEditName(customer.name || "");
    setEditPhone(customer.phone || "");
    setEditWhatsapp(customer.whatsapp_number || "");
    setEditAddress(customer.address || "");
    setEditNotes(customer.notes || "");
    setEditCustomData(customer.custom_data || {});    setEditMessage("");
  }

  async function updateCustomer(e) {
    e.preventDefault();
    setEditSaving(true);
    setEditMessage("");

    const { error } = await supabase
      .from("ss_customers")
      .update({
        name: editName.trim(),
        phone: editPhone.trim(),
        whatsapp_number: editWhatsapp.trim(),
        address: editAddress.trim(),
        notes: editNotes.trim(),
        custom_data: editCustomData
      })
      .eq("id", editingCustomer.id)
      .eq("user_id", session.user.id);

    setEditSaving(false);

    if (error) {
      setEditMessage(error.message);
    } else {
      setEditingCustomer(null);
      await loadCustomers();
      if (selectedCustomer?.id === editingCustomer.id) {
        setSelectedCustomer({ ...editingCustomer, name: editName.trim(), phone: editPhone.trim(), whatsapp_number: editWhatsapp.trim(), address: editAddress.trim(), notes: editNotes.trim(), custom_data: editCustomData });
      }
    }
  }

  async function deleteCustomer(customer) {
    const ok = window.confirm(
      `Delete "${customer.name}"?\n\nCustomer will be deleted. Historical bookings/invoices should remain safe if your foreign keys use SET NULL.`
    );
    if (!ok) return;

    const { error } = await supabase
      .from("ss_customers")
      .delete()
      .eq("id", customer.id)
      .eq("user_id", session.user.id);

    if (error) {
      alert(error.message);
      return;
    }

    setSelectedCustomer(null);
    setCurrentPage("customers");
    await Promise.all([loadCustomers(), loadBookings(), loadInvoices(), loadPayments()]);
  }

  async function loadBookings() {
    setBookingsLoading(true);
    const { data, error } = await supabase
      .from("ss_bookings")
      .select("*, ss_customers(name, phone)")
      .eq("user_id", session.user.id)
      .order("event_date", { ascending: true });

    setBookingsLoading(false);
    if (!error) {
      const rows = data || [];
      setBookings(rows);
      syncBookingReminders(rows).catch(() => {});
    }
  }

  function updateBookingField(field, value) {
    setBookingForm(prev => {
      const next = { ...prev, [field]: value };
      if (field === "total_amount" || field === "advance_amount") {
        next.remaining_amount = calcRemaining(
          field === "total_amount" ? value : prev.total_amount,
          field === "advance_amount" ? value : prev.advance_amount
        );
      }
      if (field === "event_date" && prev.reminder_enabled) {
        next.reminder_date = getDefaultReminderDate(value);
        if (!next.reminder_time) next.reminder_time = "09:00";
      }
      return next;
    });
  }

  function openNewBooking(customerId = "") {
    setBookingEditing(null);
    setBookingForm({ ...emptyBooking, customer_id: customerId, customer_name: customers.find(c => c.id === customerId)?.name || "" });
    setBookingMessage("");
    setCurrentPage("booking-form");
  }

  function openEditBooking(booking) {
    setBookingEditing(booking);
    setBookingForm({
      ...emptyBooking,
      ...booking,
      customer_id: booking.customer_id || "",
      customer_name: booking.customer_name || booking.ss_customers?.name || customers.find(c => c.id === booking.customer_id)?.name || ""
    });
    setBookingMessage("");
    setCurrentPage("booking-form");
  }

  async function saveBooking(e) {
    e.preventDefault();
    setBookingSaving(true);
    setBookingMessage("");

    const payload = {
      user_id: session.user.id,
      customer_id: bookingForm.customer_id || null,
      customer_name: bookingForm.customer_name?.trim() || customers.find(c => c.id === bookingForm.customer_id)?.name || null,
      event_type: bookingForm.event_type,
      event_date: bookingForm.event_date || null,
      event_time: bookingForm.event_time || "",
      venue: bookingForm.venue.trim(),
      guests: Number(bookingForm.guests || 0),
      package_name: bookingForm.package_name.trim(),
      services: bookingForm.services.trim(),
      total_amount: Number(bookingForm.total_amount || 0),
      advance_amount: Number(bookingForm.advance_amount || 0),
      remaining_amount: calcRemaining(bookingForm.total_amount, bookingForm.advance_amount),
      status: bookingForm.status,
      reminder_enabled: Boolean(bookingForm.reminder_enabled),
      reminder_date: bookingForm.reminder_enabled ? (bookingForm.reminder_date || null) : null,
      reminder_time: bookingForm.reminder_enabled ? (bookingForm.reminder_time || null) : null,
      reminder_note: bookingForm.reminder_enabled ? bookingForm.reminder_note.trim() : null,
      custom_data: bookingForm.custom_data || {},
      attachments: bookingForm.attachments || [],
      notes: bookingForm.notes.trim()
    };

    const query = bookingEditing
      ? supabase.from("ss_bookings").update(payload).eq("id", bookingEditing.id).eq("user_id", session.user.id).select().single()
      : supabase.from("ss_bookings").insert(payload).select().single();

    const { data: savedBooking, error } = await query;

    setBookingSaving(false);

    if (error) {
      setBookingMessage(error.message);
      return;
    }

    if (savedBooking) {
      // Use the exact values just saved, so reminder scheduling does not
      // depend on joined customer data or a partial returned row.
      const reminderBooking = { ...savedBooking, ...payload };
      const reminderReady = await scheduleBookingReminder(
        reminderBooking,
        Boolean(reminderBooking.reminder_enabled)
      );

      if (reminderBooking.reminder_enabled) {
        const when = getBookingReminderDate(reminderBooking);
        if (!reminderReady) {
          setNotificationMessage(
            "Booking save ho gayi, lekin reminder schedule nahi hua. Android Notifications + Alarms & reminders check karein."
          );
        } else if (when) {
          setNotificationMessage(
            `Booking reminder scheduled for ${when.toLocaleString()}.`
          );
        }
      }
    }

    // loadBookings() also reconciles reminders, but it now preserves an
    // already-pending Android reminder instead of cancelling/recreating it.
    await loadBookings();
    setCurrentPage("bookings");
  }

  async function deleteBooking(booking) {
    if (!window.confirm("Delete this booking?")) return;

    const { error } = await supabase
      .from("ss_bookings")
      .delete()
      .eq("id", booking.id)
      .eq("user_id", session.user.id);

    if (error) {
      alert(error.message);
      return;
    }
    await cancelBookingReminder(booking.id);
    await loadBookings();
    setSelectedBooking(null);
    setCurrentPage("bookings");
  }

  async function loadInvoices() {
    setInvoicesLoading(true);
    const { data, error } = await supabase
      .from("ss_invoices")
      .select("*, ss_customers(name, phone)")
      .eq("user_id", session.user.id)
      .order("invoice_date", { ascending: false });

    setInvoicesLoading(false);
    if (!error) setInvoices(data || []);
  }

  function updateInvoiceField(field, value) {
    setInvoiceForm(prev => {
      const next = { ...prev, [field]: value };
      if (["subtotal", "discount", "paid_amount"].includes(field)) {
        const subtotal = field === "subtotal" ? value : prev.subtotal;
        const discount = field === "discount" ? value : prev.discount;
        const paid = field === "paid_amount" ? value : prev.paid_amount;
        next.total_amount = Math.max(Number(subtotal || 0) - Number(discount || 0), 0);
        next.remaining_amount = calcRemaining(next.total_amount, paid);
      }
      return next;
    });
  }

  function generateInvoiceNumber() {
    return `SS-${Date.now().toString().slice(-8)}`;
  }

  function openNewInvoice(booking = null) {
    const base = {
      ...emptyInvoice,
      invoice_number: generateInvoiceNumber(),
      customer_id: booking?.customer_id || "",
      booking_id: booking?.id || "",
      event_type: booking?.event_type || "Wedding",
      event_date: booking?.event_date || "",
      event_time: booking?.event_time || "",
      venue: booking?.venue || "",
      subtotal: Number(booking?.total_amount || 0),
      paid_amount: Number(booking?.advance_amount || 0),
      total_amount: Number(booking?.total_amount || 0),
      remaining_amount: calcRemaining(booking?.total_amount, booking?.advance_amount)
    };
    setInvoiceEditing(null);
    setInvoiceForm(base);
    setInvoiceMessage("");
    setCurrentPage("invoice-form");
  }

  function openEditInvoice(invoice) {
    setInvoiceEditing(invoice);
    setInvoiceForm({ ...emptyInvoice, ...invoice });
    setInvoiceMessage("");
    setCurrentPage("invoice-form");
  }

  async function saveInvoice(e) {
    e.preventDefault();
    setInvoiceSaving(true);
    setInvoiceMessage("");

    const subtotal = Number(invoiceForm.subtotal || 0);
    const discount = Number(invoiceForm.discount || 0);
    const total = Math.max(subtotal - discount, 0);
    const paid = Number(invoiceForm.paid_amount || 0);

    const payload = {
      user_id: session.user.id,
      customer_id: invoiceForm.customer_id || null,
      customer_name: invoiceForm.customer_name?.trim() || customers.find(c => c.id === invoiceForm.customer_id)?.name || null,
      booking_id: invoiceForm.booking_id || null,
      invoice_number: invoiceForm.invoice_number.trim() || generateInvoiceNumber(),
      invoice_date: invoiceForm.invoice_date || today(),
      event_type: invoiceForm.event_type,
      event_date: invoiceForm.event_date || null,
      event_time: invoiceForm.event_time || "",
      venue: invoiceForm.venue.trim(),
      items: invoiceForm.items.trim(),
      subtotal,
      discount,
      total_amount: total,
      paid_amount: paid,
      remaining_amount: calcRemaining(total, paid),
      due_date: invoiceForm.due_date || null,
      custom_data: invoiceForm.custom_data || {},
      attachments: invoiceForm.attachments || [],
      notes: invoiceForm.notes.trim()
    };

    const query = invoiceEditing
      ? supabase.from("ss_invoices").update(payload).eq("id", invoiceEditing.id).eq("user_id", session.user.id)
      : supabase.from("ss_invoices").insert(payload);

    const { error } = await query;
    setInvoiceSaving(false);

    if (error) {
      setInvoiceMessage(error.message);
      return;
    }

    await loadInvoices();
    setCurrentPage("invoices");
  }

  async function deleteInvoice(invoice) {
    if (!window.confirm("Delete this invoice?")) return;

    const { error } = await supabase
      .from("ss_invoices")
      .delete()
      .eq("id", invoice.id)
      .eq("user_id", session.user.id);

    if (error) {
      alert(error.message);
      return;
    }
    await loadInvoices();
    setSelectedInvoice(null);
    setCurrentPage("invoices");
  }

  async function loadPayments() {
    setPaymentsLoading(true);
    const { data, error } = await supabase
      .from("ss_payments")
      .select("*, ss_customers(name)")
      .eq("user_id", session.user.id)
      .order("payment_date", { ascending: false });

    setPaymentsLoading(false);
    if (!error) setPayments(data || []);
  }

  async function savePayment(e) {
    e.preventDefault();
    setPaymentSaving(true);
    setPaymentMessage("");

    if (Number(paymentForm.amount || 0) <= 0) {
      setPaymentMessage("Amount must be greater than 0.");
      setPaymentSaving(false);
      return;
    }

    const { error } = await supabase.from("ss_payments").insert({
      user_id: session.user.id,
      customer_id: paymentForm.customer_id || null,
      customer_name: paymentForm.customer_name?.trim() || customers.find(c => c.id === paymentForm.customer_id)?.name || null,
      booking_id: paymentForm.booking_id || null,
      invoice_id: paymentForm.invoice_id || null,
      payment_type: paymentType,
      amount: Number(paymentForm.amount || 0),
      payment_date: paymentForm.payment_date || today(),
      payment_method: paymentForm.payment_method,
      title: paymentForm.title.trim(),
      notes: paymentForm.notes.trim()
    });

    setPaymentSaving(false);

    if (error) {
      setPaymentMessage(error.message);
      return;
    }

    setPaymentForm({
      customer_id: "", customer_name: "", booking_id: "", invoice_id: "", amount: 0,
      payment_date: today(), payment_method: "Cash", title: "", notes: ""
    });
    await loadPayments();
    setPaymentMessage("Payment saved.");
  }

  async function loadExpenses() {
    setExpensesLoading(true);
    const { data, error } = await supabase
      .from("ss_expenses")
      .select("*")
      .eq("user_id", session.user.id)
      .order("expense_date", { ascending: false });

    setExpensesLoading(false);
    if (!error) setExpenses(data || []);
  }

  async function saveExpense(e) {
    e.preventDefault();
    setExpenseSaving(true);
    setExpenseMessage("");

    if (!expenseForm.title.trim() || Number(expenseForm.amount || 0) <= 0) {
      setExpenseMessage("Title and valid amount are required.");
      setExpenseSaving(false);
      return;
    }

    const { error } = await supabase.from("ss_expenses").insert({
      user_id: session.user.id,
      title: expenseForm.title.trim(),
      category: expenseForm.category.trim(),
      amount: Number(expenseForm.amount || 0),
      expense_date: expenseForm.expense_date || today(),
      payment_method: expenseForm.payment_method,
      notes: expenseForm.notes.trim()
    });

    setExpenseSaving(false);

    if (error) {
      setExpenseMessage(error.message);
      return;
    }

    setExpenseForm({
      title: "", category: "", amount: 0, expense_date: today(),
      payment_method: "Cash", notes: ""    });
    await loadExpenses();
    setExpenseMessage("Expense saved.");
  }

  async function deleteExpense(expense) {
    if (!window.confirm("Delete this expense?")) return;
    const { error } = await supabase
      .from("ss_expenses")
      .delete()
      .eq("id", expense.id)
      .eq("user_id", session.user.id);

    if (error) alert(error.message);
    else await loadExpenses();
  }

  async function loadNotes() {
    setNotesLoading(true);
    const { data, error } = await supabase
      .from("ss_notes")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });

    setNotesLoading(false);
    if (!error) setNotes(data || []);
  }

  async function saveNote(e) {
    e.preventDefault();
    setNoteSaving(true);
    setNoteMessage("");

    if (!noteForm.title.trim() && !noteForm.note.trim()) {
      setNoteMessage("Write a note first.");
      setNoteSaving(false);
      return;
    }

    const payload = {
      user_id: session.user.id,
      title: noteForm.title.trim(),
      note: noteForm.note.trim(),
      priority: noteForm.priority,
      status: noteForm.status
    };

    const query = noteEditing
      ? supabase.from("ss_notes").update(payload).eq("id", noteEditing.id).eq("user_id", session.user.id)
      : supabase.from("ss_notes").insert(payload);

    const { error } = await query;
    setNoteSaving(false);

    if (error) {
      setNoteMessage(error.message);
      return;
    }

    setNoteEditing(null);
    setNoteForm({ title: "", note: "", priority: "Normal", status: "Open" });
    await loadNotes();
    setNoteMessage("Note saved.");
  }

  function editNote(note) {
    setNoteEditing(note);
    setNoteForm({
      title: note.title || "",
      note: note.note || "",
      priority: note.priority || "Normal",
      status: note.status || "Open"
    });
  }

  async function deleteNote(note) {
    if (!window.confirm("Delete this note?")) return;
    const { error } = await supabase
      .from("ss_notes")
      .delete()
      .eq("id", note.id)
      .eq("user_id", session.user.id);
    if (error) alert(error.message);
    else await loadNotes();
  }

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(c =>
      [c.name, c.phone, c.whatsapp_number, c.address].some(v => String(v || "").toLowerCase().includes(q))
    );
  }, [customers, customerSearch]);

  const filteredBookings = useMemo(() => {
    const q = bookingSearch.trim().toLowerCase();
    if (!q) return bookings;
    return bookings.filter(b =>
      [b.event_type, b.venue, b.package_name, b.ss_customers?.name].some(v =>
        String(v || "").toLowerCase().includes(q)
      )
    );
  }, [bookings, bookingSearch]);

  const filteredInvoices = useMemo(() => {
    const q = invoiceSearch.trim().toLowerCase();
    if (!q) return invoices;
    return invoices.filter(i =>
      [i.invoice_number, i.event_type, i.venue, i.ss_customers?.name].some(v =>
        String(v || "").toLowerCase().includes(q)
      )
    );
  }, [invoices, invoiceSearch]);

  const totalIncome = useMemo(
    () => payments.filter(p => p.payment_type === "in").reduce((s, p) => s + Number(p.amount || 0), 0),
    [payments]
  );

  const totalPaymentOut = useMemo(
    () => payments.filter(p => p.payment_type === "out").reduce((s, p) => s + Number(p.amount || 0), 0),
    [payments]
  );

  const totalExpenses = useMemo(
    () => expenses.reduce((s, e) => s + Number(e.amount || 0), 0),
    [expenses]
  );

  const profit = totalIncome - totalPaymentOut - totalExpenses;

  const pendingAmount = useMemo(
    () => invoices.reduce((s, i) => s + Number(i.remaining_amount || 0), 0),
    [invoices]
  );

  const upcomingBookings = useMemo(() => {
    const now = today();
    return bookings.filter(b => b.event_date && b.event_date >= now && b.status !== "Cancelled").slice(0, 5);
  }, [bookings]);

  const reminders = useMemo(() => {
    const now = today();
    return bookings.filter(b => b.reminder_enabled && b.reminder_date && b.event_date && b.event_date >= now && b.status !== "Completed" && b.status !== "Cancelled")
      .sort((a, b) => `${a.reminder_date} ${a.reminder_time || ""}`.localeCompare(`${b.reminder_date} ${b.reminder_time || ""}`));
  }, [bookings]);

  const monthPayments = useMemo(() => payments.filter(p => String(p.payment_date || "").slice(0, 7) === selectedMonth), [payments, selectedMonth]);
  const monthExpenses = useMemo(() => expenses.filter(e => String(e.expense_date || "").slice(0, 7) === selectedMonth), [expenses, selectedMonth]);

  const dashboardRangePayments = useMemo(
    () => payments.filter(p => {
      const d = String(p.payment_date || "");
      return d && d >= dashboardFromDate && d <= dashboardToDate;
    }),
    [payments, dashboardFromDate, dashboardToDate]
  );
  const dashboardRangeExpenses = useMemo(
    () => expenses.filter(e => {
      const d = String(e.expense_date || "");
      return d && d >= dashboardFromDate && d <= dashboardToDate;
    }),
    [expenses, dashboardFromDate, dashboardToDate]
  );
  const dashboardRangeBookings = useMemo(
    () => bookings.filter(b => {
      const d = String(b.event_date || "");
      return d && d >= dashboardFromDate && d <= dashboardToDate;
    }),
    [bookings, dashboardFromDate, dashboardToDate]
  );
  const monthlyIncome = dashboardRangePayments.filter(p => p.payment_type === "in").reduce((s, p) => s + Number(p.amount || 0), 0);
  const monthlyPaymentOut = dashboardRangePayments.filter(p => p.payment_type === "out").reduce((s, p) => s + Number(p.amount || 0), 0);
  const monthlyExpenses = dashboardRangeExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const monthlyBookingTotal = dashboardRangeBookings.reduce((s, b) => s + Number(b.total_amount || 0), 0);
  const monthlyBookingCount = dashboardRangeBookings.length;
  const monthlyNet = monthlyIncome - monthlyPaymentOut - monthlyExpenses;

  function formatDashboardDate(value) {
    if (!value) return "—";
    const parts = String(value).split("-");
    return parts.length === 3 ? parts[1] + "." + parts[2] + "." + parts[0] : value;
  }

  function setDashboardMonth(value) {
    setSelectedMonth(value);
    if (!value) return;
    const parts = value.split("-");
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const first = value + "-01";
    const lastDay = new Date(year, month, 0).getDate();
    const last = value + "-" + String(lastDay).padStart(2, "0");
    setDashboardFromDate(first);
    setDashboardToDate(last);
  }

  const globalResults = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    if (!q) return [];
    const out = [];
    customers.filter(c => [c.name,c.phone,c.whatsapp_number,c.address].some(v => String(v||"").toLowerCase().includes(q))).slice(0,4).forEach(c => out.push({type:"Customer",title:c.name,sub:c.phone||c.whatsapp_number||"",page:"customer-detail",data:c}));
    bookings.filter(b => [b.customer_name,b.event_type,b.venue,b.event_date].some(v => String(v||"").toLowerCase().includes(q))).slice(0,4).forEach(b => out.push({type:"Booking",title:b.event_type||"Booking",sub:b.customer_name||b.ss_customers?.name||b.event_date||"",page:"booking-detail",data:b}));
    invoices.filter(i => [i.invoice_number,i.customer_name,i.event_type,i.venue].some(v => String(v||"").toLowerCase().includes(q))).slice(0,4).forEach(i => out.push({type:"Invoice",title:i.invoice_number||"Invoice",sub:i.customer_name||i.ss_customers?.name||"",page:"invoice-detail",data:i}));
    payments.filter(p => [p.title,p.customer_name,p.payment_type,p.payment_method,p.notes].some(v => String(v||"").toLowerCase().includes(q))).slice(0,3).forEach(p => out.push({type:"Payment",title:p.title||"Payment",sub:`${p.payment_type === "in" ? "Payment In" : "Payment Out"} • ${money(p.amount)}`,page:"payments",data:p}));
    expenses.filter(e => [e.title,e.category,e.notes].some(v => String(v||"").toLowerCase().includes(q))).slice(0,3).forEach(e => out.push({type:"Expense",title:e.title||"Expense",sub:money(e.amount),page:"expenses",data:e}));
    notes.filter(n => [n.title,n.note,n.priority,n.status].some(v => String(v||"").toLowerCase().includes(q))).slice(0,3).forEach(n => out.push({type:"Note",title:n.title||"Note",sub:n.note||"",page:"notes",data:n}));
    return out.slice(0,12);
  }, [globalSearch, customers, bookings, invoices, payments, expenses, notes]);

  if (loading) {
    return <div className="loading-screen">Loading...</div>;
  }

  if (!supabase) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <p className="eyebrow">SHAREEF SONS</p>
          <h1>Supabase Connection Missing</h1>
          <p className="auth-subtitle">The app could not connect to Supabase. The screen is protected from the startup crash, but the Supabase configuration must be available in the Android build before Login and Signup can work.</p>
          <p className="auth-error">Do not put your Supabase secret/service-role key here. Use the publishable/anon key for the app.</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <p className="eyebrow">SHAREEF SONS</p>
          <h1>Events Organizer</h1>
          <p className="auth-subtitle">Business management system for customers, bookings, invoices and payments.</p>

          <div className="auth-tabs">
            <button className={!isSignup ? "active" : ""} onClick={() => setIsSignup(false)}>Login</button>
            <button className={isSignup ? "active" : ""} onClick={() => setIsSignup(true)}>Signup</button>
          </div>

          <form onSubmit={handleAuth}>
            {isSignup && (
              <input placeholder="Full name" value={name} onChange={e => setName(e.target.value)} required />
            )}
            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
            <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
            {authError && <p className="auth-error">{authError}</p>}
            {authMessage && <p className="auth-message">{authMessage}</p>}
            <button className="auth-submit" disabled={authSaving}>
              {authSaving ? "Please wait..." : isSignup ? "Create Account" : "Login"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  function renderHome() {
    const rangeLabel = formatDashboardDate(dashboardFromDate) + " → " + formatDashboardDate(dashboardToDate);
    const openPayments = type => setSelectedPayment({ __group: type, rows: dashboardRangePayments.filter(p => p.payment_type === type) });
    return (
      <div className="dashboard">
        {notificationMessage && <div className="notification-banner" onClick={() => setNotificationMessage("")}>🔔 {notificationMessage}<span>×</span></div>}
        <div className="welcome-card">
          <p>WELCOME BACK</p><h2>{businessName}</h2><span>Manage your complete event business from one place.</span>
        </div>
        <div className="dashboard-report-card">
          <div className="dashboard-report-head">
            <div>
              <h2>Business Report</h2>
              <p>From {formatDashboardDate(dashboardFromDate)} to {formatDashboardDate(dashboardToDate)}</p>
            </div>
            <div className="report-month-picker">
              <label>Month</label>
              <input type="month" value={selectedMonth} onChange={e => setDashboardMonth(e.target.value)} />
            </div>
          </div>
          <div className="report-date-row">
            <div>
              <label>From</label>
              <input type="date" value={dashboardFromDate} onChange={e => setDashboardFromDate(e.target.value)} />
              <small>{formatDashboardDate(dashboardFromDate)}</small>
            </div>
            <div className="report-date-arrow">→</div>
            <div>
              <label>To</label>
              <input type="date" value={dashboardToDate} min={dashboardFromDate} onChange={e => setDashboardToDate(e.target.value)} />
              <small>{formatDashboardDate(dashboardToDate)}</small>
            </div>
          </div>
          <div className="report-summary-grid">
            <button className="report-summary-card clickable" onClick={() => openPayments("in")}><span>Payment In</span><strong>{money(monthlyIncome)}</strong></button>
            <button className="report-summary-card clickable" onClick={() => setSelectedPayment({ __group: "out", rows: dashboardRangePayments.filter(p => p.payment_type === "out") })}><span>Payment Out</span><strong>{money(monthlyPaymentOut)}</strong></button>
            <button className="report-summary-card clickable" onClick={() => setSelectedExpense({ __group: "month", rows: dashboardRangeExpenses })}><span>Expenses</span><strong>{money(monthlyExpenses)}</strong></button>
            <button className="report-summary-card clickable" onClick={() => setSelectedPayment({ __group: "net", rows: dashboardRangePayments, expenseRows: dashboardRangeExpenses })}><span>Net Balance</span><strong>{money(monthlyNet)}</strong></button>
            <button className="report-summary-card clickable" onClick={() => setCurrentPage("bookings")}><span>Bookings</span><strong>{monthlyBookingCount}</strong><small>{money(monthlyBookingTotal)} booking total</small></button>
          </div>
          <div className="report-range-note"><span>📅 Selected range</span><strong>{rangeLabel}</strong></div>
        </div>
        <div className="section">
          <div className="section-heading"><h2>Quick Actions</h2></div>
          <div className="actions-grid">
            <button onClick={() => { setShowCustomerForm(true); setCurrentPage("customers"); }}>＋ New Customer</button>
            <button onClick={() => openNewBooking()}>＋ New Booking</button>
            <button onClick={() => openNewInvoice()}>＋ Create Invoice</button>
            <button onClick={() => { setPaymentType("in"); setCurrentPage("payments"); }}>＋ Payment In</button>
            <button onClick={() => { setPaymentType("out"); setCurrentPage("payments"); }}>＋ Payment Out</button>
            <button onClick={() => setCurrentPage("notes")}>＋ Add Note</button>
            <button onClick={() => setCurrentPage("calendar")}>📅 Calendar & Reminders</button>
          </div>
        </div>
        <div className="section"><div className="section-heading"><h2>Upcoming Events</h2><button className="secondary-button" onClick={() => setCurrentPage("calendar")}>Open Calendar</button></div>
          {upcomingBookings.length === 0 ? <Empty text="No upcoming bookings." /> : upcomingBookings.map(b => <div className="list-card clickable" key={b.id} onClick={() => { setSelectedBooking(b); setCurrentPage("booking-detail"); }}><div><strong>{b.event_type}</strong><span>{b.customer_name || b.ss_customers?.name || "No customer"} • {b.venue || "Venue not set"}</span></div><b>{b.event_date || "No date"}</b></div>)}
        </div>
        <div className="section"><div className="section-heading"><h2>Booking Reminders</h2><button className="secondary-button" onClick={() => setCurrentPage("calendar")}>View All</button></div>
          {reminders.length === 0 ? <Empty text="No active booking reminders." /> : reminders.slice(0, 5).map(b => <div className="list-card clickable" key={b.id} onClick={() => { setSelectedBooking(b); setCurrentPage("booking-detail"); }}><div><strong>{b.event_type} Reminder</strong><span>{b.customer_name || b.ss_customers?.name || "Customer"} • {b.reminder_date} {b.reminder_time || ""}</span></div><b>{b.event_date}</b></div>)}
        </div>
        {selectedPayment && <PaymentModal data={selectedPayment} customers={customers} bookings={bookings} invoices={invoices} expenses={expenses} onClose={() => setSelectedPayment(null)} />}
        {selectedExpense && <ExpenseModal data={selectedExpense} onClose={() => setSelectedExpense(null)} />}
      </div>
    );
  }

  function renderCustomers() {
    return (
      <div className="dashboard">
        <PageHeader title="Customers" action={<div className="header-actions"><button className="secondary-button" onClick={() => setCurrentPage("home")}>← Back</button><button className="gold-button" onClick={() => setShowCustomerForm(v => !v)}>＋ New Customer</button></div>} />

        <input className="search-input" placeholder="Search customers..." value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} />

        {showCustomerForm && (
          <form className="form-card profile-form" onSubmit={saveCustomer}>
            <h2>New Customer</h2>
            <label>Name *</label>
            <input value={customerName} onChange={e => setCustomerName(e.target.value)} required />
            <label>Phone</label>
            <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
            <label>WhatsApp</label>
            <input value={customerWhatsapp} onChange={e => setCustomerWhatsapp(e.target.value)} />
            <label>Address</label>
            <textarea rows="2" value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} />
            <label>Notes</label>
            <textarea rows="3" value={customerNotes} onChange={e => setCustomerNotes(e.target.value)} />
            {customerMessage && <p className="form-message">{customerMessage}</p>}
            <div className="button-row">
              <button className="gold-button" disabled={customerSaving}>{customerSaving ? "Saving..." : "Save Customer"}</button>
              <button type="button" className="secondary-button" onClick={() => setShowCustomerForm(false)}>Cancel</button>
            </div>
          </form>
        )}
        {customersLoading ? <LoadingText /> : filteredCustomers.length === 0 ? <Empty text="No customers found." /> : (
          <div className="list-stack">
            {filteredCustomers.map(c => (
              <div className="list-card clickable" key={c.id} onClick={() => { setSelectedCustomer(c); setCurrentPage("customer-detail"); }}>
                <div>
                  <strong>{c.name}</strong>
                  <span>{c.phone || c.whatsapp_number || "No phone"} {c.address ? `• ${c.address}` : ""}</span>
                </div>
                <span>›</span>
              </div>
            ))}
          </div>
        )}

        {editingCustomer && (
          <Modal title="Edit Customer" onClose={() => setEditingCustomer(null)}>
            <form className="profile-form" onSubmit={updateCustomer}>
              <label>Name *</label><input value={editName} onChange={e => setEditName(e.target.value)} required />
              <label>Phone</label><input value={editPhone} onChange={e => setEditPhone(e.target.value)} />
              <label>WhatsApp</label><input value={editWhatsapp} onChange={e => setEditWhatsapp(e.target.value)} />
              <label>Address</label><textarea rows="2" value={editAddress} onChange={e => setEditAddress(e.target.value)} />
              <label>Notes</label><textarea rows="3" value={editNotes} onChange={e => setEditNotes(e.target.value)} />
              {editMessage && <p className="form-message">{editMessage}</p>}
              <div className="button-row">
                <button className="gold-button" disabled={editSaving}>{editSaving ? "Saving..." : "Update Customer"}</button>
                <button type="button" className="secondary-button" onClick={() => setEditingCustomer(null)}>Cancel</button>
              </div>
            </form>
          </Modal>
        )}
      </div>
    );
  }

  function renderCustomerDetail() {
    if (!selectedCustomer) return renderCustomers();
    const customerBookings = bookings.filter(b => b.customer_id === selectedCustomer.id);
    const customerInvoices = invoices.filter(i => i.customer_id === selectedCustomer.id);

    return (
      <div className="dashboard">
        <PageHeader title="Customer Details" action={<button className="secondary-button" onClick={() => setCurrentPage("customers")}>← Back</button>} />
        <div className="detail-card">
          <div className="detail-title"><h2>{selectedCustomer.name}</h2><span>Customer</span></div>
          <Detail label="Phone" value={selectedCustomer.phone} />
          <Detail label="WhatsApp" value={selectedCustomer.whatsapp_number} />
          <Detail label="Address" value={selectedCustomer.address} />
          <Detail label="Notes" value={selectedCustomer.notes} />
          <div className="button-row">
            <button className="gold-button" onClick={() => openEditCustomer(selectedCustomer)}>Edit</button>
            <button className="danger-button" onClick={() => deleteCustomer(selectedCustomer)}>Delete Customer</button>
            <button className="secondary-button" onClick={() => openNewBooking(selectedCustomer.id)}>＋ Booking</button>
          </div>
        </div>

        <div className="section">
          <div className="section-heading"><h2>Bookings</h2></div>
          {customerBookings.length === 0 ? <Empty text="No bookings for this customer." /> : customerBookings.map(b => (
            <div className="list-card" key={b.id} onClick={() => { setSelectedBooking(b); setCurrentPage("booking-detail"); }}>
              <div><strong>{b.event_type}</strong><span>{b.event_date} • {b.venue}</span></div>
              <b>{money(b.total_amount)}</b>
            </div>
          ))}
        </div>

        <div className="section">
          <div className="section-heading"><h2>Invoices</h2></div>
          {customerInvoices.length === 0 ? <Empty text="No invoices for this customer." /> : customerInvoices.map(i => (
            <div className="list-card" key={i.id} onClick={() => { setSelectedInvoice(i); setCurrentPage("invoice-detail"); }}>
              <div><strong>{i.invoice_number}</strong><span>{i.invoice_date}</span></div>
              <b>{money(i.total_amount)}</b>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderBookings() {
    return (
      <div className="dashboard">
        <PageHeader title="Bookings" action={<div className="header-actions"><button className="secondary-button" onClick={() => setCurrentPage("home")}>← Back</button><button className="gold-button" onClick={() => openNewBooking()}>＋ New Booking</button></div>} />
        <input className="search-input" placeholder="Search bookings..." value={bookingSearch} onChange={e => setBookingSearch(e.target.value)} />
        {bookingsLoading ? <LoadingText /> : filteredBookings.length === 0 ? <Empty text="No bookings found." /> : (
          <div className="list-stack">
            {filteredBookings.map(b => (
              <div className="list-card clickable" key={b.id} onClick={() => { setSelectedBooking(b); setCurrentPage("booking-detail"); }}>
                <div>
                  <strong>{b.event_type} — {b.customer_name || b.ss_customers?.name || "No customer"}</strong>
                  <span>{b.event_date || "No date"} {b.event_time ? `• ${b.event_time}` : ""} • {b.venue || "No venue"}</span>
                </div>
                <div className="right-stack"><b>{money(b.total_amount)}</b><small>{b.status}</small></div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderBookingForm() {
    return (
      <div className="dashboard">
        <PageHeader title={bookingEditing ? "Edit Booking" : "New Booking"} action={<button className="secondary-button" onClick={() => setCurrentPage("bookings")}>← Back</button>} />
        <form className="form-card profile-form" onSubmit={saveBooking}>
          <label>Customer *</label>
          <CustomerPicker value={bookingForm.customer_name} customerId={bookingForm.customer_id} customers={customers} required onChange={(name, id) => setBookingForm(p => ({ ...p, customer_name: name, customer_id: id }))} />
          <label>Event Type</label>
          <SuggestionPicker value={bookingForm.event_type} options={EVENT_TYPES} placeholder="Type event or choose suggestion" onChange={v => updateBookingField("event_type", v)} />          <div className="two-col"><div><label>Event Date</label><input type="date" value={bookingForm.event_date || ""} onChange={e => updateBookingField("event_date", e.target.value)} /></div><div><label>Event Time</label><input type="time" value={bookingForm.event_time || ""} onChange={e => updateBookingField("event_time", e.target.value)} /></div></div>
          <label>Venue</label><input value={bookingForm.venue} onChange={e => updateBookingField("venue", e.target.value)} />
          <div className="two-col"><div><label>Guests</label><input type="number" min="0" value={bookingForm.guests} onChange={e => updateBookingField("guests", e.target.value)} /></div><div><label>Package</label><input value={bookingForm.package_name} onChange={e => updateBookingField("package_name", e.target.value)} /></div></div>
          <label>Services</label><textarea rows="4" value={bookingForm.services} onChange={e => updateBookingField("services", e.target.value)} placeholder="Stage, lights, seating, decoration..." />
          <div className="two-col"><div><label>Total Amount</label><input type="number" min="0" value={bookingForm.total_amount} onChange={e => updateBookingField("total_amount", e.target.value)} /></div><div><label>Advance</label><input type="number" min="0" value={bookingForm.advance_amount} onChange={e => updateBookingField("advance_amount", e.target.value)} /></div></div>
          <label>Remaining</label><input type="number" value={bookingForm.remaining_amount} readOnly />
          <label>Status</label><select value={bookingForm.status} onChange={e => updateBookingField("status", e.target.value)}>{STATUSES.map(x => <option key={x}>{x}</option>)}</select>
          <div className="reminder-box booking-reminder"><div className="reminder-title"><div><h3>🔔 Booking Reminder</h3><p>Reminder stays active until the event is completed or its date has passed.</p></div><label className="switch"><input type="checkbox" checked={Boolean(bookingForm.reminder_enabled)} onChange={e => {
  const enabled = e.target.checked;
  setBookingForm(prev => ({
    ...prev,
    reminder_enabled: enabled,
    reminder_date: enabled ? (prev.reminder_date || getDefaultReminderDate(prev.event_date)) : "",
    reminder_time: enabled ? (prev.reminder_time || "09:00") : ""
  }));
  if (enabled) requestReminderPermission();
}} /><span></span></label></div>
            {bookingForm.reminder_enabled && <><div className="two-col"><div><label>Reminder Date</label><input type="date" value={bookingForm.reminder_date || ""} onChange={e => updateBookingField("reminder_date", e.target.value)} /></div><div><label>Reminder Time</label><input type="time" value={bookingForm.reminder_time || ""} onChange={e => updateBookingField("reminder_time", e.target.value)} /></div></div><label>Reminder Note</label><input value={bookingForm.reminder_note || ""} onChange={e => updateBookingField("reminder_note", e.target.value)} placeholder="What should we remember?" /></>}
          </div>
          <AttachmentUploader section="booking" attachments={bookingForm.attachments || []} onUpload={uploadAttachment} onRemove={removeAttachment} uploading={fileUploading} message={fileMessage} />
          <label>Notes</label><textarea rows="3" value={bookingForm.notes} onChange={e => updateBookingField("notes", e.target.value)} />
          {bookingMessage && <p className="form-message">{bookingMessage}</p>}
          <button className="gold-button wide" disabled={bookingSaving}>{bookingSaving ? "Saving..." : "Save Booking"}</button>
        </form>
      </div>
    );
  }

  function renderBookingDetail() {
    if (!selectedBooking) return renderBookings();
    return (
      <div className="dashboard">
        <PageHeader title="Booking Details" action={<button className="secondary-button" onClick={() => setCurrentPage("bookings")}>← Back</button>} />
        <div className="detail-card">
          <div className="detail-title"><h2>{selectedBooking.event_type}</h2><span>{selectedBooking.status}</span></div>
          <Detail label="Customer" value={selectedBooking.customer_name || selectedBooking.ss_customers?.name || customers.find(c => c.id === selectedBooking.customer_id)?.name} />
          <Detail label="Event Date" value={selectedBooking.event_date} />
          <Detail label="Event Time" value={selectedBooking.event_time} />
          <Detail label="Venue" value={selectedBooking.venue} />
          <Detail label="Guests" value={selectedBooking.guests} />
          <Detail label="Package" value={selectedBooking.package_name} />
          <Detail label="Services" value={selectedBooking.services} />
          <Detail label="Total" value={money(selectedBooking.total_amount)} />
          <Detail label="Advance" value={money(selectedBooking.advance_amount)} />
          <Detail label="Remaining" value={money(selectedBooking.remaining_amount)} />
          <Detail label="Notes" value={selectedBooking.notes} />{(selectedBooking.attachments || []).length > 0 && <div className="detail-attachments"><strong>Files & Images</strong>{selectedBooking.attachments.map(a => <div className="saved-attachment" key={a.id || a.path}><span>{a.name}</span><ImageActions url={a.url} label={a.name} /></div>)}</div>}
          <div className="button-row">
            <button className="gold-button" onClick={() => openEditBooking(selectedBooking)}>Edit</button>
            <button className="secondary-button" onClick={() => openNewInvoice(selectedBooking)}>＋ Invoice</button>
            <button className="danger-button" onClick={() => deleteBooking(selectedBooking)}>Delete</button>
          </div>
        </div>
      </div>
    );
  }

  function renderInvoices() {
    return (
      <div className="dashboard">
        <PageHeader title="Invoices" action={<div className="header-actions"><button className="secondary-button" onClick={() => setCurrentPage("home")}>← Back</button><button className="gold-button" onClick={() => openNewInvoice()}>＋ New Invoice</button></div>} />
        <input className="search-input" placeholder="Search invoices..." value={invoiceSearch} onChange={e => setInvoiceSearch(e.target.value)} />
        {invoicesLoading ? <LoadingText /> : filteredInvoices.length === 0 ? <Empty text="No invoices found." /> : (
          <div className="list-stack">
            {filteredInvoices.map(i => (
              <div className="list-card clickable" key={i.id} onClick={() => { setSelectedInvoice(i); setCurrentPage("invoice-detail"); }}>
                <div>
                  <strong>{i.invoice_number} — {i.customer_name || i.ss_customers?.name || "No customer"}</strong>
                  <span>Invoice: {i.invoice_date} • Event: {i.event_date || "No date"} {i.event_time ? `• ${i.event_time}` : ""}</span>
                </div>
                <div className="right-stack"><b>{money(i.total_amount)}</b><small>Due {money(i.remaining_amount)}</small></div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderInvoiceForm() {
    return (
      <div className="dashboard">
        <PageHeader title={invoiceEditing ? "Edit Invoice" : "Create Invoice"} action={<button className="secondary-button" onClick={() => setCurrentPage("invoices")}>← Back</button>} />
        <form className="form-card profile-form" onSubmit={saveInvoice}>
          <label>Invoice Number</label><input value={invoiceForm.invoice_number} onChange={e => updateInvoiceField("invoice_number", e.target.value)} />
          <label>Customer *</label><CustomerPicker value={invoiceForm.customer_name} customerId={invoiceForm.customer_id} customers={customers} required onChange={(name, id) => setInvoiceForm(p => ({ ...p, customer_name: name, customer_id: id }))} />
          <label>Booking</label><select value={invoiceForm.booking_id} onChange={e => { const b = bookings.find(x => x.id === e.target.value); if (b) setInvoiceForm(prev => ({ ...prev, booking_id: b.id, customer_id: b.customer_id || prev.customer_id, customer_name: b.customer_name || b.ss_customers?.name || prev.customer_name, event_type: b.event_type || prev.event_type, event_date: b.event_date || "", event_time: b.event_time || "", venue: b.venue || "", subtotal: Number(b.total_amount || 0), paid_amount: Number(b.advance_amount || 0), total_amount: Number(b.total_amount || 0), remaining_amount: calcRemaining(b.total_amount, b.advance_amount) })); else updateInvoiceField("booking_id", ""); }}><option value="">No booking / manual invoice</option>{bookings.map(b => <option key={b.id} value={b.id}>{b.event_date || "No date"} — {b.event_type} — {b.customer_name || b.ss_customers?.name || "Customer"}</option>)}</select>
          <label>Event Type</label><SuggestionPicker value={invoiceForm.event_type} options={EVENT_TYPES} placeholder="Type event or choose suggestion" onChange={v => updateInvoiceField("event_type", v)} />
          <div className="two-col"><div><label>Invoice Date</label><input type="date" value={invoiceForm.invoice_date || ""} onChange={e => updateInvoiceField("invoice_date", e.target.value)} /></div><div><label>Event Date</label><input type="date" value={invoiceForm.event_date || ""} onChange={e => updateInvoiceField("event_date", e.target.value)} /></div></div>
          <div className="two-col"><div><label>Event Time</label><input type="time" value={invoiceForm.event_time || ""} onChange={e => updateInvoiceField("event_time", e.target.value)} /></div><div><label>Due Date</label><input type="date" value={invoiceForm.due_date || ""} onChange={e => updateInvoiceField("due_date", e.target.value)} /></div></div>
          <label>Venue</label><input value={invoiceForm.venue} onChange={e => updateInvoiceField("venue", e.target.value)} />
          <label>Items / Services</label><textarea rows="5" value={invoiceForm.items} onChange={e => updateInvoiceField("items", e.target.value)} placeholder="Decoration, stage, lights, seating..." />
          <div className="three-col"><div><label>Subtotal</label><input type="number" min="0" value={invoiceForm.subtotal} onChange={e => updateInvoiceField("subtotal", e.target.value)} /></div><div><label>Discount</label><input type="number" min="0" value={invoiceForm.discount} onChange={e => updateInvoiceField("discount", e.target.value)} /></div><div><label>Total</label><input type="number" value={invoiceForm.total_amount} readOnly /></div></div>
          <label>Paid Amount</label><input type="number" min="0" value={invoiceForm.paid_amount} onChange={e => updateInvoiceField("paid_amount", e.target.value)} />
          <label>Remaining Amount</label><input type="number" value={invoiceForm.remaining_amount} readOnly />
          <AttachmentUploader section="invoice" attachments={invoiceForm.attachments || []} onUpload={uploadAttachment} onRemove={removeAttachment} uploading={fileUploading} message={fileMessage} />
          <label>Notes</label><textarea rows="3" value={invoiceForm.notes} onChange={e => updateInvoiceField("notes", e.target.value)} />
          {invoiceMessage && <p className="form-message">{invoiceMessage}</p>}<button className="gold-button wide" disabled={invoiceSaving}>{invoiceSaving ? "Saving..." : "Save Invoice"}</button>
        </form>
      </div>
    );
  }

  async function buildInvoiceCanvas() {
    const source = document.getElementById("invoice-print-area");
    if (!source) throw new Error("Invoice area not found.");

    const clone = source.cloneNode(true);
    clone.querySelectorAll(".no-print, .invoice-actions, .invoice-footer").forEach(node => node.remove());
    clone.style.width = "794px";
    clone.style.maxWidth = "794px";
    clone.style.minHeight = "1123px";
    clone.style.margin = "0";
    clone.style.border = "0";
    clone.style.borderRadius = "0";
    clone.style.boxShadow = "none";
    clone.style.background = "#ffffff";
    clone.style.position = "fixed";
    clone.style.left = "-10000px";
    clone.style.top = "0";
    clone.style.zIndex = "-1";
    document.body.appendChild(clone);

    try {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return await html2canvas(clone, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        width: 794,
        windowWidth: 794,
      });
    } finally {
      clone.remove();
    }
  }

  function canvasToA4Pdf(canvas) {
    const pdf = new jsPDF("p", "mm", "a4");
    const margin = 10;
    const contentWidth = 190;
    const contentHeight = 277;
    const pageHeightPx = Math.floor(canvas.width * (contentHeight / contentWidth));

    for (let offset = 0; offset < canvas.height; offset += pageHeightPx) {
      const sliceHeight = Math.min(pageHeightPx, canvas.height - offset);
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = sliceHeight;
      const ctx = slice.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, offset, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

      const renderedHeight = sliceHeight * contentWidth / canvas.width;
      if (offset > 0) pdf.addPage();
      pdf.addImage(slice.toDataURL("image/jpeg", 0.95), "JPEG", margin, margin, contentWidth, renderedHeight);
    }
    return pdf;
  }

  async function saveInvoicePdf() {
    try {
      const canvas = await buildInvoiceCanvas();
      const pdf = canvasToA4Pdf(canvas);
      const filename = `${selectedInvoice?.invoice_number || "invoice"}.pdf`;

      if (Capacitor.isNativePlatform()) {
        const dataUri = pdf.output("datauristring");
        const base64 = dataUri.split(",")[1];
        await Printer.printBase64({ name: filename.replace(/\.pdf$/i, ""), data: base64, mimeType: "application/pdf" });
        return;
      }

      pdf.save(filename);
    } catch (e) {
      alert(e?.message || "PDF creation failed.");
    }
  }

  async function saveInvoiceToGallery() {
    try {
      const canvas = await buildInvoiceCanvas();
      const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
      const filename = `${selectedInvoice?.invoice_number || "invoice"}`;

      if (Capacitor.isNativePlatform()) {
        const albumName = "Shareef Sons Invoices";
        let { albums } = await Media.getAlbums();
        let album = albums?.find(a => a.name === albumName);
        if (!album) {
          await Media.createAlbum({ name: albumName });
          ({ albums } = await Media.getAlbums());
          album = albums?.find(a => a.name === albumName);
        }
        if (!album?.identifier) throw new Error("Invoice gallery album could not be created.");

        await Media.savePhoto({
          path: dataUrl,
          albumIdentifier: album.identifier,
          fileName: filename,
        });
        setNotificationMessage("Invoice Gallery mein save ho gaya.");
        return;
      }

      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${filename}.jpg`;
      a.click();
    } catch (e) {
      alert(e?.message || "Gallery save failed.");
    }
  }

  async function printInvoice() {
    try {
      const canvas = await buildInvoiceCanvas();
      const pdf = canvasToA4Pdf(canvas);

      if (Capacitor.isNativePlatform()) {
        const dataUri = pdf.output("datauristring");
        const base64 = dataUri.split(",")[1];
        await Printer.printBase64({
          name: selectedInvoice?.invoice_number || "Invoice",
          data: base64,
          mimeType: "application/pdf",
        });
        return;
      }

      window.print();
    } catch (e) {
      alert(e?.message || "Print failed.");
    }
  }

  function renderInvoiceDetail() {
    if (!selectedInvoice) return renderInvoices();

    const customer = selectedInvoice.customer_name
      || selectedInvoice.ss_customers?.name
      || customers.find(c => c.id === selectedInvoice.customer_id)?.name
      || "Customer";
    const serviceLines = String(selectedInvoice.items || "")
      .split(/\n|,/)
      .map(x => x.trim())
      .filter(Boolean);
    const lines = serviceLines.length ? serviceLines : ["Event services"];
    const total = Number(selectedInvoice.total_amount || 0);
    const paid = Number(selectedInvoice.paid_amount || 0);
    const balance = Number(selectedInvoice.remaining_amount ?? calcRemaining(total, paid));

    return (
      <div className="dashboard">
        <PageHeader title="Invoice Details" action={<button className="secondary-button" onClick={() => setCurrentPage("invoices")}>← Back</button>} />

        <div id="invoice-print-area" className="invoice-paper professional-invoice">
          <div className="invoice-head professional-invoice-head">
            <div className="invoice-brand-block">
              {logoPreview && <img src={logoPreview} className="invoice-logo" alt="Business logo" />}
              <div>
                <h2>{businessName}</h2>
                {address && <p>{address}</p>}
                {(phone || whatsapp) && <p>{phone}{phone && whatsapp ? " • " : ""}{whatsapp ? `WhatsApp: ${whatsapp}` : ""}</p>}
              </div>
            </div>
            <div className="invoice-number">
              <span>INVOICE</span>
              <strong>{selectedInvoice.invoice_number || "SS-INVOICE"}</strong>
              <small>Status: {balance > 0 ? "Payment Due" : "Paid in Full"}</small>
            </div>
          </div>

          <div className="invoice-meta-grid">
            <div><span>Bill To</span><strong>{customer}</strong></div>
            <div><span>Invoice Date</span><strong>{selectedInvoice.invoice_date || "—"}</strong></div>
            <div><span>Due Date</span><strong>{selectedInvoice.due_date || "—"}</strong></div>
            <div><span>Event</span><strong>{selectedInvoice.event_type || "—"}</strong></div>
            <div><span>Event Date</span><strong>{selectedInvoice.event_date || "—"}</strong></div>
            <div><span>Event Time</span><strong>{selectedInvoice.event_time || "—"}</strong></div>
            <div className="invoice-meta-wide"><span>Venue</span><strong>{selectedInvoice.venue || "—"}</strong></div>
          </div>

          <div className="invoice-items professional-items">
            <h3>Services & Description</h3>
            <table>
              <thead><tr><th>Description</th><th>Amount</th></tr></thead>
              <tbody>
                {lines.map((line, index) => (
                  <tr key={`${line}-${index}`}><td>{line}</td><td>{index === 0 ? money(selectedInvoice.subtotal) : "—"}</td></tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="invoice-total professional-total">
            <div><span>Subtotal</span><b>{money(selectedInvoice.subtotal)}</b></div>
            <div><span>Discount</span><b>{money(selectedInvoice.discount)}</b></div>
            <div className="grand-total"><span>Total Amount</span><b>{money(total)}</b></div>
            <div><span>Amount Paid</span><b>{money(paid)}</b></div>
            <div className="balance-row"><span>Balance Due</span><b>{money(balance)}</b></div>
          </div>

          <div className="invoice-payment-status">
            Payment Status: <strong>{balance > 0 ? "Payment Due" : "Paid in Full"}</strong>
          </div>

          {selectedInvoice.notes && (
            <div className="invoice-notes professional-notes">
              <strong>Notes & Terms</strong>
              <p>{selectedInvoice.notes}</p>
            </div>
          )}

          <div className="invoice-signature-area">
            <div>
              <span>Authorized Signature</span>
              {signaturePreview ? <img src={signaturePreview} className="signature-preview" alt="Digital signature" /> : <div className="signature-line" />}
              <small>{businessName}</small>
            </div>
          </div>
        </div>

        <div className="button-row no-print invoice-actions">
          <button className="gold-button" onClick={() => openEditInvoice(selectedInvoice)}>Edit Invoice</button>
          <button className="secondary-button" onClick={printInvoice}>🖨 Print A4</button>
          <button className="secondary-button" onClick={saveInvoicePdf}>📄 Save A4 PDF</button>
          <button className="secondary-button" onClick={saveInvoiceToGallery}>↓ Save Image</button>
          <button className="danger-button" onClick={() => deleteInvoice(selectedInvoice)}>Delete</button>
        </div>
      </div>
    );
  }

  function renderPayments() {
    return (
      <div className="dashboard">
        <PageHeader title="Payments" action={<button className="secondary-button" onClick={() => setCurrentPage("home")}>← Back</button>} />
        <div className="type-tabs"><button className={paymentType === "in" ? "active" : ""} onClick={() => setPaymentType("in")}>Payment In</button><button className={paymentType === "out" ? "active" : ""} onClick={() => setPaymentType("out")}>Payment Out</button></div>
        <form className="form-card profile-form" onSubmit={savePayment}>
          <h2>{paymentType === "in" ? "Receive Payment" : "Make Payment"}</h2>
          <label>Customer</label><CustomerPicker value={paymentForm.customer_name} customerId={paymentForm.customer_id} customers={customers} onChange={(name, id) => setPaymentForm(p => ({ ...p, customer_name: name, customer_id: id }))} />
          <label>Booking</label><select value={paymentForm.booking_id} onChange={e => setPaymentForm(p => ({ ...p, booking_id: e.target.value }))}><option value="">Optional</option>{bookings.map(b => <option key={b.id} value={b.id}>{b.event_date} — {b.event_type}</option>)}</select>
          <label>Invoice</label><select value={paymentForm.invoice_id} onChange={e => setPaymentForm(p => ({ ...p, invoice_id: e.target.value }))}><option value="">Optional</option>{invoices.map(i => <option key={i.id} value={i.id}>{i.invoice_number} — {i.customer_name || i.ss_customers?.name || "Customer"}</option>)}</select>
          <label>Amount</label><input type="number" min="0" value={paymentForm.amount} onChange={e => setPaymentForm(p => ({ ...p, amount: e.target.value }))} required />
          <label>Date</label><input type="date" value={paymentForm.payment_date} onChange={e => setPaymentForm(p => ({ ...p, payment_date: e.target.value }))} />
          <label>Payment Method</label><select value={paymentForm.payment_method} onChange={e => setPaymentForm(p => ({ ...p, payment_method: e.target.value }))}>{PAYMENT_METHODS.map(x => <option key={x}>{x}</option>)}</select>
          <label>Title</label><input value={paymentForm.title} onChange={e => setPaymentForm(p => ({ ...p, title: e.target.value }))} placeholder={paymentType === "in" ? "Customer advance / payment" : "Supplier / material / staff payment"} />
          <label>Notes</label><textarea rows="3" value={paymentForm.notes} onChange={e => setPaymentForm(p => ({ ...p, notes: e.target.value }))} />
          {paymentMessage && <p className="form-message">{paymentMessage}</p>}<button className="gold-button wide" disabled={paymentSaving}>{paymentSaving ? "Saving..." : "Save Payment"}</button>
        </form>
        <div className="section"><div className="section-heading"><h2>Payment History</h2></div>{paymentsLoading ? <LoadingText /> : payments.length === 0 ? <Empty text="No payments yet." /> : payments.map(p => <div className="list-card clickable payment-card" key={p.id} onClick={() => setSelectedPayment(p)}><div><strong>{p.payment_type === "in" ? "Payment In" : "Payment Out"} — {p.title || "Untitled"}</strong><span>{p.customer_name || p.ss_customers?.name || "No customer"} • {p.payment_date} • {p.payment_method}</span></div><b>{p.payment_type === "in" ? "+" : "−"} {money(p.amount)}</b></div>)}</div>
        {selectedPayment && <PaymentModal data={selectedPayment} customers={customers} bookings={bookings} invoices={invoices} expenses={expenses} onClose={() => setSelectedPayment(null)} />}
      </div>
    );
  }

  function renderExpenses() {
    return (
      <div className="dashboard">
        <PageHeader title="Expenses" action={<button className="secondary-button" onClick={() => setCurrentPage("home")}>← Back</button>} />
        <form className="form-card profile-form" onSubmit={saveExpense}>
          <h2>Add Expense</h2>
          <label>Title *</label><input value={expenseForm.title} onChange={e => setExpenseForm(p => ({ ...p, title: e.target.value }))} required />
          <label>Category</label><input value={expenseForm.category} onChange={e => setExpenseForm(p => ({ ...p, category: e.target.value }))} placeholder="Transport, decoration material, staff..." />
          <label>Amount *</label><input type="number" min="0" value={expenseForm.amount} onChange={e => setExpenseForm(p => ({ ...p, amount: e.target.value }))} required />
          <label>Date 📅</label><input type="date" value={expenseForm.expense_date} onChange={e => setExpenseForm(p => ({ ...p, expense_date: e.target.value }))} />
          <label>Payment Method</label>
          <select value={expenseForm.payment_method} onChange={e => setExpenseForm(p => ({ ...p, payment_method: e.target.value }))}>
            {PAYMENT_METHODS.map(x => <option key={x}>{x}</option>)}
          </select>
          <label>Notes</label><textarea rows="3" value={expenseForm.notes} onChange={e => setExpenseForm(p => ({ ...p, notes: e.target.value }))} />
          {expenseMessage && <p className="form-message">{expenseMessage}</p>}
          <button className="gold-button wide" disabled={expenseSaving}>{expenseSaving ? "Saving..." : "Save Expense"}</button>
        </form>

        <div className="section">
          <div className="section-heading"><h2>Expense History</h2></div>
          {expensesLoading ? <LoadingText /> : expenses.length === 0 ? <Empty text="No expenses yet." /> : expenses.map(x => (
            <div className="list-card clickable" key={x.id} onClick={() => setSelectedExpense(x)}>
              <div><strong>{x.title}</strong><span>{x.category || "General"} • {x.expense_date} • {x.payment_method}</span></div>
              <div className="right-stack"><b>{money(x.amount)}</b><button className="mini-danger" onClick={e => { e.stopPropagation(); deleteExpense(x); }}>Delete</button></div>
            </div>
          ))}
        </div>
        {selectedExpense && <ExpenseModal data={selectedExpense} onClose={() => setSelectedExpense(null)} />}
      </div>
    );
  }

  function renderNotes() {
    return (
      <div className="dashboard">
        <PageHeader title="Notes" action={<button className="secondary-button" onClick={() => setCurrentPage("home")}>← Back</button>} />
        <form className="form-card profile-form" onSubmit={saveNote}>
          <h2>{noteEditing ? "Edit Note" : "Add Note"}</h2>
          <label>Title</label><input value={noteForm.title} onChange={e => setNoteForm(p => ({ ...p, title: e.target.value }))} />
          <label>Note</label><textarea rows="5" value={noteForm.note} onChange={e => setNoteForm(p => ({ ...p, note: e.target.value }))} />
          <div className="two-col">
            <div><label>Priority</label><select value={noteForm.priority} onChange={e => setNoteForm(p => ({ ...p, priority: e.target.value }))}><option>Normal</option><option>High</option><option>Low</option></select></div>            <div><label>Status</label><select value={noteForm.status} onChange={e => setNoteForm(p => ({ ...p, status: e.target.value }))}><option>Open</option><option>Done</option></select></div>
          </div>
          {noteMessage && <p className="form-message">{noteMessage}</p>}
          <div className="button-row">
            <button className="gold-button" disabled={noteSaving}>{noteSaving ? "Saving..." : "Save Note"}</button>
            {noteEditing && <button type="button" className="secondary-button" onClick={() => { setNoteEditing(null); setNoteForm({ title: "", note: "", priority: "Normal", status: "Open" }); }}>Cancel Edit</button>}
          </div>
        </form>

        <div className="section">
          {notesLoading ? <LoadingText /> : notes.length === 0 ? <Empty text="No notes yet." /> : notes.map(n => (
            <div className="list-card clickable" key={n.id} onClick={() => setSelectedNote(n)}>
              <div><strong>{n.title || "Untitled"}</strong><span>{n.note} • {n.priority} • {n.status}</span></div>
              <div className="button-row compact"><button className="mini-button" onClick={() => editNote(n)}>Edit</button><button className="mini-danger" onClick={() => deleteNote(n)}>Delete</button></div>
            </div>
          ))}
        </div>
        {selectedNote && <Modal title={selectedNote.title || "Note"} onClose={() => setSelectedNote(null)}><div className="note-reader"><p>{selectedNote.note || "—"}</p><Detail label="Priority" value={selectedNote.priority} /><Detail label="Status" value={selectedNote.status} /></div></Modal>}
      </div>
    );
  }

  function renderCalendar() {
    const events = bookings.filter(b => b.event_date).map(b => ({ date: b.event_date, time: b.event_time, title: `${b.event_type || "Event"} — ${b.customer_name || b.ss_customers?.name || "Customer"}`, type: "Booking", booking: b }))
      .concat(bookings.filter(b => b.reminder_enabled && b.reminder_date && b.event_date && b.event_date >= today() && b.status !== "Completed" && b.status !== "Cancelled").map(b => ({ date: b.reminder_date, time: b.reminder_time, title: `🔔 ${b.event_type || "Event"} reminder`, type: "Reminder", booking: b })))
      .concat(invoices.filter(i => i.due_date).map(i => ({ date: i.due_date, time: "", title: `${i.invoice_number} payment due`, type: "Invoice Due", invoice: i })))
      .sort((a, b) => `${a.date} ${a.time || ""}`.localeCompare(`${b.date} ${b.time || ""}`));
    return <div className="dashboard">
      <PageHeader title="Calendar & Reminders" action={<button className="secondary-button" onClick={() => setCurrentPage("home")}>← Back</button>} />
      <div className="calendar-box clickable" onClick={() => setCurrentPage("bookings")}><div className="calendar-header"><span>📅</span><div><h2>Business Calendar</h2><p>Bookings and booking reminders. Invoice reminders are not used.</p></div></div></div>
      {events.length === 0 ? <Empty text="No calendar events yet." /> : events.map((e, index) => <div className="calendar-event clickable" key={`${e.date}-${e.title}-${index}`} onClick={() => { if (e.booking) { setSelectedBooking(e.booking); setCurrentPage("booking-detail"); } else if (e.invoice) { setSelectedInvoice(e.invoice); setCurrentPage("invoice-detail"); } }}><div className="calendar-date"><strong>{e.date}</strong><span>{e.time || "All day"}</span></div><div><b>{e.title}</b><span>{e.type}</span></div></div>)}
    </div>;
  }

  function renderSettings() {
    const sections = [
      { key: "customers", title: "Customer Fields" },
      { key: "bookings", title: "Booking Fields" },
      { key: "invoices", title: "Invoice Fields" }
    ];
    return <div className="dashboard">
      <PageHeader title="Settings" action={<button className="secondary-button" onClick={() => setCurrentPage("home")}>← Back</button>} />
      <form className="form-card profile-form" onSubmit={saveBusinessProfile}>
        <h2>Business Profile</h2>
        <label>Business Name</label><input value={businessName} onChange={e => setBusinessName(e.target.value)} />
        <label>Phone</label><input value={phone} onChange={e => setPhone(e.target.value)} />
        <label>WhatsApp</label><input value={whatsapp} onChange={e => setWhatsapp(e.target.value)} />
        <label>Address</label><textarea rows="3" value={address} onChange={e => setAddress(e.target.value)} />
        {profileMessage && <p className="form-message">{profileMessage}</p>}
        <button className="gold-button wide" disabled={profileSaving}>{profileSaving ? "Saving..." : "Save Business Profile"}</button>
      </form>

      <div className="customization-card branding-card">
        <div className="section-heading"><div><h2>Invoice Branding</h2><p>Upload your logo and digital signature. They automatically appear on A4 invoices.</p></div></div>
        <div className="two-col">
          <div className="upload-placeholder">
            <div className="upload-icon">🖼️</div><h3>Business Logo</h3><p>PNG/JPG, maximum 5MB.</p>
            {logoPreview && <><img src={logoPreview} className="settings-image" alt="Business logo" /><ImageActions url={logoPreview} label="Business Logo" /></>}
            <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/jpg" hidden onChange={e => { const f=e.target.files?.[0]; if(f) uploadPrivateImage(f,"logo"); e.target.value=""; }} />
            <button type="button" className="gold-button" onClick={() => logoInputRef.current?.click()} disabled={logoUploading}>{logoUploading ? "Uploading..." : logoPreview ? "Change Logo" : "Upload Logo"}</button>
            {logoMessage && <p className="form-message">{logoMessage}</p>}
          </div>
          <div className="upload-placeholder">
            <div className="upload-icon">✍️</div><h3>Digital Signature</h3><p>PNG/JPG, maximum 5MB. White background is removed automatically.</p>
            {signaturePreview && <><img src={signaturePreview} className="settings-signature" alt="Digital signature" /><ImageActions url={signaturePreview} label="Signature" /></>}
            <input ref={signatureInputRef} type="file" accept="image/png,image/jpeg,image/jpg" hidden onChange={e => { const f=e.target.files?.[0]; if(f) uploadPrivateImage(f,"signature"); e.target.value=""; }} />
            <button type="button" className="gold-button" onClick={() => signatureInputRef.current?.click()} disabled={signatureUploading}>{signatureUploading ? "Uploading..." : signaturePreview ? "Change Signature" : "Upload Signature"}</button>
            {signatureMessage && <p className="form-message">{signatureMessage}</p>}
          </div>
        </div>
      </div>

      <div className="customization-card notification-card">
        <div className="section-heading">
          <div>
            <h2>🔔 Notifications & Reminders</h2>
            <p>Booking reminders use Android notifications and scheduled alarms.</p>
          </div>
        </div>
        <div className="button-row">
          <button type="button" className="gold-button" onClick={requestReminderPermission}>
            Enable Notifications
          </button>
          <button type="button" className="secondary-button" onClick={testBookingNotification}>
            Test Notification (10 sec)
          </button>
        </div>
        {notificationMessage && <p className="form-message">{notificationMessage}</p>}
        <small className="field-hint">Android mein Notifications aur Alarms & reminders dono allow hone chahiye. Test button se pehle system check ho jayega.</small>
      </div>

      <div className="danger-zone"><h3>Delete Account</h3><p>This permanently deletes your account and the Shareef Sons business data connected to it.</p><button className="danger-button" onClick={handleDeleteAccount}>Delete Account</button></div>
    </div>;
  }

  function renderPage() {
    switch (currentPage) {
      case "customers": return renderCustomers();
      case "customer-detail": return renderCustomerDetail();
      case "bookings": return renderBookings();
      case "booking-form": return renderBookingForm();
      case "booking-detail": return renderBookingDetail();
      case "invoices": return renderInvoices();
      case "invoice-form": return renderInvoiceForm();
      case "invoice-detail": return renderInvoiceDetail();
      case "payments": return renderPayments();
      case "expenses": return renderExpenses();
      case "notes": return renderNotes();
      case "calendar": return renderCalendar();
      case "settings": return renderSettings();
      default: return renderHome();
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-title"><p className="eyebrow">SHAREEF SONS</p><h1>{currentPage === "home" ? "Business Dashboard" : pageTitle(currentPage)}</h1></div>
        <div className="global-search-wrap">
          <input className="global-search" value={globalSearch} onChange={e=>setGlobalSearch(e.target.value)} placeholder="Search customers, bookings, invoices..." autoComplete="off" />
          {globalSearch.trim() && <div className="global-search-results">{globalResults.length ? globalResults.map((r,i)=><button key={`${r.type}-${i}`} type="button" onClick={()=>{ if(r.page==="customer-detail") setSelectedCustomer(r.data); if(r.page==="booking-detail") setSelectedBooking(r.data); if(r.page==="invoice-detail") setSelectedInvoice(r.data); setCurrentPage(r.page); setGlobalSearch(""); }}><strong>{r.title}</strong><span>{r.type} • {r.sub}</span></button>) : <div className="search-empty">No matching records found.</div>}</div>}
        </div>
        <button className="more-toggle" onClick={() => setMoreOpen(v => !v)} aria-label="Open menu">☰</button>
      </header>

      {renderPage()}

      <nav className="bottom-nav">
        <button className={currentPage === "home" ? "active" : ""} onClick={() => setCurrentPage("home")}>⌂<span>Home</span></button>
        <button className={currentPage.startsWith("customer") ? "active" : ""} onClick={() => setCurrentPage("customers")}>♙<span>Customers</span></button>
        <button className={currentPage.startsWith("booking") ? "active" : ""} onClick={() => setCurrentPage("bookings")}>▣<span>Bookings</span></button>
        <button className={currentPage.startsWith("invoice") ? "active" : ""} onClick={() => setCurrentPage("invoices")}>▤<span>Invoices</span></button>
        <button className={["payments", "expenses", "notes", "calendar", "settings"].includes(currentPage) ? "active" : ""} onClick={() => setMoreOpen(true)}>☰<span>More</span></button>
      </nav>

      {moreOpen && <div className="side-menu-backdrop" onClick={() => setMoreOpen(false)}></div>}
      <aside className={`side-menu ${moreOpen ? "open" : ""}`}>
        <div className="side-menu-head"><strong>More</strong><button onClick={() => setMoreOpen(false)}>×</button></div>
        <button onClick={() => { setCurrentPage("payments"); setMoreOpen(false); }}>Payments</button>
        <button onClick={() => { setCurrentPage("expenses"); setMoreOpen(false); }}>Expenses</button>
        <button onClick={() => { setCurrentPage("notes"); setMoreOpen(false); }}>Notes</button>
        <button onClick={() => { setCurrentPage("calendar"); setMoreOpen(false); }}>Calendar & Reminders</button>
        <button onClick={() => { setCurrentPage("settings"); setMoreOpen(false); }}>⚙ Settings</button>
      </aside>
    </div>
  );
}

function PaymentModal({ data, customers, bookings, invoices, expenses, onClose }) {
  const rows = data.rows ? data.rows : [data];
  const isNet = data.__group === "net";
  return <Modal title={data.__group ? (isNet ? "Net Balance Details" : data.__group === "in" ? "Payment In Details" : "Payment Out Details") : (data.payment_type === "in" ? "Payment In Details" : "Payment Out Details")} onClose={onClose}>
    {data.rows && <div className="modal-summary"><strong>{data.__group === "in" ? money(rows.reduce((s,p)=>s+Number(p.amount||0),0)) : data.__group === "out" ? money(rows.reduce((s,p)=>s+Number(p.amount||0),0)) : ""}</strong><span>{rows.length} payment record(s)</span></div>}
    {isNet && <><Detail label="Payment In" value={money(rows.filter(p=>p.payment_type==="in").reduce((s,p)=>s+Number(p.amount||0),0))}/><Detail label="Payment Out" value={money(rows.filter(p=>p.payment_type==="out").reduce((s,p)=>s+Number(p.amount||0),0))}/><Detail label="Expenses" value={money((data.expenseRows||[]).reduce((s,e)=>s+Number(e.amount||0),0))}/><Detail label="Net" value={money(rows.filter(p=>p.payment_type==="in").reduce((s,p)=>s+Number(p.amount||0),0)-rows.filter(p=>p.payment_type==="out").reduce((s,p)=>s+Number(p.amount||0),0)-(data.expenseRows||[]).reduce((s,e)=>s+Number(e.amount||0),0))}/></>}
    <div className="modal-list">{rows.map(p => <div className="mini-detail-card" key={p.id}><strong>{p.payment_type === "in" ? "Payment In" : "Payment Out"} — {p.title || "Untitled"}</strong><Detail label="Customer" value={p.customer_name || p.ss_customers?.name || customers.find(c=>c.id===p.customer_id)?.name}/><Detail label="Amount" value={money(p.amount)}/><Detail label="Date" value={p.payment_date}/><Detail label="Method" value={p.payment_method}/><Detail label="Booking" value={bookings.find(b=>b.id===p.booking_id)?.event_type}/><Detail label="Invoice" value={invoices.find(i=>i.id===p.invoice_id)?.invoice_number}/><Detail label="Notes" value={p.notes}/></div>)}</div>
  </Modal>;
}

function ExpenseModal({ data, onClose }) { const rows = data.rows || [data]; return <Modal title="Expense Details" onClose={onClose}><div className="modal-list">{rows.map(x => <div className="mini-detail-card" key={x.id}><strong>{x.title || "Expense"}</strong><Detail label="Amount" value={money(x.amount)}/><Detail label="Category" value={x.category}/><Detail label="Date" value={x.expense_date}/><Detail label="Method" value={x.payment_method}/><Detail label="Notes" value={x.notes}/></div>)}</div></Modal>; }

function PageHeader({ title, action }) {
  return (
    <div className="page-heading">
      <div className="page-heading-back">{action}</div>
      <h2>{title}</h2>
      <div className="page-heading-space" />
    </div>
  );
}

function pageTitle(page) {
  const map = {
    customers: "Customers", "customer-detail": "Customer Details",
    bookings: "Bookings", "booking-form": "Booking",
    "booking-detail": "Booking Details", invoices: "Invoices",
    "invoice-form": "Invoice", "invoice-detail": "Invoice Details",
    payments: "Payments", expenses: "Expenses", notes: "Notes",
    calendar: "Calendar", settings: "Settings"
  };
  return map[page] || "Business Dashboard";
}

function Detail({ label, value }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <strong>{value === undefined || value === null || value === "" ? "—" : value}</strong>
    </div>
  );
}

function Empty({ text }) {
  return <div className="empty-card">{text}</div>;
}

function LoadingText() {
  return <div className="empty-card">Loading...</div>;
}

function Modal({ title, children, onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-head"><h2>{title}</h2><button onClick={onClose}>×</button></div>
        {children}
      </div>
    </div>
  );
}

export default App;