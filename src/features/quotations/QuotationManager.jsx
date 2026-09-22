import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Media } from "@capacitor-community/media";
import { Share } from "@capacitor/share";
import html2canvas from "html2canvas";
import "./quotation.css";

const STATUSES = ["Draft", "Sent", "Approved", "Rejected", "Expired"];

const emptyItem = () => ({ description: "", quantity: 1, rate: "" });

function money(value) {
  return Number(value || 0).toLocaleString("en-PK", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function makeQuotationNumber() {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  return `QT-${stamp}-${String(now.getTime()).slice(-5)}`;
}

function calculate(items, discount) {
  const subtotal = items.reduce(
    (sum, item) => sum + Number(item.quantity || 0) * Number(item.rate || 0),
    0
  );
  const safeDiscount = Math.min(Math.max(Number(discount || 0), 0), subtotal);
  return { subtotal, discount: safeDiscount, total: subtotal - safeDiscount };
}

export default function QuotationManager({ businessProfile = {}, onConvertToBooking, session }) {
  const [customers, setCustomers] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [form, setForm] = useState(null);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [viewQuotation, setViewQuotation] = useState(null);
  const [gallerySaving, setGallerySaving] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data: customerRows }, { data: quotationRows, error }] = await Promise.all([
      supabase.from("ss_customers").select("id,name,phone,whatsapp_number,address").order("name"),
      supabase.from("ss_quotations").select("*").order("created_at", { ascending: false }),
    ]);
    if (!error) setQuotations(quotationRows || []);
    setCustomers(customerRows || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const close = e => {
      if (!e.target.closest?.(".q-customer-picker")) setCustomerPickerOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
    };
  }, []);

  const customerMap = useMemo(
    () => Object.fromEntries(customers.map(c => [c.id, c])),
    [customers]
  );

  const visible = quotations.filter(q => {
    const customer = customerMap[q.customer_id];
    const text = [q.quotation_number, q.event_type, q.venue, customer?.name, customer?.phone]
      .filter(Boolean).join(" ").toLowerCase();
    return (!search || text.includes(search.toLowerCase())) &&
      (filter === "All" || q.status === filter);
  });

  function newQuotation() {
    setSelected(null);
    setForm({
      quotation_number: makeQuotationNumber(),
      customer_id: "",
      customer_name: "",
      event_type: "",
      event_date: "",
      event_time: "",
      venue: "",
      guests: "",
      package_name: "",
      services: "",
      valid_until: "",
      items: [emptyItem()],
      discount: 0,
      advance_required: 0,
      status: "Draft",
      notes: "",
      terms: "This quotation is subject to final confirmation of date, venue and selected services.",
    });
  }

  function editQuotation(q) {
    setSelected(q);
    setForm({
      ...q,
      customer_name: q.customer_name_snapshot || customerMap[q.customer_id]?.name || "",
      items: Array.isArray(q.items) && q.items.length ? q.items : [emptyItem()],
    });
  }

  function updateItem(index, key, value) {
    setForm(prev => ({
      ...prev,
      items: prev.items.map((item, i) => i === index ? { ...item, [key]: value } : item),
    }));
  }

  async function save() {
    if (!form?.customer_name?.trim()) return alert("Please enter or select a customer.");
    if (!form.items.some(i => i.description.trim())) return alert("Add at least one service or item.");

    const { subtotal, discount, total } = calculate(form.items, form.discount);
    setSaving(true);

    let customerId = form.customer_id || null;
    if (!customerId) {
      const { data: newCustomer, error: customerError } = await supabase
        .from("ss_customers")
        .insert({ user_id: session?.user?.id, name: form.customer_name.trim() })
        .select()
        .single();
      if (customerError) {
        setSaving(false);
        return alert(customerError.message);
      }
      customerId = newCustomer.id;
      setCustomers(prev => [...prev, newCustomer]);
    }

    const payload = {
      quotation_number: form.quotation_number,
      user_id: session?.user?.id,
      customer_id: customerId,
      event_type: form.event_type || null,
      event_date: form.event_date || null,
      event_time: form.event_time || null,
      venue: form.venue || null,
      guests: form.guests ? Number(form.guests) : null,
      package_name: form.package_name || null,
      services: form.services || null,
      valid_until: form.valid_until || null,
      customer_name_snapshot: form.customer_name.trim(),
      customer_phone_snapshot: customerMap[customerId]?.phone || null,
      customer_whatsapp_snapshot: customerMap[customerId]?.whatsapp_number || null,
      customer_address_snapshot: customerMap[customerId]?.address || null,
      business_name_snapshot: businessProfile.business_name || null,
      business_phone_snapshot: businessProfile.phone || null,
      business_whatsapp_snapshot: businessProfile.whatsapp_number || null,
      business_address_snapshot: businessProfile.address || null,
      business_logo_url_snapshot: businessProfile.logo_url || null,
      business_signature_url_snapshot: businessProfile.signature_url || null,
      sent_at: form.status === "Sent" ? (selected?.sent_at || new Date().toISOString()) : null,
      items: form.items.filter(i => i.description.trim()).map(i => ({
        description: i.description.trim(),
        quantity: Number(i.quantity || 1),
        rate: Number(i.rate || 0),
      })),
      subtotal,
      discount,
      total,
      advance_required: Number(form.advance_required || 0),
      status: form.status,
      notes: form.notes || null,
      terms: form.terms || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = selected
      ? await supabase.from("ss_quotations").update(payload).eq("id", selected.id)
      : await supabase.from("ss_quotations").insert(payload);

    setSaving(false);
    if (error) return alert(error.message);
    setForm(null);
    setSelected(null);
    await load();
  }

  async function remove(q) {
    if (!window.confirm(`Delete ${q.quotation_number}?`)) return;
    const { error } = await supabase.from("ss_quotations").delete().eq("id", q.id);
    if (error) return alert(error.message);
    if (selected?.id === q.id) { setSelected(null); setForm(null); }
    load();
  }

  function printQuotation(q) {
    const customer = customerMap[q.customer_id] || {};
    const items = Array.isArray(q.items) ? q.items : [];
    const logo = businessProfile.logo_url || "";
    const rows = items.map(i => `<tr><td>${escapeHtml(i.description)}</td><td>${i.quantity}</td><td>Rs. ${money(i.rate)}</td><td>Rs. ${money(Number(i.quantity) * Number(i.rate))}</td></tr>`).join("");
    const html = `<!doctype html><html><head><title>${q.quotation_number}</title><style>
      @page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#171717;margin:0;font-size:12px}
      .head{display:flex;justify-content:space-between;border-bottom:2px solid #c7a44a;padding-bottom:12px}.brand{display:flex;gap:12px;align-items:center}.logo{width:58px;height:58px;object-fit:contain}.name{font-size:20px;font-weight:800}.muted{color:#666;font-size:11px}
      h1{font-size:24px;margin:20px 0 5px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:10px;background:#f7f6f2;padding:12px;border-radius:8px;margin:15px 0}
      table{width:100%;border-collapse:collapse;margin-top:15px}th,td{padding:9px;border-bottom:1px solid #ddd;text-align:left}th{background:#171717;color:#fff}td:nth-child(n+2),th:nth-child(n+2){text-align:right}
      .totals{margin-left:auto;width:260px;margin-top:15px}.line{display:flex;justify-content:space-between;padding:5px 0}.grand{font-size:16px;font-weight:800;border-top:2px solid #171717;margin-top:5px;padding-top:8px}
      .notes{margin-top:25px}.footer{margin-top:50px;display:flex;justify-content:space-between}.sign{min-width:180px;border-top:1px solid #444;padding-top:6px;text-align:center}
      </style></head><body><div class="head"><div class="brand">${logo ? `<img class="logo" src="${escapeAttr(logo)}">` : ""}<div><div class="name">${escapeHtml(businessProfile.business_name || "Shareef Sons Events Organizer")}</div><div class="muted">${escapeHtml(businessProfile.address || "")}</div><div class="muted">${escapeHtml(businessProfile.phone || "")}</div></div></div><div><b>QUOTATION</b><br>${escapeHtml(q.quotation_number)}<br><span class="muted">${q.created_at ? new Date(q.created_at).toLocaleDateString("en-GB") : ""}</span></div></div>
      <h1>Quotation</h1><div class="meta"><div><b>Customer</b><br>${escapeHtml(customer.name || "")}<br>${escapeHtml(customer.phone || "")}<br>${escapeHtml(customer.address || "")}</div><div><b>Event</b><br>${escapeHtml(q.event_type || "Event")}<br>Date: ${escapeHtml(q.event_date || "TBC")} ${escapeHtml(q.event_time || "")}<br>Venue: ${escapeHtml(q.venue || "TBC")}<br>Guests: ${escapeHtml(String(q.guests || "TBC"))}</div></div>
      <table><thead><tr><th>Service / Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="totals"><div class="line"><span>Subtotal</span><b>Rs. ${money(q.subtotal)}</b></div><div class="line"><span>Discount</span><b>Rs. ${money(q.discount)}</b></div><div class="line grand"><span>Total</span><b>Rs. ${money(q.total)}</b></div><div class="line"><span>Advance required</span><b>Rs. ${money(q.advance_required)}</b></div></div>
      ${q.notes ? `<div class="notes"><b>Notes</b><p>${escapeHtml(q.notes)}</p></div>` : ""}<div class="notes"><b>Terms & Conditions</b><p>${escapeHtml(q.terms || "")}</p></div>
      <div class="footer"><div class="sign">Customer Approval</div><div class="sign">Authorized Signature</div></div><script>window.onload=()=>window.print()<\/script></body></html>`;
    const win = window.open("", "_blank", "width=900,height=1000");
    if (!win) return alert("Please allow pop-ups to print the quotation.");
    win.document.write(html); win.document.close();
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m]));
  }
  function escapeAttr(value) { return escapeHtml(value); }

  function quotationShareText(q) {
    const customer = customerMap[q.customer_id] || {};
    return [
      `Quotation: ${q.quotation_number}`,
      `Customer: ${q.customer_name_snapshot || customer.name || "Customer"}`,
      `Event: ${q.event_type || "Event"}`,
      q.event_date ? `Date: ${q.event_date}` : "",
      q.venue ? `Venue: ${q.venue}` : "",
      `Total: Rs. ${money(q.total)}`,
      q.advance_required ? `Advance Required: Rs. ${money(q.advance_required)}` : "",
      `Status: ${q.status}`,
    ].filter(Boolean).join("\\n");
  }

  async function shareQuotation(q) {
    const text = quotationShareText(q);
    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share({ title: `Quotation ${q.quotation_number}`, text, dialogTitle: "Share Quotation" });
      } else if (navigator.share) {
        await navigator.share({ title: `Quotation ${q.quotation_number}`, text });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        alert("Quotation details copied. WhatsApp mein paste kar sakte hain.");
      } else {
        alert(text);
      }
    } catch (e) {
      if (e?.name !== "AbortError") alert(e?.message || "Could not share quotation.");
    }
  }

  function quotationMarkup(q) {
    const customer = customerMap[q.customer_id] || {};
    const items = Array.isArray(q.items) ? q.items : [];
    const logo = q.business_logo_url_snapshot || businessProfile.logo_url || "";
    const businessName = q.business_name_snapshot || businessProfile.business_name || "Shareef Sons Events Organizer";
    const businessAddress = q.business_address_snapshot || businessProfile.address || "";
    const businessPhone = q.business_phone_snapshot || businessProfile.phone || "";
    const rows = items.map(i => `<tr><td>${escapeHtml(i.description)}</td><td>${i.quantity}</td><td>Rs. ${money(i.rate)}</td><td>Rs. ${money(Number(i.quantity) * Number(i.rate))}</td></tr>`).join("");
    return `
      <div class="q-a4-brand">
        <div class="q-a4-brand-left">${logo ? `<img src="${escapeAttr(logo)}" crossorigin="anonymous" alt="">` : ""}<div><div class="q-a4-business-name">${escapeHtml(businessName)}</div><div class="q-a4-muted">${escapeHtml(businessAddress)}</div><div class="q-a4-muted">${escapeHtml(businessPhone)}</div></div></div>
        <div class="q-a4-number"><b>QUOTATION</b><br>${escapeHtml(q.quotation_number)}<br><span>${q.created_at ? new Date(q.created_at).toLocaleDateString("en-GB") : ""}</span></div>
      </div>
      <h1 class="q-a4-title">Quotation</h1>
      <div class="q-a4-meta">
        <div><b>Customer</b><br>${escapeHtml(q.customer_name_snapshot || customer.name || "Customer")}<br>${escapeHtml(q.customer_phone_snapshot || customer.phone || "")}<br>${escapeHtml(q.customer_address_snapshot || customer.address || "")}</div>
        <div><b>Event</b><br>${escapeHtml(q.event_type || "Event")}<br>Date: ${escapeHtml(q.event_date || "TBC")} ${escapeHtml(q.event_time || "")}<br>Venue: ${escapeHtml(q.venue || "TBC")}<br>Guests: ${escapeHtml(String(q.guests || "TBC"))}</div>
      </div>
      <table class="q-a4-table"><thead><tr><th>Service / Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="q-a4-totals"><div><span>Subtotal</span><b>Rs. ${money(q.subtotal)}</b></div><div><span>Discount</span><b>Rs. ${money(q.discount)}</b></div><div class="grand"><span>Total</span><b>Rs. ${money(q.total)}</b></div><div><span>Advance required</span><b>Rs. ${money(q.advance_required)}</b></div></div>
      ${q.notes ? `<div class="q-a4-notes"><b>Notes</b><p>${escapeHtml(q.notes)}</p></div>` : ""}
      <div class="q-a4-notes"><b>Terms & Conditions</b><p>${escapeHtml(q.terms || "")}</p></div>
      <div class="q-a4-signs"><div>Customer Approval</div><div>Authorized Signature</div></div>
    `;
  }

  async function saveQuotationToGallery(q) {
    setGallerySaving(true);
    let sheet = null;
    try {
      sheet = document.createElement("div");
      sheet.className = "q-a4-sheet q-gallery-capture";
      sheet.innerHTML = quotationMarkup(q);
      document.body.appendChild(sheet);
      await Promise.all(Array.from(sheet.querySelectorAll("img")).map(img => new Promise(resolve => {
        if (img.complete) return resolve();
        img.onload = resolve; img.onerror = resolve;
      })));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const canvas = await html2canvas(sheet, { scale: 2, useCORS: true, allowTaint: false, backgroundColor: "#fff", width: 794, windowWidth: 794 });
      const dataUrl = canvas.toDataURL("image/png");
      const base64 = dataUrl.split(",")[1];
      const safeNumber = String(q.quotation_number || "quotation").replace(/[^a-zA-Z0-9_-]/g, "-");
      const fileName = `quotation-${safeNumber}-${Date.now()}.png`;

      if (Capacitor.isNativePlatform()) {
        const permission = await Media.requestPermissions().catch(() => null);
        const granted = !permission || permission.photos === "granted" || permission.photos === "limited" || permission.display === "granted";
        if (!granted) throw new Error("Gallery permission allow karein.");
        const written = await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache, recursive: true });
        await Media.savePhoto({ path: written.uri, albumName: "Shareef Sons Quotations" });
        alert("Quotation Gallery mein save ho gayi.");
      } else {
        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = fileName;
        link.click();
        alert("Quotation image save/download ho gayi.");
      }
    } catch (e) {
      console.error("Quotation gallery save error", e);
      alert(e?.message || "Quotation gallery mein save nahi ho saki.");
    } finally {
      sheet?.remove();
      setGallerySaving(false);
    }
  }

  function convertToInvoice(q) {
    const customer = customerMap[q.customer_id] || {};
    const itemsText = (Array.isArray(q.items) ? q.items : [])
      .filter(i => i.description)
      .map(i => `${i.description} x${i.quantity} @ Rs. ${money(i.rate)} = Rs. ${money(Number(i.quantity) * Number(i.rate))}`)
      .join("\\n");
    onConvertToInvoice?.({
      ...q,
      customer_name_snapshot: q.customer_name_snapshot || customer.name || "",
      customer_phone_snapshot: q.customer_phone_snapshot || customer.phone || "",
      itemsText
    });
  }

  async function approveAndBook(q) {
    const approvedAt = new Date().toISOString();
    const next = { ...q, status: "Approved", approved_at: approvedAt };
    const { error } = await supabase
      .from("ss_quotations")
      .update({
        status: "Approved",
        approved_at: approvedAt,
        updated_at: approvedAt
      })
      .eq("id", q.id);
    if (error) {
      alert(error.message);
      return;
    }
    if (onConvertToBooking) {
      onConvertToBooking(next, customerMap[q.customer_id] || { id: q.customer_id || "", name: q.customer_name_snapshot || "" });
    } else {
      alert("Quotation approved.");
    }
    load();
  }

  if (form) {
    const totals = calculate(form.items, form.discount);
    return <div className="quotation-page">
      <div className="quotation-top"><button className="q-back" onClick={() => setForm(null)}>← Back</button><div><h2>{selected ? "Edit Quotation" : "New Quotation"}</h2><p>{form.quotation_number}</p></div><div /></div>
      <div className="q-form-grid">
        <section className="q-card"><h3>Customer & Event</h3>
          <label>Customer
            <div className="q-customer-picker">
              <input value={form.customer_name || ""} onFocus={() => setCustomerPickerOpen(true)} onChange={e => {
                const value = e.target.value;
                const match = customers.find(c => String(c.name || "").toLowerCase() === value.trim().toLowerCase());
                setForm({ ...form, customer_name: value, customer_id: match?.id || "" });
                setCustomerPickerOpen(true);
              }} placeholder="Type customer name or select saved customer" autoComplete="off" />
              {customerPickerOpen && (
                <div className="q-suggestion-menu">
                  {customers.filter(c => String(c.name || "").toLowerCase().includes(String(form.customer_name || "").trim().toLowerCase())).slice(0,8).map(c => (
                    <button type="button" key={c.id} onClick={() => { setForm({ ...form, customer_name: c.name, customer_id: c.id }); setCustomerPickerOpen(false); }}>
                      <span><b>{c.name}</b><small>{c.phone || c.whatsapp_number || "Saved customer"}</small></span><small>Select</small>
                    </button>
                  ))}
                  {!customers.some(c => String(c.name || "").toLowerCase().includes(String(form.customer_name || "").trim().toLowerCase())) && <div className="q-suggestion-empty">No saved match. You can keep typing a new customer name.</div>}
                </div>
              )}
            </div>
            <small className="q-hint">Manual name bhi likh sakte hain. Pehle letters type karne par saved customers suggestions ayengi.</small>
          </label>
          <div className="q-two"><label>Event Type<input value={form.event_type||""} onChange={e=>setForm({...form,event_type:e.target.value})} placeholder="Wedding, Mehndi..." /></label><label>Guests<input type="number" value={form.guests||""} onChange={e=>setForm({...form,guests:e.target.value})} /></label></div>
          <div className="q-two"><label>Event Date<input type="date" value={form.event_date||""} onChange={e=>setForm({...form,event_date:e.target.value})} /></label><label>Event Time<input type="time" value={form.event_time||""} onChange={e=>setForm({...form,event_time:e.target.value})} /></label></div>
          <label>Venue<input value={form.venue||""} onChange={e=>setForm({...form,venue:e.target.value})} placeholder="Venue / Hall / Address" /></label>
          <label>Package<input value={form.package_name||""} onChange={e=>setForm({...form,package_name:e.target.value})} placeholder="Standard, Premium..." /></label>
          <label>Services<textarea value={form.services||""} onChange={e=>setForm({...form,services:e.target.value})} rows="2" placeholder="Stage, lights, decor, catering..." /></label>
          <div className="q-two"><label>Valid Until<input type="date" value={form.valid_until||""} onChange={e=>setForm({...form,valid_until:e.target.value})} /></label><label>Status<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>{STATUSES.map(s=><option key={s}>{s}</option>)}</select></label></div>
        </section>
        <section className="q-card"><h3>Services & Pricing</h3>
          <div className="q-items">{form.items.map((item,i)=><div className="q-item" key={i}><input value={item.description} onChange={e=>updateItem(i,"description",e.target.value)} placeholder="Service / item" /><input type="number" min="1" value={item.quantity} onChange={e=>updateItem(i,"quantity",e.target.value)} placeholder="Qty" /><input type="number" min="0" value={item.rate} onChange={e=>updateItem(i,"rate",e.target.value)} placeholder="Rate" /><button onClick={()=>setForm({...form,items:form.items.filter((_,x)=>x!==i)})} disabled={form.items.length===1}>×</button></div>)}</div>
          <button className="q-add" onClick={()=>setForm({...form,items:[...form.items,emptyItem()]})}>+ Add Service</button>
          <div className="q-totals"><div>Subtotal <b>Rs. {money(totals.subtotal)}</b></div><label>Discount <input type="number" min="0" value={form.discount||0} onChange={e=>setForm({...form,discount:e.target.value})}/></label><div className="q-total">Total <b>Rs. {money(totals.total)}</b></div><label>Advance Required <input type="number" min="0" value={form.advance_required||0} onChange={e=>setForm({...form,advance_required:e.target.value})}/></label></div>
        </section>
        <section className="q-card q-full"><h3>Notes & Terms</h3><label>Notes<textarea value={form.notes||""} onChange={e=>setForm({...form,notes:e.target.value})} rows="3" placeholder="Special requirements..." /></label><label>Terms & Conditions<textarea value={form.terms||""} onChange={e=>setForm({...form,terms:e.target.value})} rows="4" /></label></section>
      </div>
      <div className="q-form-footer"><button className="q-back" onClick={() => setForm(null)}>← Back</button><button className="q-primary q-save-bottom" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Quotation"}</button></div>
    </div>;
  }

  return <div className="quotation-page">
    <div className="quotation-top"><button className="q-back" onClick={() => window.history.back()}>← Back</button><div><h2>Quotations</h2><p>Create professional A4 quotations before confirming a booking.</p></div><button className="q-primary" onClick={newQuotation}>+ New Quotation</button></div>
    <div className="q-toolbar"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search quotation or customer..." /><select value={filter} onChange={e=>setFilter(e.target.value)}><option>All</option>{STATUSES.map(s=><option key={s}>{s}</option>)}</select></div>
    {loading ? <div className="q-empty">Loading quotations...</div> : !visible.length ? <div className="q-empty"><b>No quotations yet</b><span>Create your first quotation for a customer.</span></div> :
      <div className="q-list">{visible.map(q=>{const c=customerMap[q.customer_id]||{};return <article className="q-row" key={q.id}><div className="q-row-main"><strong>{q.quotation_number}</strong><span>{c.name || "Customer"} · {q.event_type || "Event"}</span><small>{q.event_date || "Date TBC"} · Rs. {money(q.total)}</small></div><span className={`q-status q-${q.status.toLowerCase()}`}>{q.status}</span><div className="q-actions"><button onClick={()=>setViewQuotation(q)}>View</button><button onClick={()=>editQuotation(q)}>Edit</button><button onClick={()=>shareQuotation(q)}>Share</button><button onClick={()=>saveQuotationToGallery(q)} disabled={gallerySaving}>{gallerySaving ? "Saving..." : "Save in Gallery"}</button><button onClick={()=>convertToInvoice(q)}>Convert Invoice</button>{q.status!=="Approved"&&<button onClick={()=>approveAndBook(q)}>Convert Booking</button>}<button className="danger" onClick={()=>remove(q)}>Delete</button></div></article>})}</div>}
  </div>
    {viewQuotation && (
      <div className="q-view-backdrop" onClick={() => setViewQuotation(null)}>
        <div className="q-view-card" onClick={e => e.stopPropagation()}>
          <div className="q-view-head"><div><b>View Quotation</b><span>{viewQuotation.quotation_number}</span></div><button onClick={() => setViewQuotation(null)}>×</button></div>
          <div className="q-view-sheet" dangerouslySetInnerHTML={{ __html: quotationMarkup(viewQuotation) }} />
          <div className="q-view-actions">
            <button className="q-back" onClick={() => setViewQuotation(null)}>Close</button>
            <button className="q-primary" onClick={() => shareQuotation(viewQuotation)}>Share</button>
            <button className="q-primary" onClick={() => saveQuotationToGallery(viewQuotation)}>Save in Gallery</button>
            <button className="q-primary" onClick={() => convertToInvoice(viewQuotation)}>Convert Invoice</button>
          </div>
        </div>
      </div>
    )}
  </div>;}
