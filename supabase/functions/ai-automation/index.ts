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

async function groqPlan(message: string, context: unknown) {
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured in Supabase.");

  const system = [
    "You are the AI automation planner for Shareef Sons Business Manager.",
    "Understand English, Urdu, Roman Urdu and mixed language.",
    "Return ONLY valid JSON.",
    "Allowed actions: search_customer, search_booking, prepare_invoice, create_invoice, prepare_quotation, daily_briefing, customer_followup, financial_analysis, smart_notification, whatsapp_message.",
    "Never claim that an action was executed unless the server actually executed it.",
    "Any write, financial, notification, or WhatsApp send action must require confirmation first.",
    "Keep the plan concise and use Pakistani rupees when amounts are mentioned.",
    "JSON shape: {title,summary,action,requires_confirmation,confirmation_message,steps,parameters}.",
  ].join("\n");

  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
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

  if (!response.ok) {
    throw new Error("Groq request failed: " + await response.text());
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Groq returned an empty plan.");

  return JSON.parse(content);
}

async function getContext(supabase: any, userId: string) {
  const [customers, bookings, invoices, quotations] = await Promise.all([
    supabase.from("ss_customers").select("id,name,phone,whatsapp_number,address,notes,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(100),
    supabase.from("ss_bookings").select("id,customer_id,customer_name,event_type,event_date,event_time,venue,guests,total_amount,advance_amount,remaining_amount,status,reminder_enabled,reminder_date,reminder_time,notes").eq("user_id", userId).order("event_date", { ascending: true }).limit(100),
    supabase.from("ss_invoices").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(100),
    supabase.from("ss_quotations").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(100),
  ]);

  return {
    customers: customers.data || [],
    bookings: bookings.data || [],
    invoices: invoices.data || [],
    quotations: quotations.data || [],
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
  const query = cleanText(parameters?.customer_name || parameters?.name || parameters?.booking_id).toLowerCase();
  return (context.bookings || []).filter((b: any) => {
    if (!query) return true;
    return [b.id, b.customer_name, b.event_type, b.venue].some((v: any) => cleanText(v).toLowerCase().includes(query));
  }).slice(0, 10);
}

async function executePlan(supabase: any, userId: string, plan: any, context: any) {
  switch (plan.action) {
    case "search_customer":
      return { action: plan.action, data: findCustomer(context, plan.parameters) };

    case "search_booking":
      return { action: plan.action, data: findBooking(context, plan.parameters) };

    case "daily_briefing":
      return {
        action: plan.action,
        data: {
          upcomingBookings: (context.bookings || []).filter((b: any) => b.event_date).slice(0, 10),
          unpaidInvoices: (context.invoices || []).filter((i: any) => Number(i.remaining_amount || 0) > 0).slice(0, 20),
        },
      };

    case "financial_analysis":
      return {
        action: plan.action,
        data: {
          invoiceTotal: (context.invoices || []).reduce((s: number, x: any) => s + Number(x.total_amount || 0), 0),
          invoicePaid: (context.invoices || []).reduce((s: number, x: any) => s + Number(x.paid_amount || 0), 0),
          invoiceRemaining: (context.invoices || []).reduce((s: number, x: any) => s + Number(x.remaining_amount || 0), 0),
        },
      };

    case "prepare_invoice":
      return {
        action: plan.action,
        data: {
          customer: findCustomer(context, plan.parameters)[0] || null,
          booking: findBooking(context, plan.parameters)[0] || null,
          draft: plan.parameters || {},
        },
      };

    case "prepare_quotation":
      return {
        action: plan.action,
        data: { customer: findCustomer(context, plan.parameters)[0] || null, draft: plan.parameters || {} },
      };

    case "create_invoice": {
      const p = plan.parameters || {};
      const draft = {
        user_id: userId,
        customer_id: p.customer_id || null,
        customer_name: cleanText(p.customer_name) || null,
        booking_id: p.booking_id || null,
        invoice_number: cleanText(p.invoice_number) || ("AI-" + Date.now()),
        invoice_date: cleanText(p.invoice_date) || new Date().toISOString().slice(0, 10),
        event_type: cleanText(p.event_type) || "Event",
        event_date: cleanText(p.event_date) || null,
        event_time: cleanText(p.event_time),
        venue: cleanText(p.venue),
        items: cleanText(p.items),
        subtotal: Number(p.subtotal || 0),
        discount: Number(p.discount || 0),
        total_amount: Number(p.total_amount || 0),
        paid_amount: Number(p.paid_amount || 0),
        remaining_amount: Math.max(Number(p.total_amount || 0) - Number(p.paid_amount || 0), 0),
        due_date: cleanText(p.due_date) || null,
        notes: cleanText(p.notes),
      };

      const { data, error } = await supabase.from("ss_invoices").insert(draft).select().single();
      if (error) throw new Error(error.message);
      return { action: plan.action, executed: true, data };
    }

    case "customer_followup":
    case "smart_notification":
    case "whatsapp_message":
      return {
        action: plan.action,
        executed: false,
        data: { message: "This action is planned but external delivery is not enabled yet.", parameters: plan.parameters || {} },
      };

    default:
      return { action: plan.action || "unknown", executed: false, data: context };
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

    const authClient = createClient(supabaseUrl, serviceKey);
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await authClient.auth.getUser(token);
    if (userError || !userData.user) return json({ error: "Invalid session." }, 401);

    const body = await req.json();
    const message = cleanText(body?.message);
    const confirmed = Boolean(body?.confirmed);
    if (!message) return json({ error: "message is required." }, 400);

    const context = await getContext(authClient, userData.user.id);
    const plan = await groqPlan(message, context);

    const writeActions = new Set(["create_invoice", "customer_followup", "smart_notification", "whatsapp_message"]);
    const needsConfirmation = writeActions.has(plan.action);

    if (needsConfirmation && !confirmed) {
      return json({
        ...plan,
        requires_confirmation: true,
        confirmation_message: plan.confirmation_message || "Please confirm before this action is executed.",
        executed: false,
      });
    }

    const result = await executePlan(authClient, userData.user.id, plan, context);
    return json({
      title: plan.title || "AI Automation",
      summary: plan.summary || "",
      action: plan.action,
      requires_confirmation: false,
      executed: Boolean(result.executed),
      steps: plan.steps || [],
      data: result.data,
    });
  } catch (error) {
    console.error(error);
    return json({ error: error?.message || "AI automation failed." }, 500);
  }
});
