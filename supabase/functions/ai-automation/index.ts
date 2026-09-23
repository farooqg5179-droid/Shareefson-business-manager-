import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizePlan(plan: any) {
  const allowed = new Set([
    "search_customer", "search_booking", "prepare_invoice", "create_invoice",
    "prepare_quotation", "create_quotation", "daily_briefing",
    "customer_followup", "financial_analysis", "smart_notification", "whatsapp_message",
  ]);
  const action = allowed.has(plan?.action) ? plan.action : "unknown";
  return {
    title: cleanText(plan?.title) || "AI Automation",
    summary: cleanText(plan?.summary),
    action,
    requires_confirmation: Boolean(plan?.requires_confirmation),
    confirmation_message: cleanText(plan?.confirmation_message),
    steps: Array.isArray(plan?.steps) ? plan.steps.map((x: unknown) => cleanText(x)).filter(Boolean).slice(0, 20) : [],
    parameters: plan?.parameters && typeof plan.parameters === "object" ? plan.parameters : {},
  };
}

async function groqPlan(message: string, context: unknown) {
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured in Supabase.");

  const system = [
    "You are the AI automation planner for Shareef Sons Business Manager.",
    "Understand English, Urdu, Roman Urdu and mixed language.",
    "Return ONLY valid JSON.",
    "Allowed actions: search_customer, search_booking, prepare_invoice, create_invoice, prepare_quotation, create_quotation, daily_briefing, customer_followup, financial_analysis, smart_notification, whatsapp_message.",
    "Search/read-only actions may execute immediately.",
    "Any create, update, delete, financial, notification, follow-up or WhatsApp action requires admin confirmation.",
    "Never claim an action was executed unless the server actually executed it.",
    "For create_invoice/create_quotation, put complete database-ready fields in parameters.",
    "For customer_followup, smart_notification and whatsapp_message, prepare the message and target but do not claim delivery.",
    "Keep plans concise. Use Pakistani rupees for amounts.",
    "JSON shape: {title,summary,action,requires_confirmation,confirmation_message,steps,parameters}.",
  ].join("\n");

  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("GROQ_MODEL") || "llama-3.3-70b-versatile",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify({ message, context }) },
      ],
    }),
  });

  if (!response.ok) throw new Error("Groq request failed: " + await response.text());
  const payload = await response.json();
  const raw = payload?.choices?.[0]?.message?.content;
  if (!raw) throw new Error("Groq returned an empty plan.");
  return normalizePlan(JSON.parse(raw));
}

