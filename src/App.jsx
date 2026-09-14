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
  customer_id: "", event_type: "Wedding", event_date: "", event_time: "",
  venue: "", guests: 0, package_name: "", services: "",
  total_amount: 0, advance_amount: 0, remaining_amount: 0,
  status: "Pending", notes: ""
};

const emptyInvoice = {
  customer_id: "", booking_id: "", invoice_number: "",
  invoice_date: new Date().toISOString().slice(0, 10),
  event_type: "Wedding", event_date: "", event_time: "",
  venue: "", items: "", subtotal: 0, discount: 0, total_amount: 0,
  paid_amount: 0, remaining_amount: 0, due_date: "", reminder_date: "",
  reminder_time: "", reminder_status: "Pending", notes: ""
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
  const [customerMessage, setCustomerMessage] = useState("");
  const [customerSaving, setCustomerSaving] = useState(false);

  const [editingCustomer, setEditingCustomer] = useState(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editWhatsapp, setEditWhatsapp] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editNotes, setEditNotes] = useState("");
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
    customer_id: "", booking_id: "", invoice_id: "", amount: 0,
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
  }, [session?.user?.id]);

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

    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${session.user.id}/${type}-${Date.now()}.${ext}`;
    const bucket = type === "logo" ? "ss-logos" : "ss-signatures";

    if (type === "logo") {
      setLogoUploading(true);
      setLogoMessage("");
    } else {
      setSignatureUploading(true);
      setSignatureMessage("");
    }

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      if (type === "logo") {
        setLogoMessage(uploadError.message);
        setLogoUploading(false);
      } else {
        setSignatureMessage(uploadError.message);
        setSignatureUploading(false);
      }
      return;
    }

    const { data: signed, error: signedError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 60 * 24 * 365);

    if (signedError) {
      if (type === "logo") {
        setLogoMessage(signedError.message);
        setLogoUploading(false);
      } else {
        setSignatureMessage(signedError.message);
        setSignatureUploading(false);
      }
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
      setLogoPreview(signed.signedUrl);
      setLogoMessage("Logo uploaded.");
    } else {
      setSignaturePreview(signed.signedUrl);
      setSignatureMessage("Signature uploaded.");
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
      notes: customerNotes.trim()
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
        notes: editNotes.trim()
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
        setSelectedCustomer({ ...editingCustomer, name: editName.trim(), phone: editPhone.trim(), whatsapp: editWhatsapp.trim(), address: editAddress.trim(), notes: editNotes.trim() });
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
    setBookingForm({ ...emptyBooking, customer_id: customerId });
    setBookingMessage("");
    setCurrentPage("booking-form");
  }

  function openEditBooking(booking) {
    setBookingEditing(booking);
    setBookingForm({
      ...emptyBooking,
      ...booking,
      customer_id: booking.customer_id || ""
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
      reminder_date: invoiceForm.reminder_date || null,
      reminder_time: invoiceForm.reminder_time || null,
      reminder_status: invoiceForm.reminder_status || "Pending",
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
      customer_id: "", booking_id: "", invoice_id: "", amount: 0,
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
    return invoices
      .filter(i => i.reminder_date && i.reminder_status !== "Done")
      .sort((a, b) => `${a.reminder_date} ${a.reminder_time || ""}`.localeCompare(`${b.reminder_date} ${b.reminder_time || ""}`));
  }, [invoices]);

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
    return (
      <div className="dashboard">
        <div className="welcome-card">
          <p>WELCOME BACK</p>
          <h2>{businessName}</h2>
          <span>Manage your complete event business from one place.</span>
        </div>

        <div className="stats-grid">
          <div className="stat-card"><span>Bookings</span><strong>{bookings.length}</strong></div>
          <div className="stat-card"><span>Income</span><strong>{money(totalIncome)}</strong></div>
          <div className="stat-card"><span>Expenses</span><strong>{money(totalPaymentOut + totalExpenses)}</strong></div>
          <div className="stat-card"><span>Pending</span><strong>{money(pendingAmount)}</strong></div>
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
          </div>
        </div>

        <div className="section">
          <div className="section-heading"><h2>Business Summary</h2></div>
          <div className="summary-grid">
            <div className="summary-card"><span>Profit</span><strong>{money(profit)}</strong></div>
            <div className="summary-card"><span>Payment Out</span><strong>{money(totalPaymentOut)}</strong></div>
            <div className="summary-card"><span>Other Expenses</span><strong>{money(totalExpenses)}</strong></div>
          </div>
        </div>

        <div className="section">
          <div className="section-heading"><h2>Upcoming Events</h2></div>
          {upcomingBookings.length === 0 ? <Empty text="No upcoming bookings." /> : upcomingBookings.map(b => (
            <div className="list-card" key={b.id} onClick={() => { setSelectedBooking(b); setCurrentPage("booking-detail"); }}>
              <div>
                <strong>{b.event_type}</strong>
                <span>{b.ss_customers?.name || "No customer"} • {b.venue || "Venue not set"}</span>
              </div>
              <b>{b.event_date || "No date"}</b>
            </div>
          ))}
        </div>

        <div className="section">
          <div className="section-heading"><h2>Pending Reminders</h2></div>
          {reminders.length === 0 ? <Empty text="No pending reminders." /> : reminders.slice(0, 5).map(i => (
            <div className="list-card" key={i.id} onClick={() => openEditInvoice(i)}>
              <div>
                <strong>{i.invoice_number}</strong>
                <span>{i.ss_customers?.name || "Customer"} • {i.reminder_date} {i.reminder_time || ""}</span>
              </div>
              <b>{i.reminder_status}</b>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderCustomers() {
    return (
      <div className="dashboard">
        <PageHeader title="Customers" action={<button className="gold-button" onClick={() => setShowCustomerForm(v => !v)}>＋ New Customer</button>} />

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
        <PageHeader title="Bookings" action={<button className="gold-button" onClick={() => openNewBooking()}>＋ New Booking</button>} />
        <input className="search-input" placeholder="Search bookings..." value={bookingSearch} onChange={e => setBookingSearch(e.target.value)} />
        {bookingsLoading ? <LoadingText /> : filteredBookings.length === 0 ? <Empty text="No bookings found." /> : (
          <div className="list-stack">
            {filteredBookings.map(b => (
              <div className="list-card clickable" key={b.id} onClick={() => { setSelectedBooking(b); setCurrentPage("booking-detail"); }}>
                <div>
                  <strong>{b.event_type} — {b.ss_customers?.name || "No customer"}</strong>
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
          <select value={bookingForm.customer_id} onChange={e => updateBookingField("customer_id", e.target.value)} required>
            <option value="">Select customer</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <label>Event Type</label>
          <select value={bookingForm.event_type} onChange={e => updateBookingField("event_type", e.target.value)}>
            {EVENT_TYPES.map(x => <option key={x}>{x}</option>)}
          </select>

          <div className="two-col">
            <div><label>Event Date</label><input type="date" value={bookingForm.event_date || ""} onChange={e => updateBookingField("event_date", e.target.value)} /></div>
            <div><label>Event Time</label><input type="time" value={bookingForm.event_time || ""} onChange={e => updateBookingField("event_time", e.target.value)} /></div>
          </div>

          <label>Venue</label><input value={bookingForm.venue} onChange={e => updateBookingField("venue", e.target.value)} />

          <div className="two-col">
            <div><label>Guests</label><input type="number" min="0" value={bookingForm.guests} onChange={e => updateBookingField("guests", e.target.value)} /></div>
            <div><label>Package</label><input value={bookingForm.package_name} onChange={e => updateBookingField("package_name", e.target.value)} /></div>
          </div>

          <label>Services</label><textarea rows="4" value={bookingForm.services} onChange={e => updateBookingField("services", e.target.value)} placeholder="Stage, lights, seating, decoration..." />

          <div className="two-col">
            <div><label>Total Amount</label><input type="number" min="0" value={bookingForm.total_amount} onChange={e => updateBookingField("total_amount", e.target.value)} /></div>
            <div><label>Advance</label><input type="number" min="0" value={bookingForm.advance_amount} onChange={e => updateBookingField("advance_amount", e.target.value)} /></div>
          </div>

          <label>Remaining</label><input type="number" value={bookingForm.remaining_amount} readOnly />

          <label>Status</label>
          <select value={bookingForm.status} onChange={e => updateBookingField("status", e.target.value)}>
            {STATUSES.map(x => <option key={x}>{x}</option>)}
          </select>

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
          <Detail label="Customer" value={selectedBooking.ss_customers?.name || customers.find(c => c.id === selectedBooking.customer_id)?.name} />
          <Detail label="Event Date" value={selectedBooking.event_date} />
          <Detail label="Event Time" value={selectedBooking.event_time} />
          <Detail label="Venue" value={selectedBooking.venue} />
          <Detail label="Guests" value={selectedBooking.guests} />
          <Detail label="Package" value={selectedBooking.package_name} />
          <Detail label="Services" value={selectedBooking.services} />
          <Detail label="Total" value={money(selectedBooking.total_amount)} />
          <Detail label="Advance" value={money(selectedBooking.advance_amount)} />
          <Detail label="Remaining" value={money(selectedBooking.remaining_amount)} />
          <Detail label="Notes" value={selectedBooking.notes} />
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
        <PageHeader title="Invoices" action={<button className="gold-button" onClick={() => openNewInvoice()}>＋ New Invoice</button>} />
        <input className="search-input" placeholder="Search invoices..." value={invoiceSearch} onChange={e => setInvoiceSearch(e.target.value)} />
        {invoicesLoading ? <LoadingText /> : filteredInvoices.length === 0 ? <Empty text="No invoices found." /> : (
          <div className="list-stack">
            {filteredInvoices.map(i => (
              <div className="list-card clickable" key={i.id} onClick={() => { setSelectedInvoice(i); setCurrentPage("invoice-detail"); }}>
                <div>
                  <strong>{i.invoice_number} — {i.ss_customers?.name || "No customer"}</strong>
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

          <label>Customer *</label>
          <select value={invoiceForm.customer_id} onChange={e => updateInvoiceField("customer_id", e.target.value)} required>
            <option value="">Select customer</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <label>Booking</label>
          <select value={invoiceForm.booking_id} onChange={e => {
            const b = bookings.find(x => x.id === e.target.value);
            if (b) {
              setInvoiceForm(prev => ({
                ...prev, booking_id: b.id, customer_id: b.customer_id || prev.customer_id,
                event_type: b.event_type || prev.event_type, event_date: b.event_date || "",
                event_time: b.event_time || "", venue: b.venue || "",
                subtotal: Number(b.total_amount || 0), paid_amount: Number(b.advance_amount || 0),
                total_amount: Number(b.total_amount || 0),
                remaining_amount: calcRemaining(b.total_amount, b.advance_amount)
              }));
            } else updateInvoiceField("booking_id", "");
          }}>
            <option value="">No booking / manual invoice</option>
            {bookings.map(b => <option key={b.id} value={b.id}>{b.event_date || "No date"} — {b.event_type} — {b.ss_customers?.name || "Customer"}</option>)}
          </select>

          <div className="two-col">
            <div><label>Invoice Date 📅</label><input type="date" value={invoiceForm.invoice_date || ""} onChange={e => updateInvoiceField("invoice_date", e.target.value)} /></div>
            <div><label>Event Date 📅</label><input type="date" value={invoiceForm.event_date || ""} onChange={e => updateInvoiceField("event_date", e.target.value)} /></div>
          </div>

          <div className="two-col">
            <div><label>Event Time ⏰</label><input type="time" value={invoiceForm.event_time || ""} onChange={e => updateInvoiceField("event_time", e.target.value)} /></div>
            <div><label>Due Date 📅</label><input type="date" value={invoiceForm.due_date || ""} onChange={e => updateInvoiceField("due_date", e.target.value)} /></div>
          </div>

          <label>Venue</label><input value={invoiceForm.venue} onChange={e => updateInvoiceField("venue", e.target.value)} />

          <label>Items / Services</label><textarea rows="5" value={invoiceForm.items} onChange={e => updateInvoiceField("items", e.target.value)} placeholder="Decoration, stage, lights, seating..." />

          <div className="three-col">
            <div><label>Subtotal</label><input type="number" min="0" value={invoiceForm.subtotal} onChange={e => updateInvoiceField("subtotal", e.target.value)} /></div>
            <div><label>Discount</label><input type="number" min="0" value={invoiceForm.discount} onChange={e => updateInvoiceField("discount", e.target.value)} /></div>
            <div><label>Total</label><input type="number" value={invoiceForm.total_amount} readOnly /></div>
          </div>

          <label>Paid Amount</label><input type="number" min="0" value={invoiceForm.paid_amount} onChange={e => updateInvoiceField("paid_amount", e.target.value)} />
          <label>Remaining Amount</label><input type="number" value={invoiceForm.remaining_amount} readOnly />

          <div className="reminder-box">
            <h3>🔔 Payment Reminder</h3>
            <div className="two-col">
              <div><label>Reminder Date 📅</label><input type="date" value={invoiceForm.reminder_date || ""} onChange={e => updateInvoiceField("reminder_date", e.target.value)} /></div>
              <div><label>Reminder Time ⏰</label><input type="time" value={invoiceForm.reminder_time || ""} onChange={e => updateInvoiceField("reminder_time", e.target.value)} /></div>
            </div>
            <label>Reminder Status</label>
            <select value={invoiceForm.reminder_status} onChange={e => updateInvoiceField("reminder_status", e.target.value)}>
              <option>Pending</option><option>Done</option>
            </select>
          </div>

          <label>Notes</label><textarea rows="3" value={invoiceForm.notes} onChange={e => updateInvoiceField("notes", e.target.value)} />

          {invoiceMessage && <p className="form-message">{invoiceMessage}</p>}
          <button className="gold-button wide" disabled={invoiceSaving}>{invoiceSaving ? "Saving..." : "Save Invoice"}</button>
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
            <Detail label="Customer" value={selectedInvoice.ss_customers?.name || customers.find(c => c.id === selectedInvoice.customer_id)?.name} />
            <Detail label="Invoice Date" value={selectedInvoice.invoice_date} />
            <Detail label="Event Type" value={selectedInvoice.event_type} />
            <Detail label="Event Date" value={selectedInvoice.event_date} />
            <Detail label="Event Time" value={selectedInvoice.event_time} />
            <Detail label="Venue" value={selectedInvoice.venue} />
            <Detail label="Due Date" value={selectedInvoice.due_date} />
            <Detail label="Reminder" value={`${selectedInvoice.reminder_date || "—"} ${selectedInvoice.reminder_time || ""}`} />
          </div>

          <div className="invoice-items"><h3>Items / Services</h3><p>{selectedInvoice.items || "—"}</p></div>
          <div className="invoice-total"><span>Subtotal</span><b>{money(selectedInvoice.subtotal)}</b><span>Discount</span><b>{money(selectedInvoice.discount)}</b><span>Total</span><b>{money(selectedInvoice.total_amount)}</b><span>Paid</span><b>{money(selectedInvoice.paid_amount)}</b><span>Remaining</span><b>{money(selectedInvoice.remaining_amount)}</b></div>
          <p className="invoice-notes"><strong>Notes:</strong> {selectedInvoice.notes || "—"}</p>
          {signaturePreview && <img src={signaturePreview} className="signature-preview" alt="Signature" />}

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
        <PageHeader title="Payments" />
        <div className="type-tabs">
          <button className={paymentType === "in" ? "active" : ""} onClick={() => setPaymentType("in")}>Payment In</button>
          <button className={paymentType === "out" ? "active" : ""} onClick={() => setPaymentType("out")}>Payment Out</button>
        </div>

        <form className="form-card profile-form" onSubmit={savePayment}>
          <h2>{paymentType === "in" ? "Receive Payment" : "Make Payment"}</h2>

          <label>Customer</label>
          <select value={paymentForm.customer_id} onChange={e => setPaymentForm(p => ({ ...p, customer_id: e.target.value }))}>
            <option value="">Optional</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <label>Booking</label>
          <select value={paymentForm.booking_id} onChange={e => setPaymentForm(p => ({ ...p, booking_id: e.target.value }))}>
            <option value="">Optional</option>
            {bookings.map(b => <option key={b.id} value={b.id}>{b.event_date} — {b.event_type}</option>)}
          </select>

          <label>Invoice</label>
          <select value={paymentForm.invoice_id} onChange={e => setPaymentForm(p => ({ ...p, invoice_id: e.target.value }))}>
            <option value="">Optional</option>
            {invoices.map(i => <option key={i.id} value={i.id}>{i.invoice_number} — {i.ss_customers?.name || "Customer"}</option>)}
          </select>

          <label>Amount</label><input type="number" min="0" value={paymentForm.amount} onChange={e => setPaymentForm(p => ({ ...p, amount: e.target.value }))} required />
          <label>Date 📅</label><input type="date" value={paymentForm.payment_date} onChange={e => setPaymentForm(p => ({ ...p, payment_date: e.target.value }))} />

          <label>Payment Method</label>
          <select value={paymentForm.payment_method} onChange={e => setPaymentForm(p => ({ ...p, payment_method: e.target.value }))}>
            {PAYMENT_METHODS.map(x => <option key={x}>{x}</option>)}
          </select>

          <label>Title</label><input value={paymentForm.title} onChange={e => setPaymentForm(p => ({ ...p, title: e.target.value }))} placeholder={paymentType === "in" ? "Customer advance / payment" : "Supplier / other payment"} />
          <label>Notes</label><textarea rows="3" value={paymentForm.notes} onChange={e => setPaymentForm(p => ({ ...p, notes: e.target.value }))} />

          {paymentMessage && <p className="form-message">{paymentMessage}</p>}
          <button className="gold-button wide" disabled={paymentSaving}>{paymentSaving ? "Saving..." : "Save Payment"}</button>
        </form>

        <div className="section">
          <div className="section-heading"><h2>Payment History</h2></div>
          {paymentsLoading ? <LoadingText /> : payments.length === 0 ? <Empty text="No payments yet." /> : payments.map(p => (
            <div className="list-card" key={p.id}>
              <div><strong>{p.title || (p.payment_type === "in" ? "Payment In" : "Payment Out")}</strong><span>{p.ss_customers?.name || "No customer"} • {p.payment_date} • {p.payment_method}</span></div>
              <b>{p.payment_type === "in" ? "+" : "-"} {money(p.amount)}</b>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderExpenses() {
    return (
      <div className="dashboard">
        <PageHeader title="Expenses" />
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
            <div className="list-card" key={x.id}>
              <div><strong>{x.title}</strong><span>{x.category || "General"} • {x.expense_date} • {x.payment_method}</span></div>
              <div className="right-stack"><b>{money(x.amount)}</b><button className="mini-danger" onClick={() => deleteExpense(x)}>Delete</button></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderNotes() {
    return (
      <div className="dashboard">
        <PageHeader title="Notes" />
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
            <div className="list-card" key={n.id}>
              <div><strong>{n.title || "Untitled"}</strong><span>{n.note} • {n.priority} • {n.status}</span></div>
              <div className="button-row compact"><button className="mini-button" onClick={() => editNote(n)}>Edit</button><button className="mini-danger" onClick={() => deleteNote(n)}>Delete</button></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderCalendar() {
    const events = [
      ...bookings.filter(b => b.event_date).map(b => ({ date: b.event_date, time: b.event_time, title: `${b.event_type} — ${b.ss_customers?.name || "Customer"}`, type: "Booking" })),
      ...invoices.filter(i => i.due_date).map(i => ({ date: i.due_date, time: "", title: `${i.invoice_number} payment due`, type: "Invoice Due" })),
      ...invoices.filter(i => i.reminder_date && i.reminder_status !== "Done").map(i => ({ date: i.reminder_date, time: i.reminder_time, title: `${i.invoice_number} reminder`, type: "Reminder" }))
    ].sort((a, b) => `${a.date} ${a.time || ""}`.localeCompare(`${b.date} ${b.time || ""}`));

    return (
      <div className="dashboard">
        <PageHeader title="Calendar & Reminders" />
        <div className="calendar-box">
          <div className="calendar-header"><span>📅</span><div><h2>Business Calendar</h2><p>Bookings, invoice due dates and reminders.</p></div></div>
        </div>

        {events.length === 0 ? <Empty text="No calendar events yet." /> : events.map((e, index) => (
          <div className="calendar-event" key={`${e.date}-${e.title}-${index}`}>
            <div className="calendar-date"><strong>{e.date}</strong><span>{e.time || "All day"}</span></div>
            <div><b>{e.title}</b><span>{e.type}</span></div>
          </div>
        ))}
      </div>
    );
  }

  function renderSettings() {
    return (
      <div className="dashboard">
        <PageHeader title="Settings" />
        <form className="form-card profile-form" onSubmit={saveBusinessProfile}>
          <h2>Business Profile</h2>
          <label>Business Name</label><input value={businessName} onChange={e => setBusinessName(e.target.value)} />
          <label>Phone</label><input value={phone} onChange={e => setPhone(e.target.value)} />
          <label>WhatsApp</label><input value={whatsapp} onChange={e => setWhatsapp(e.target.value)} />
          <label>Address</label><textarea rows="3" value={address} onChange={e => setAddress(e.target.value)} />
          {profileMessage && <p className="form-message">{profileMessage}</p>}
          <button className="gold-button wide" disabled={profileSaving}>{profileSaving ? "Saving..." : "Save Business Profile"}</button>
        </form>

        <div className="upload-placeholder">
          <div className="upload-icon">🖼️</div>
          <h3>Business Logo</h3>
          <p>Upload your luxury business logo. Maximum 5MB.</p>
          {logoPreview && <img src={logoPreview} className="settings-image" alt="Logo preview" />}
          <input ref={logoInputRef} type="file" accept="image/*" hidden onChange={e => uploadPrivateImage(e.target.files?.[0], "logo")} />
          <button onClick={() => logoInputRef.current?.click()} disabled={logoUploading}>{logoUploading ? "Uploading..." : "Choose Logo"}</button>
          {logoMessage && <p className="form-message">{logoMessage}</p>}
        </div>

        <div className="upload-placeholder">
          <div className="upload-icon">✍️</div>
          <h3>Digital Signature</h3>
          <p>Upload your signature for invoices. Maximum 5MB.</p>
          {signaturePreview && <img src={signaturePreview} className="settings-signature" alt="Signature preview" />}
          <input ref={signatureInputRef} type="file" accept="image/*" hidden onChange={e => uploadPrivateImage(e.target.files?.[0], "signature")} />
          <button onClick={() => signatureInputRef.current?.click()} disabled={signatureUploading}>{signatureUploading ? "Uploading..." : "Choose Signature"}</button>
          {signatureMessage && <p className="form-message">{signatureMessage}</p>}
        </div>

        <div className="section">
          <button className="logout-button" onClick={handleLogout}>Logout</button>
        </div>
      </div>
    );
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
        <button className="profile-button" onClick={() => setCurrentPage("settings")}>⚙ Settings</button>
      </header>

      {renderPage()}

      <nav className="bottom-nav">
        <button className={currentPage === "home" ? "active" : ""} onClick={() => setCurrentPage("home")}>⌂<span>Home</span></button>
        <button className={currentPage.startsWith("customer") ? "active" : ""} onClick={() => setCurrentPage("customers")}>♙<span>Customers</span></button>
        <button className={currentPage.startsWith("booking") ? "active" : ""} onClick={() => setCurrentPage("bookings")}>▣<span>Bookings</span></button>
        <button className={currentPage.startsWith("invoice") ? "active" : ""} onClick={() => setCurrentPage("invoices")}>▤<span>Invoices</span></button>
        <button className={["payments", "expenses", "notes", "calendar", "settings"].includes(currentPage) ? "active" : ""} onClick={() => setCurrentPage("settings")}>⚙<span>More</span></button>
      </nav>

      {currentPage === "settings" && null}
      <div className="more-shortcuts">
        <button onClick={() => setCurrentPage("payments")}>Payments</button>
        <button onClick={() => setCurrentPage("expenses")}>Expenses</button>
        <button onClick={() => setCurrentPage("notes")}>Notes</button>
        <button onClick={() => setCurrentPage("calendar")}>Calendar</button>
      </div>
    </div>
  );
}

function PageHeader({ title, action }) {
  return (
    <div className="page-heading">
      <h2>{title}</h2>
      {action}
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
