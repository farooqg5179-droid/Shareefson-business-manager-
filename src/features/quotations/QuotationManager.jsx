import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
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

export default function QuotationManager({ businessProfile = {}, onConvertToBooking }) {
  const [customers, setCustomers] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [form, setForm] = useState(null);

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

  useEffect(() => { load(); }, []);

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
      event_type: "",
      event_date: "",
      event_time: "",
      venue: "",
      guests: "",
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
    if (!form?.customer_id) return alert("Please select a customer.");
    if (!form.items.some(i => i.description.trim())) return alert("Add at least one service or item.");

    const { subtotal, discount, total } = calculate(form.items, form.discount);
    setSaving(true);

    const payload = {
      quotation_number: form.quotation_number,
      customer_id: form.customer_id,
      event_type: form.event_type || null,
      event_date: form.event_date || null,
      event_time: form.event_time || null,
      venue: form.venue || null,
      guests: form.guests ? Number(form.guests) : null,
      valid_until: form.valid_until || null,
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

  async function approveAndBook(q) {
    const next = { ...q, status: "Approved" };
    await supabase.from("ss_quotations").update({ status: "Approved", updated_at: new Date().toISOString() }).eq("id", q.id);
    if (onConvertToBooking) onConvertToBooking(next, customerMap[q.customer_id]);
    else alert("Quotation approved. Connect onConvertToBooking to open the existing Booking form.");
    load();
  }

  if (form) {
    const totals = calculate(form.items, form.discount);
    return <div className="quotation-page">
      <div className="quotation-top"><button className="q-back" onClick={() => setForm(null)}>← Back</button><div><h2>{selected ? "Edit Quotation" : "New Quotation"}</h2><p>{form.quotation_number}</p></div><button className="q-primary" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Quotation"}</button></div>
      <div className="q-form-grid">
        <section className="q-card"><h3>Customer & Event</h3>
          <label>Customer<select value={form.customer_id} onChange={e => setForm({...form,customer_id:e.target.value})}><option value="">Select customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name} {c.phone ? `• ${c.phone}` : ""}</option>)}</select></label>
          <div className="q-two"><label>Event Type<input value={form.event_type||""} onChange={e=>setForm({...form,event_type:e.target.value})} placeholder="Wedding, Mehndi..." /></label><label>Guests<input type="number" value={form.guests||""} onChange={e=>setForm({...form,guests:e.target.value})} /></label></div>
          <div className="q-two"><label>Event Date<input type="date" value={form.event_date||""} onChange={e=>setForm({...form,event_date:e.target.value})} /></label><label>Event Time<input type="time" value={form.event_time||""} onChange={e=>setForm({...form,event_time:e.target.value})} /></label></div>
          <label>Venue<input value={form.venue||""} onChange={e=>setForm({...form,venue:e.target.value})} placeholder="Venue / Hall / Address" /></label>
          <div className="q-two"><label>Valid Until<input type="date" value={form.valid_until||""} onChange={e=>setForm({...form,valid_until:e.target.value})} /></label><label>Status<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>{STATUSES.map(s=><option key={s}>{s}</option>)}</select></label></div>
        </section>
        <section className="q-card"><h3>Services & Pricing</h3>
          <div className="q-items">{form.items.map((item,i)=><div className="q-item" key={i}><input value={item.description} onChange={e=>updateItem(i,"description",e.target.value)} placeholder="Service / item" /><input type="number" min="1" value={item.quantity} onChange={e=>updateItem(i,"quantity",e.target.value)} placeholder="Qty" /><input type="number" min="0" value={item.rate} onChange={e=>updateItem(i,"rate",e.target.value)} placeholder="Rate" /><button onClick={()=>setForm({...form,items:form.items.filter((_,x)=>x!==i)})} disabled={form.items.length===1}>×</button></div>)}</div>
          <button className="q-add" onClick={()=>setForm({...form,items:[...form.items,emptyItem()]})}>+ Add Service</button>
          <div className="q-totals"><div>Subtotal <b>Rs. {money(totals.subtotal)}</b></div><label>Discount <input type="number" min="0" value={form.discount||0} onChange={e=>setForm({...form,discount:e.target.value})}/></label><div className="q-total">Total <b>Rs. {money(totals.total)}</b></div><label>Advance Required <input type="number" min="0" value={form.advance_required||0} onChange={e=>setForm({...form,advance_required:e.target.value})}/></label></div>
        </section>
        <section className="q-card q-full"><h3>Notes & Terms</h3><label>Notes<textarea value={form.notes||""} onChange={e=>setForm({...form,notes:e.target.value})} rows="3" placeholder="Special requirements..." /></label><label>Terms & Conditions<textarea value={form.terms||""} onChange={e=>setForm({...form,terms:e.target.value})} rows="4" /></label></section>
      </div>
    </div>;
  }

  return <div className="quotation-page">
    <div className="quotation-top"><div><h2>Quotations</h2><p>Create professional A4 quotations before confirming a booking.</p></div><button className="q-primary" onClick={newQuotation}>+ New Quotation</button></div>
    <div className="q-toolbar"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search quotation or customer..." /><select value={filter} onChange={e=>setFilter(e.target.value)}><option>All</option>{STATUSES.map(s=><option key={s}>{s}</option>)}</select></div>
    {loading ? <div className="q-empty">Loading quotations...</div> : !visible.length ? <div className="q-empty"><b>No quotations yet</b><span>Create your first quotation for a customer.</span></div> :
      <div className="q-list">{visible.map(q=>{const c=customerMap[q.customer_id]||{};return <article className="q-row" key={q.id}><div className="q-row-main"><strong>{q.quotation_number}</strong><span>{c.name || "Customer"} · {q.event_type || "Event"}</span><small>{q.event_date || "Date TBC"} · Rs. {money(q.total)}</small></div><span className={`q-status q-${q.status.toLowerCase()}`}>{q.status}</span><div className="q-actions"><button onClick={()=>editQuotation(q)}>Edit</button><button onClick={()=>printQuotation(q)}>A4</button>{q.status!=="Approved"&&<button onClick={()=>approveAndBook(q)}>Approve</button>}<button className="danger" onClick={()=>remove(q)}>Delete</button></div></article>})}</div>}
  </div>;
}