async function getContext(supabase: any, userId: string) {
  const [customers, bookings, invoices, quotations, payments, expenses] = await Promise.all([
    supabase.from("ss_customers").select("id,name,phone,whatsapp_number,address,notes,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(100),
    supabase.from("ss_bookings").select("id,customer_id,customer_name,event_type,event_date,event_time,venue,guests,total_amount,advance_amount,remaining_amount,status,reminder_enabled,reminder_date,reminder_time,notes").eq("user_id", userId).order("event_date", { ascending: true }).limit(100),
    supabase.from("ss_invoices").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(100),
    supabase.from("ss_quotations").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(100),
    supabase.from("ss_payments").select("*").eq("user_id", userId).order("payment_date", { ascending: false }).limit(200),
    supabase.from("ss_expenses").select("*").eq("user_id", userId).order("expense_date", { ascending: false }).limit(200),
  ]);
  return {
    customers: customers.data || [], bookings: bookings.data || [], invoices: invoices.data || [],
    quotations: quotations.data || [], payments: payments.data || [], expenses: expenses.data || [],
  };
}

function findCustomer(context: any, parameters: any) {
  const query = cleanText(parameters?.customer_name || parameters?.name || parameters?.phone).toLowerCase();
  if (!query) return [];
  return (context.customers || []).filter((c: any) =>
    [c.name, c.phone, c.whatsapp_number].some((v: any) => cleanText(v).toLowerCase().includes(query))
  ).slice(0, 10);
}

function findBooking(context: any, parameters: any) {
  const query = cleanText(parameters?.customer_name || parameters?.name || parameters?.booking_id || parameters?.event_type).toLowerCase();
  return (context.bookings || []).filter((b: any) => {
    if (!query) return true;
    return [b.id, b.customer_name, b.event_type, b.venue].some((v: any) => cleanText(v).toLowerCase().includes(query));
  }).slice(0, 10);
}

function sum(rows: any[], field: string) {
  return rows.reduce((total, row) => total + Number(row?.[field] || 0), 0);
}

async function executePlan(supabase: any, userId: string, plan: any, context: any) {
  const p = plan.parameters || {};

  switch (plan.action) {
    case "search_customer":
      return { action: plan.action, executed: true, data: findCustomer(context, p) };

    case "search_booking":
      return { action: plan.action, executed: true, data: findBooking(context, p) };

    case "daily_briefing": {
      const today = new Date().toISOString().slice(0, 10);
      return {
        action: plan.action, executed: true,
        data: {
          today,
          upcomingBookings: (context.bookings || []).filter((b: any) => b.event_date && b.event_date >= today).slice(0, 10),
          unpaidInvoices: (context.invoices || []).filter((i: any) => Number(i.remaining_amount || 0) > 0).slice(0, 20),
          paymentsIn: sum(context.payments || [], "amount"),
          expenses: sum(context.expenses || [], "amount"),
        },
      };
    }

    case "financial_analysis":
      return {
        action: plan.action, executed: true,
        data: {
          invoiceTotal: sum(context.invoices || [], "total_amount"),
          invoicePaid: sum(context.invoices || [], "paid_amount"),
          invoiceRemaining: sum(context.invoices || [], "remaining_amount"),
          paymentsIn: (context.payments || []).filter((x: any) => x.payment_type === "in").reduce((s: number, x: any) => s + Number(x.amount || 0), 0),
          paymentsOut: (context.payments || []).filter((x: any) => x.payment_type === "out").reduce((s: number, x: any) => s + Number(x.amount || 0), 0),
          expenses: sum(context.expenses || [], "amount"),
        },
      };

    case "prepare_invoice":
      return { action: plan.action, executed: true, data: {
        customer: findCustomer(context, p)[0] || null,
        booking: findBooking(context, p)[0] || null,
        draft: p,
      }};

    case "prepare_quotation":
      return { action: plan.action, executed: true, data: {
        customer: findCustomer(context, p)[0] || null, draft: p,
      }};

    case "create_invoice": {
      const total = Number(p.total_amount || 0);
      const paid = Number(p.paid_amount || 0);
      const draft = {
        user_id: userId,
        customer_id: p.customer_id || findCustomer(context, p)[0]?.id || null,
        customer_name: cleanText(p.customer_name) || findCustomer(context, p)[0]?.name || null,
        booking_id: p.booking_id || findBooking(context, p)[0]?.id || null,
        invoice_number: cleanText(p.invoice_number) || ("AI-" + Date.now()),
        invoice_date: cleanText(p.invoice_date) || new Date().toISOString().slice(0, 10),
        event_type: cleanText(p.event_type) || "Event",
        event_date: cleanText(p.event_date) || null,
        event_time: cleanText(p.event_time),
        venue: cleanText(p.venue),
        items: typeof p.items === "string" ? p.items : JSON.stringify(p.items || []),
        subtotal: Number(p.subtotal || total),
        discount: Number(p.discount || 0),
        total_amount: total,
        paid_amount: paid,
        remaining_amount: Math.max(total - paid, 0),
        due_date: cleanText(p.due_date) || null,
        notes: cleanText(p.notes),
      };
      const { data, error } = await supabase.from("ss_invoices").insert(draft).select().single();
      if (error) throw new Error("Invoice creation failed: " + error.message);
      return { action: plan.action, executed: true, data };
    }

    case "create_quotation": {
      const customer = findCustomer(context, p)[0] || null;
      if (!p.customer_id && !customer?.id) throw new Error("A saved customer is required before creating a quotation.");
      const total = Number(p.total || p.total_amount || 0);
      const row: any = {
        user_id: userId,
        quotation_number: cleanText(p.quotation_number) || ("AI-Q-" + Date.now()),
        customer_id: p.customer_id || customer.id,
        booking_id: p.booking_id || null,
        event_type: cleanText(p.event_type) || null,
        event_date: cleanText(p.event_date) || null,
        event_time: cleanText(p.event_time) || null,
        venue: cleanText(p.venue) || null,
        guests: Number(p.guests || 0),
        items: Array.isArray(p.items) ? p.items : [],
        subtotal: Number(p.subtotal || total),
        discount: Number(p.discount || 0),
        total,
        advance_required: Number(p.advance_required || p.advance_amount || 0),
        status: cleanText(p.status) || "Draft",
        notes: cleanText(p.notes) || null,
        terms: cleanText(p.terms) || null,
        package_name: cleanText(p.package_name) || null,
        services: typeof p.services === "string" ? p.services : JSON.stringify(p.services || []),
      };
      if (p.valid_until) row.valid_until = cleanText(p.valid_until);
      const { data, error } = await supabase.from("ss_quotations").insert(row).select().single();
      if (error) throw new Error("Quotation creation failed: " + error.message);
      return { action: plan.action, executed: true, data };
    }

    case "customer_followup":
    case "smart_notification":
    case "whatsapp_message":
      return {
        action: plan.action, executed: false,
        data: {
          delivery_status: "prepared",
          message: cleanText(p.message || p.text || plan.summary),
          customer: findCustomer(context, p)[0] || null,
          parameters: p,
        },
      };

    default:
      return { action: "unknown", executed: false, data: {} };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Authorization required." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return json({ error: "Supabase function secrets are missing." }, 500);

    const db = createClient(supabaseUrl, serviceKey);
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: userData, error: userError } = await db.auth.getUser(token);
    if (userError || !userData.user) return json({ error: "Invalid session." }, 401);

    const body = await req.json();
    const message = cleanText(body?.message);
    const confirmed = Boolean(body?.confirmed);
    const confirmationLogId = cleanText(body?.confirmation_log_id);

    if (!message && !confirmationLogId) return json({ error: "message is required." }, 400);

    // Confirmation always executes the exact previously stored plan.
    if (confirmed) {
      if (!confirmationLogId) return json({ error: "confirmation_log_id is required." }, 400);

      const { data: log, error: logError } = await db
        .from("ss_ai_automation_logs")
        .select("*")
        .eq("id", confirmationLogId)
        .eq("user_id", userData.user.id)
        .single();

      if (logError || !log) return json({ error: "Automation request was not found." }, 404);
      if (log.status !== "awaiting_confirmation") return json({ error: "This automation is already processed or expired." }, 409);

      const result = await executePlan(db, userData.user.id, normalizePlan(log.plan), await getContext(db, userData.user.id));
      const finalStatus = result.executed ? "executed" : "prepared";

      await db.from("ss_ai_automation_logs").update({
        status: finalStatus,
        result: result.data || {},
      }).eq("id", log.id).eq("user_id", userData.user.id);

      return json({
        log_id: log.id,
        title: log.plan?.title || "AI Automation",
        summary: log.plan?.summary || "",
        action: log.action,
        requires_confirmation: false,
        executed: Boolean(result.executed),
        steps: log.plan?.steps || [],
        data: result.data,
      });
    }

    const context = await getContext(db, userData.user.id);
    const plan = await groqPlan(message, context);
    const writeActions = new Set([
      "create_invoice", "create_quotation", "customer_followup",
      "smart_notification", "whatsapp_message"
    ]);
    const needsConfirmation = writeActions.has(plan.action);

    const status = needsConfirmation ? "awaiting_confirmation" : "executed";
    const initialResult = needsConfirmation ? {} : (await executePlan(db, userData.user.id, plan, context)).data || {};

    const { data: log, error: logError } = await db.from("ss_ai_automation_logs").insert({
      user_id: userData.user.id,
      request_text: message,
      action: plan.action,
      status,
      plan,
      result: initialResult,
    }).select("id").single();

    if (logError) throw new Error("Could not save AI automation log: " + logError.message);

    return json({
      log_id: log.id,
      title: plan.title,
      summary: plan.summary,
      action: plan.action,
      requires_confirmation: needsConfirmation,
      confirmation_message: needsConfirmation
        ? (plan.confirmation_message || "Please confirm before this action is executed.")
        : "",
      executed: !needsConfirmation,
      steps: plan.steps,
      data: initialResult,
    });
  } catch (error) {
    console.error(error);
    return json({ error: error?.message || "AI automation failed." }, 500);
  }
});
