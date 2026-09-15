import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./lib/supabase";
import "./App.css";

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
  paid_amount: 0, remaining_amount: 0, due_date: "", custom_data: {}, attachments: [], notes: ""
};

function money(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-PK")}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function calcRemaining(total, paid) {
  return Math.max(Number(total || 0) - Number(paid || 0), 0);
}

function CustomFields({ fields = [], data = {}, onChange, section, onAdd }) {
  if (!fields.length) {
    return (
      <div className="custom-setup-card">
        <strong>Add your custom fields</strong>
        <span>Type your own field name and add it only when your business needs it.</span>
        {onAdd && <button type="button" className="custom-setup-button" onClick={() => onAdd(section)}>＋ Add Custom Field</button>}
      </div>
    );
  }
  return (
    <div className="custom-record-fields">
      <div className="custom-record-heading"><strong>Custom Fields</strong><span>Only the fields you created are shown here.</span></div>
      {fields.map(f => (
        <div key={f.id}>
          <label>{f.label}</label>
          <input value={data?.[f.id] || ""} placeholder={f.label} onChange={e => onChange({ ...data, [f.id]: e.target.value })} />
        </div>
      ))}
    </div>
  );
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

function SectionSetup({ section, onAdd }) {
  return (
    <div className="section-setup-screen">
      <div className="section-setup-icon">＋</div>
      <h3>Add your custom fields</h3>
      <p>This {section} section starts clean. Add only the fields your business needs.</p>
      <button type="button" className="gold-button" onClick={() => onAdd(section)}>＋ Add Custom Field</button>
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
              <span><b>{c.name}</b><small>{c.phone || c.whatsapp || "Saved customer"}</small></span><small>Select</small>
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
  const [customFields, setCustomFields] = useState({ customers: [], bookings: [], invoices: [] });
  const [customizing, setCustomizing] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
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
      const { data } = await supabase.auth.getSession();
      if (mounted) {
        setSession(data.session);
        setLoading(false);
      }
    }

    init();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

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
    loadCustomFields();
  }, [session?.user?.id]);

  async function loadCustomFields() {
    const { data, error } = await supabase.from("ss_app_customizations").select("*").eq("user_id", session.user.id).maybeSingle();
    if (!error && data) setCustomFields({ customers: data.customer_fields || [], bookings: data.booking_fields || [], invoices: data.invoice_fields || [] });
  }

  async function saveCustomFields(next) {
    setCustomFields(next);
    const { error } = await supabase.from("ss_app_customizations").upsert({
      user_id: session.user.id, customer_fields: next.customers || [], booking_fields: next.bookings || [], invoice_fields: next.invoices || []
    }, { onConflict: "user_id" });
    if (error) alert(error.message);
  }

  function addCustomField(section) {
    const label = window.prompt(`Field name for ${section}:`);
    if (!label?.trim()) return;
    const next = { ...customFields, [section]: [...(customFields[section] || []), { id: `${Date.now()}`, label: label.trim(), type: "text" }] };
    saveCustomFields(next);
  }

  function removeCustomField(section, id) {
    saveCustomFields({ ...customFields, [section]: (customFields[section] || []).filter(f => f.id !== id) });
  }

  function editCustomField(section, field) {
    const label = window.prompt("Edit field name", field.label);
    if (!label?.trim()) return;
    saveCustomFields({ ...customFields, [section]: (customFields[section] || []).map(f => f.id === field.id ? { ...f, label: label.trim() } : f) });
  }

  function requestReminderPermission() {
    if (typeof Notification !== "undefined" && Notification.permission === "default") Notification.requestPermission();
  }

  useEffect(() => {
    if (!session?.user?.id) return;
    loadCustomFields();
    const check = () => {
      const now = new Date();
      const todayText = today();
      const current = `${todayText} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const due = bookings.filter(b => b.reminder_enabled && b.reminder_date && b.event_date && b.event_date >= todayText && b.status !== "Completed" && b.status !== "Cancelled")
        .find(b => `${b.reminder_date} ${b.reminder_time || "00:00"}` <= current);
      if (due) {
        const key = `ss-reminder-${due.id}-${due.reminder_date}-${due.reminder_time || "00:00"}`;
        if (localStorage.getItem(key) !== "1") {
          const msg = `Reminder: ${due.event_type || "Event"} for ${due.customer_name || due.ss_customers?.name || "Customer"}${due.reminder_note ? ` — ${due.reminder_note}` : ""}`;
          setNotificationMessage(msg);
          localStorage.setItem(key, "1");
          if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification("Shareef Sons Reminder", { body: msg });
        }
      }
    };
    check();
    const timer = setInterval(check, 30000);
    return () => clearInterval(timer);
  }, [session?.user?.id, bookings]);

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
      setWhatsapp(data.whatsapp || "");
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
      whatsapp: whatsapp.trim(),
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
      whatsapp: whatsapp.trim(),
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
      whatsapp: customerWhatsapp.trim(),
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
    setEditWhatsapp(customer.whatsapp || "");
    setEditAddress(customer.address || "");
    setEditNotes(customer.notes || "");
    setEditCustomData(customer.custom_data || {});
    setEditMessage("");
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
        whatsapp: editWhatsapp.trim(),
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
        setSelectedCustomer({ ...editingCustomer, name: editName.trim(), phone: editPhone.trim(), whatsapp: editWhatsapp.trim(), address: editAddress.trim(), notes: editNotes.trim(), custom_data: editCustomData });
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
    if (!error) setBookings(data || []);
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
      ? supabase.from("ss_bookings").update(payload).eq("id", bookingEditing.id).eq("user_id", session.user.id)
      : supabase.from("ss_bookings").insert(payload);

    const { error } = await query;

    setBookingSaving(false);

    if (error) {
      setBookingMessage(error.message);
      return;
    }

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
      payment_method: "Cash", notes: ""
    });
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
      [c.name, c.phone, c.whatsapp, c.address].some(v => String(v || "").toLowerCase().includes(q))
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
  const monthlyIncome = monthPayments.filter(p => p.payment_type === "in").reduce((s, p) => s + Number(p.amount || 0), 0);
  const monthlyPaymentOut = monthPayments.filter(p => p.payment_type === "out").reduce((s, p) => s + Number(p.amount || 0), 0);
  const monthlyExpenses = monthExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const monthlyNet = monthlyIncome - monthlyPaymentOut - monthlyExpenses;

  if (loading) {
    return <div className="loading-screen">Loading...</div>;
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
    const monthLabel = new Date(`${selectedMonth}-01T00:00:00`).toLocaleDateString("en-PK", { month: "long", year: "numeric" });
    const openPayments = type => setSelectedPayment({ __group: type, rows: monthPayments.filter(p => p.payment_type === type) });
    return (
      <div className="dashboard">
        {notificationMessage && <div className="notification-banner" onClick={() => setNotificationMessage("")}>🔔 {notificationMessage}<span>×</span></div>}
        <div className="welcome-card">
          <p>WELCOME BACK</p><h2>{businessName}</h2><span>Manage your complete event business from one place.</span>
        </div>
        <div className="stats-grid">
          <button className="stat-card clickable" onClick={() => setCurrentPage("bookings")}><span>Bookings</span><strong>{bookings.length}</strong></button>
          <button className="stat-card clickable" onClick={() => openPayments("in")}><span>Income</span><strong>{money(monthlyIncome)}</strong></button>
          <button className="stat-card clickable" onClick={() => { setSelectedPayment({ __group: "out", rows: monthPayments.filter(p => p.payment_type === "out") }); }}><span>Payment Out</span><strong>{money(monthlyPaymentOut)}</strong></button>
          <button className="stat-card clickable" onClick={() => setSelectedExpense({ __group: "month", rows: monthExpenses })}><span>Expenses</span><strong>{money(monthlyExpenses)}</strong></button>
        </div>
        <div className="calculator-card">
          <div><h2>Monthly Business Calculator</h2><p>{monthLabel}</p></div>
          <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} />
          <div className="summary-grid">
            <button className="summary-card clickable" onClick={() => openPayments("in")}><span>Payment In</span><strong>{money(monthlyIncome)}</strong></button>
            <button className="summary-card clickable" onClick={() => setSelectedPayment({ __group: "out", rows: monthPayments.filter(p => p.payment_type === "out") })}><span>Payment Out</span><strong>{money(monthlyPaymentOut)}</strong></button>
            <button className="summary-card clickable" onClick={() => setSelectedExpense({ __group: "month", rows: monthExpenses })}><span>Expenses</span><strong>{money(monthlyExpenses)}</strong></button>
            <button className="summary-card net-card clickable" onClick={() => setSelectedPayment({ __group: "net", rows: monthPayments, expenseRows: monthExpenses })}><span>Net Balance</span><strong>{money(monthlyNet)}</strong></button>
          </div>
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
            <CustomFields fields={customFields.customers} data={customerCustomData} onChange={setCustomerCustomData} section="customers" onAdd={addCustomField} />
            {customerMessage && <p className="form-message">{customerMessage}</p>}
            <div className="button-row">
              <button className="gold-button" disabled={customerSaving}>{customerSaving ? "Saving..." : "Save Customer"}</button>
              <button type="button" className="secondary-button" onClick={() => setShowCustomerForm(false)}>Cancel</button>
            </div>
          </form>
        )}

        {customersLoading ? <LoadingText /> : filteredCustomers.length === 0 ? (!customerSearch && !(customFields.customers || []).length ? <SectionSetup section="customers" onAdd={addCustomField} /> : <Empty text="No customers found." />) : (
          <div className="list-stack">
            {filteredCustomers.map(c => (
              <div className="list-card clickable" key={c.id} onClick={() => { setSelectedCustomer(c); setCurrentPage("customer-detail"); }}>
                <div>
                  <strong>{c.name}</strong>
                  <span>{c.phone || c.whatsapp || "No phone"} {c.address ? `• ${c.address}` : ""}</span>
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
              <CustomFields fields={customFields.customers} data={editCustomData} onChange={setEditCustomData} section="customers" onAdd={addCustomField} />
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
          <Detail label="WhatsApp" value={selectedCustomer.whatsapp} />
          <Detail label="Address" value={selectedCustomer.address} />
          <Detail label="Notes" value={selectedCustomer.notes} />{(customFields.customers || []).map(f => <Detail key={f.id} label={f.label} value={selectedCustomer.custom_data?.[f.id]} />)}
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
        {bookingsLoading ? <LoadingText /> : filteredBookings.length === 0 ? (!bookingSearch && !(customFields.bookings || []).length ? <SectionSetup section="bookings" onAdd={addCustomField} /> : <Empty text="No bookings found." />) : (
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
          <SuggestionPicker value={bookingForm.event_type} options={EVENT_TYPES} placeholder="Type event or choose suggestion" onChange={v => updateBookingField("event_type", v)} />
          <div className="two-col"><div><label>Event Date</label><input type="date" value={bookingForm.event_date || ""} onChange={e => updateBookingField("event_date", e.target.value)} /></div><div><label>Event Time</label><input type="time" value={bookingForm.event_time || ""} onChange={e => updateBookingField("event_time", e.target.value)} /></div></div>
          <label>Venue</label><input value={bookingForm.venue} onChange={e => updateBookingField("venue", e.target.value)} />
          <div className="two-col"><div><label>Guests</label><input type="number" min="0" value={bookingForm.guests} onChange={e => updateBookingField("guests", e.target.value)} /></div><div><label>Package</label><input value={bookingForm.package_name} onChange={e => updateBookingField("package_name", e.target.value)} /></div></div>
          <label>Services</label><textarea rows="4" value={bookingForm.services} onChange={e => updateBookingField("services", e.target.value)} placeholder="Stage, lights, seating, decoration..." />
          <div className="two-col"><div><label>Total Amount</label><input type="number" min="0" value={bookingForm.total_amount} onChange={e => updateBookingField("total_amount", e.target.value)} /></div><div><label>Advance</label><input type="number" min="0" value={bookingForm.advance_amount} onChange={e => updateBookingField("advance_amount", e.target.value)} /></div></div>
          <label>Remaining</label><input type="number" value={bookingForm.remaining_amount} readOnly />
          <label>Status</label><select value={bookingForm.status} onChange={e => updateBookingField("status", e.target.value)}>{STATUSES.map(x => <option key={x}>{x}</option>)}</select>
          <div className="reminder-box booking-reminder"><div className="reminder-title"><div><h3>🔔 Booking Reminder</h3><p>Reminder stays active until the event is completed or its date has passed.</p></div><label className="switch"><input type="checkbox" checked={Boolean(bookingForm.reminder_enabled)} onChange={e => { updateBookingField("reminder_enabled", e.target.checked); if (e.target.checked) requestReminderPermission(); }} /><span></span></label></div>
            {bookingForm.reminder_enabled && <><div className="two-col"><div><label>Reminder Date</label><input type="date" value={bookingForm.reminder_date || ""} onChange={e => updateBookingField("reminder_date", e.target.value)} /></div><div><label>Reminder Time</label><input type="time" value={bookingForm.reminder_time || ""} onChange={e => updateBookingField("reminder_time", e.target.value)} /></div></div><label>Reminder Note</label><input value={bookingForm.reminder_note || ""} onChange={e => updateBookingField("reminder_note", e.target.value)} placeholder="What should we remember?" /></>}
          </div>
          <CustomFields fields={customFields.bookings} data={bookingForm.custom_data || {}} onChange={v => updateBookingField("custom_data", v)} section="bookings" onAdd={addCustomField} />
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
          <Detail label="Notes" value={selectedBooking.notes} />{(selectedBooking.attachments || []).length > 0 && <div className="detail-attachments"><strong>Files & Images</strong>{selectedBooking.attachments.map(a => <div className="saved-attachment" key={a.id || a.path}><span>{a.name}</span><ImageActions url={a.url} label={a.name} /></div>)}</div>}{(customFields.bookings || []).map(f => <Detail key={f.id} label={f.label} value={selectedBooking.custom_data?.[f.id]} />)}
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
        {invoicesLoading ? <LoadingText /> : filteredInvoices.length === 0 ? (!invoiceSearch && !(customFields.invoices || []).length ? <SectionSetup section="invoices" onAdd={addCustomField} /> : <Empty text="No invoices found." />) : (
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
          <CustomFields fields={customFields.invoices} data={invoiceForm.custom_data || {}} onChange={v => updateInvoiceField("custom_data", v)} section="invoices" onAdd={addCustomField} />
          <AttachmentUploader section="invoice" attachments={invoiceForm.attachments || []} onUpload={uploadAttachment} onRemove={removeAttachment} uploading={fileUploading} message={fileMessage} />
          <label>Notes</label><textarea rows="3" value={invoiceForm.notes} onChange={e => updateInvoiceField("notes", e.target.value)} />
          {invoiceMessage && <p className="form-message">{invoiceMessage}</p>}<button className="gold-button wide" disabled={invoiceSaving}>{invoiceSaving ? "Saving..." : "Save Invoice"}</button>
        </form>
      </div>
    );
  }

  function renderInvoiceDetail() {
    if (!selectedInvoice) return renderInvoices();
    return (
      <div className="dashboard">
        <PageHeader title="Invoice Details" action={<button className="secondary-button" onClick={() => setCurrentPage("invoices")}>← Back</button>} />
        <div className="invoice-paper">
          <div className="invoice-head">
            <div>
              {logoPreview && <img src={logoPreview} className="invoice-logo" alt="Business logo" />}
              <h2>{businessName}</h2>
              <p>{address}</p>
              <p>{phone} {whatsapp ? `• WhatsApp: ${whatsapp}` : ""}</p>
            </div>
            <div className="invoice-number"><span>INVOICE</span><strong>{selectedInvoice.invoice_number}</strong></div>
          </div>

          <div className="invoice-grid">
            <Detail label="Customer" value={selectedInvoice.customer_name || selectedInvoice.ss_customers?.name || customers.find(c => c.id === selectedInvoice.customer_id)?.name} />
            <Detail label="Invoice Date" value={selectedInvoice.invoice_date} />
            <Detail label="Event Type" value={selectedInvoice.event_type} />
            <Detail label="Event Date" value={selectedInvoice.event_date} />
            <Detail label="Event Time" value={selectedInvoice.event_time} />
            <Detail label="Venue" value={selectedInvoice.venue} />
            <Detail label="Due Date" value={selectedInvoice.due_date} />
          </div>

          <div className="invoice-items"><h3>Items / Services</h3><p>{selectedInvoice.items || "—"}</p></div>
          <div className="invoice-total"><span>Subtotal</span><b>{money(selectedInvoice.subtotal)}</b><span>Discount</span><b>{money(selectedInvoice.discount)}</b><span>Total</span><b>{money(selectedInvoice.total_amount)}</b><span>Paid</span><b>{money(selectedInvoice.paid_amount)}</b><span>Remaining</span><b>{money(selectedInvoice.remaining_amount)}</b></div>
          {(selectedInvoice.attachments || []).length > 0 && <div className="detail-attachments invoice-attachments"><strong>Files & Images</strong>{selectedInvoice.attachments.map(a => <div className="saved-attachment" key={a.id || a.path}><span>{a.name}</span><ImageActions url={a.url} label={a.name} /></div>)}</div>}\n          <div className="invoice-custom-fields">{(customFields.invoices || []).map(f => <Detail key={f.id} label={f.label} value={selectedInvoice.custom_data?.[f.id]} />)}</div><p className="invoice-notes"><strong>Notes:</strong> {selectedInvoice.notes || "—"}</p>
          {signaturePreview && <><img src={signaturePreview} className="signature-preview" alt="Signature" /><div className="no-print"><ImageActions url={signaturePreview} label="Signature" /></div></>}

          <div className="button-row no-print">
            <button className="gold-button" onClick={() => openEditInvoice(selectedInvoice)}>Edit</button>
            <button className="secondary-button" onClick={() => window.print()}>Print / Save PDF</button>
            <button className="danger-button" onClick={() => deleteInvoice(selectedInvoice)}>Delete</button>
          </div>
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
            <div><label>Priority</label><select value={noteForm.priority} onChange={e => setNoteForm(p => ({ ...p, priority: e.target.value }))}><option>Normal</option><option>High</option><option>Low</option></select></div>
            <div><label>Status</label><select value={noteForm.status} onChange={e => setNoteForm(p => ({ ...p, status: e.target.value }))}><option>Open</option><option>Done</option></select></div>
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

      <div className="info-card">
        <strong>Brand images</strong>
        <p>Logo and signature upload is kept out of the main screen. Existing saved logo/signature will continue to appear where configured.</p>
      </div>

      <div id="custom-fields-settings" className="customization-card">
        <div className="section-heading"><div><h2>Edit Custom Fields</h2><p>Add, rename or delete fields for Customers, Bookings and Invoices.</p></div></div>
        {sections.map(s => <div className="custom-section" key={s.key}>
          <div className="custom-section-head"><h3>{s.title}</h3><button type="button" className="gold-button" onClick={() => addCustomField(s.key)}>＋ Add Field</button></div>
          {(customFields[s.key] || []).length === 0 ? <p className="field-hint">No custom fields added yet.</p> : (customFields[s.key] || []).map(f => <div className="custom-field-row" key={f.id}><span>{f.label}</span><div className="button-row compact"><button type="button" className="mini-button" onClick={() => editCustomField(s.key, f)}>Edit</button><button type="button" className="mini-danger" onClick={() => removeCustomField(s.key, f.id)}>Delete</button></div></div>)}
        </div>)}
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
        <div>
          <p className="eyebrow">SHAREEF SONS</p>
          <h1>{currentPage === "home" ? "Business Dashboard" : pageTitle(currentPage)}</h1>
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
        <button onClick={() => { setCurrentPage("settings"); setMoreOpen(false); setTimeout(() => document.getElementById("custom-fields-settings")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80); }}>Edit Custom Fields</button>
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
