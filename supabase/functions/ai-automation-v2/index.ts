import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "openai/gpt-oss-120b";

const WRITE_ACTIONS = new Set([
  "create_booking",
  "create_invoice",
  "create_quotation",
  "customer_followup",
  "smart_notification",
  "whatsapp_message",
]);

const ACTIONS = [
  "search_customer",
  "search_booking",
  "create_booking",
  "prepare_invoice",
  "create_invoice",
  "prepare_quotation",
  "create_quotation",
  "daily_briefing",
  "customer_followup",
  "financial_analysis",
  "smart_notification",
  "whatsapp_message",
];

function reply(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function str(value: unknown) {
  return String(value ?? "").trim();
}

function planClean(value: any) {
  const action = ACTIONS.includes(value?.action) ? value.action : "unknown";

  return {
    title: str(value?.title) || "AI Automation",
    summary: str(value?.summary),
    action,
    confirmation_message: str(value?.confirmation_message),
    steps: Array.isArray(value?.steps)
      ? value.steps.map(str).filter(Boolean).slice(0, 10)
      : [],
    parameters:
      value?.parameters && typeof value.parameters === "object"
        ? value.parameters
        : {},
  };
}

async function transcribe(file: File) {
  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) throw new Error("GROQ_API_KEY is missing.");

  const form = new FormData();
  form.append("file", file, file.name || "voice.webm");
  form.append("model", "whisper-large-v3-turbo");
  form.append("response_format", "json");

  const r = await fetch(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: "Bearer " + key },
      body: form,
    },
  );

  if (!r.ok) throw new Error("Voice transcription failed: " + await r.text());

  const data = await r.json();
  const text = str(data?.text);
  if (!text) throw new Error("Voice transcript is empty.");
  return text;
}

async function askAI(message: string, context: any) {
  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) throw new Error("GROQ_API_KEY is missing.");

  const system = `
You are Shareef Sons Business Manager AI.
Understand English, Urdu, Roman Urdu and mixed language.
Return ONLY one valid JSON object.
Allowed actions: ${ACTIONS.join(", ")}.
For create_booking include customer_name, event_type, event_date (YYYY-MM-DD), guests, total_amount, advance_amount, venue, event_time, notes.
Never invent missing dates, prices, phone numbers, or customer details. For create_booking, required fields are customer_name, event_type, event_date (YYYY-MM-DD), guests, and total_amount when the user supplied a price. venue, event_time, advance_amount, and notes are OPTIONAL: do not block a booking because these are missing; set omitted optional values to empty/null/0 as appropriate and list them as optional follow-up details. Only choose action "unknown" if a required field is genuinely missing.
Search, prepare, briefing and analysis are read-only.
Create, follow-up, notification and WhatsApp actions require admin confirmation.
Never claim an action succeeded unless the server did it.
JSON shape: {"title":"","summary":"","action":"","confirmation_message":"","steps":[],"parameters":{}}
`;

  // Send a compact context to stay below Groq's TPM request limit.
  const compact = (rows: any[], fields: string[], limit = 12) =>
    (Array.isArray(rows) ? rows : []).slice(0, limit).map((row: any) => {
      const out: any = {};
      for (const field of fields) {
        const value = row?.[field];
        if (value !== undefined && value !== null && value !== "") out[field] = value;
      }
      return out;
    });

  const slimContext = {
    customers: compact(context?.customers, ["id", "name", "phone", "whatsapp_number"], 12),
    bookings: compact(context?.bookings, ["id", "customer_id", "customer_name", "event_type", "event_date", "event_time", "venue", "guests", "total_amount", "advance_amount", "remaining_amount", "status"], 12),
    invoices: compact(context?.invoices, ["id", "customer_id", "customer_name", "invoice_number", "invoice_date", "event_type", "event_date", "total_amount", "paid_amount", "remaining_amount"], 8),
    quotations: compact(context?.quotations, ["id", "customer_id", "quotation_number", "event_type", "event_date", "guests", "total", "status"], 8),
    payments: compact(context?.payments, ["id", "customer_id", "booking_id", "payment_type", "amount", "payment_date", "notes"], 10),
    expenses: compact(context?.expenses, ["id", "category", "amount", "expense_date", "notes"], 10),
  };

  const send = async (userContext: any) => {
    const r = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.1,
        max_tokens: 900,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify({ message, context: userContext }) },
        ],
      }),
    });
    const rawText = await r.text();
    if (!r.ok) {
      if (r.status === 413 || rawText.includes("tokens per minute") || rawText.includes("rate_limit_exceeded")) {
        throw new Error("AI context is too large for the current Groq token limit. Compact request was sent; try again shortly or reduce saved records.");
      }
      throw new Error("Groq request failed: " + rawText);
    }
    let data: any;
    try { data = JSON.parse(rawText); } catch { throw new Error("Groq returned an unreadable response."); }
    const raw = data?.choices?.[0]?.message?.content;
    if (!raw) throw new Error("Groq returned no plan.");
    try { return planClean(JSON.parse(raw)); } catch { throw new Error("Groq returned invalid JSON."); }
  };

  try {
    return await send(slimContext);
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "";
    if (!messageText.includes("too large")) throw error;
    // Retry once with no historical records; the database context is loaded server-side
    // for execution, so it remains available even when omitted from the model prompt.
    return await send({
      customers: compact(context?.customers, ["id", "name", "phone", "whatsapp_number"], 4),
      bookings: compact(context?.bookings, ["id", "customer_name", "event_type", "event_date", "status"], 4),
      invoices: [],
      quotations: [],
      payments: [],
      expenses: [],
    });
  }
}

async function loadContext(db: any, userId: string) {
  const [customers, bookings, invoices, quotations, payments, expenses] =
    await Promise.all([
      db.from("ss_customers")
        .select("id,name,phone,whatsapp_number,address,notes")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100),

      db.from("ss_bookings")
        .select("id,customer_id,customer_name,event_type,event_date,event_time,venue,guests,total_amount,advance_amount,remaining_amount,status,notes")
        .eq("user_id", userId)
        .order("event_date", { ascending: true })
        .limit(100),

      db.from("ss_invoices")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100),

      db.from("ss_quotations")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100),

      db.from("ss_payments")
        .select("*")
        .eq("user_id", userId)
        .order("payment_date", { ascending: false })
        .limit(200),

      db.from("ss_expenses")
        .select("*")
        .eq("user_id", userId)
        .order("expense_date", { ascending: false })
        .limit(200),
    ]);

  return {
    customers: customers.data || [],
    bookings: bookings.data || [],
    invoices: invoices.data || [],
    quotations: quotations.data || [],
    payments: payments.data || [],
    expenses: expenses.data || [],
  };
}

function findCustomer(ctx: any, p: any) {
  const q = str(
    p?.customer_name || p?.name || p?.phone || p?.whatsapp_number,
  ).toLowerCase();

  if (!q) return [];

  return ctx.customers
    .filter((c: any) =>
      [c.name, c.phone, c.whatsapp_number].some((v) =>
        str(v).toLowerCase().includes(q),
      ),
    )
    .slice(0, 10);
}

function findBooking(ctx: any, p: any) {
  const q = str(
    p?.customer_name || p?.name || p?.booking_id || p?.event_type,
  ).toLowerCase();

  return ctx.bookings
    .filter((b: any) => {
      if (!q) return true;
      return [b.id, b.customer_name, b.event_type, b.venue].some((v) =>
        str(v).toLowerCase().includes(q),
      );
    })
    .slice(0, 10);
}

function total(rows: any[], field: string) {
  return rows.reduce((n, row) => n + Number(row?.[field] || 0), 0);
}

async function execute(db: any, userId: string, plan: any, ctx: any) {
  const p = plan.parameters || {};

  switch (plan.action) {
    case "search_customer":
      return { executed: true, data: findCustomer(ctx, p) };

    case "search_booking":
      return { executed: true, data: findBooking(ctx, p) };

    case "prepare_invoice":
      return {
        executed: true,
        data: {
          customer: findCustomer(ctx, p)[0] || null,
          booking: findBooking(ctx, p)[0] || null,
          draft: p,
        },
      };

    case "prepare_quotation":
      return {
        executed: true,
        data: {
          customer: findCustomer(ctx, p)[0] || null,
          draft: p,
        },
      };

    case "daily_briefing": {
      const today = new Date().toISOString().slice(0, 10);
      return {
        executed: true,
        data: {
          today,
          upcomingBookings: ctx.bookings
            .filter((b: any) => b.event_date >= today)
            .slice(0, 10),
          unpaidInvoices: ctx.invoices
            .filter((i: any) => Number(i.remaining_amount || 0) > 0)
            .slice(0, 20),
          paymentsIn: ctx.payments
            .filter((p: any) => p.payment_type === "in")
            .reduce((n: number, p: any) => n + Number(p.amount || 0), 0),
          expenses: total(ctx.expenses, "amount"),
        },
      };
    }

    case "financial_analysis":
      return {
        executed: true,
        data: {
          invoiceTotal: total(ctx.invoices, "total_amount"),
          invoicePaid: total(ctx.invoices, "paid_amount"),
          invoiceRemaining: total(ctx.invoices, "remaining_amount"),
          paymentsIn: ctx.payments
            .filter((p: any) => p.payment_type === "in")
            .reduce((n: number, p: any) => n + Number(p.amount || 0), 0),
          paymentsOut: ctx.payments
            .filter((p: any) => p.payment_type === "out")
            .reduce((n: number, p: any) => n + Number(p.amount || 0), 0),
          expenses: total(ctx.expenses, "amount"),
        },
      };

    case "create_booking": {
      const customer = findCustomer(ctx, p)[0];
      const customerName = str(p.customer_name || p.name) || customer?.name || "";
      const eventType = str(p.event_type);
      const eventDate = str(p.event_date);
      const guests = Number(p.guests || 0);
      const totalAmount = Number(p.total_amount || p.total || 0);
      const advanceAmount = Number(p.advance_amount || p.advance || 0);

      if (!customerName) throw new Error("Customer name is required for booking.");
      if (!eventType) throw new Error("Event type is required for booking.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
        throw new Error("Event date is required in YYYY-MM-DD format.");
      }
      if (!Number.isFinite(guests) || guests < 0) throw new Error("Guests must be a valid non-negative number.");
      if (!Number.isFinite(totalAmount) || totalAmount < 0) throw new Error("Total amount must be a valid non-negative number.");
      if (!Number.isFinite(advanceAmount) || advanceAmount < 0 || advanceAmount > totalAmount) {
        throw new Error("Advance amount must be between zero and total amount.");
      }

      const duplicate = ctx.bookings.find((b: any) =>
        b.event_date === eventDate &&
        str(b.event_type).toLowerCase() === eventType.toLowerCase() &&
        str(b.venue).toLowerCase() === str(p.venue).toLowerCase() &&
        ["pending", "confirmed", "booked"].includes(str(b.status).toLowerCase())
      );
      if (duplicate) throw new Error("A similar active booking already exists on this date and venue. Review existing bookings before creating another.");

      const row = {
        user_id: userId,
        customer_id: p.customer_id || customer?.id || null,
        customer_name: customerName,
        event_type: eventType,
        event_date: eventDate,
        event_time: str(p.event_time) || null,
        venue: str(p.venue) || null,
        guests,
        total_amount: totalAmount,
        advance_amount: advanceAmount,
        remaining_amount: Math.max(totalAmount - advanceAmount, 0),
        status: str(p.status) || "Pending",
        notes: str(p.notes) || null,
      };

      const { data, error } = await db
        .from("ss_bookings")
        .insert(row)
        .select()
        .single();

      if (error) throw new Error("Booking creation failed: " + error.message);
      return { executed: true, data };
    }

    case "create_invoice": {
      const customer = findCustomer(ctx, p)[0];
      const booking = findBooking(ctx, p)[0];
      const amount = Number(p.total_amount || p.total || 0);
      const paid = Number(p.paid_amount || p.advance_amount || 0);

      const row = {
        user_id: userId,
        customer_id: p.customer_id || customer?.id || null,
        customer_name: str(p.customer_name) || customer?.name || null,
        booking_id: p.booking_id || booking?.id || null,
        invoice_number: str(p.invoice_number) || "AI-" + Date.now(),
        invoice_date:
          str(p.invoice_date) || new Date().toISOString().slice(0, 10),
        event_type: str(p.event_type) || booking?.event_type || "Event",
        event_date: str(p.event_date) || booking?.event_date || null,
        event_time: str(p.event_time) || booking?.event_time || null,
        venue: str(p.venue) || booking?.venue || null,
        items: Array.isArray(p.items) ? p.items : [],
        subtotal: Number(p.subtotal || amount),
        discount: Number(p.discount || 0),
        total_amount: amount,
        paid_amount: paid,
        remaining_amount: Math.max(amount - paid, 0),
        due_date: str(p.due_date) || null,
        notes: str(p.notes) || null,
      };

      const { data, error } = await db
        .from("ss_invoices")
        .insert(row)
        .select()
        .single();

      if (error) throw new Error("Invoice creation failed: " + error.message);
      return { executed: true, data };
    }

    case "create_quotation": {
      const customer = findCustomer(ctx, p)[0];

      if (!p.customer_id && !customer?.id) {
        throw new Error("Saved customer is required for quotation.");
      }

      const amount = Number(p.total || p.total_amount || 0);

      const row: any = {
        user_id: userId,
        quotation_number: str(p.quotation_number) || "AI-Q-" + Date.now(),
        customer_id: p.customer_id || customer.id,
        booking_id: p.booking_id || null,
        event_type: str(p.event_type) || null,
        event_date: str(p.event_date) || null,
        event_time: str(p.event_time) || null,
        venue: str(p.venue) || null,
        guests: Number(p.guests || 0),
        valid_until: str(p.valid_until) || null,
        items: Array.isArray(p.items) ? p.items : [],
        subtotal: Number(p.subtotal || amount),
        discount: Number(p.discount || 0),
        total: amount,
        advance_required: Number(
          p.advance_required || p.advance_amount || 0,
        ),
        status: str(p.status) || "Draft",
        notes: str(p.notes) || null,
        terms: str(p.terms) || null,
      };

      const { data, error } = await db
        .from("ss_quotations")
        .insert(row)
        .select()
        .single();

      if (error) {
        throw new Error("Quotation creation failed: " + error.message);
      }

      return { executed: true, data };
    }

    case "customer_followup":
    case "smart_notification":
    case "whatsapp_message":
      return {
        executed: false,
        data: {
          delivery_status: "prepared_only",
          message: str(p.message || p.text || plan.summary),
          customer: findCustomer(ctx, p)[0] || null,
          parameters: p,
        },
      };

    case "unknown":
      return {
        executed: true,
        data: {
          clarification_needed: true,
          message: str(plan.summary) || "Please provide the task and any required customer, date, or amount details.",
          suggested_action: "Please provide more details.",
          parameters: p,
        },
      };

    default:
      return {
        executed: true,
        data: {
          clarification_needed: true,
          message: "No supported action was identified. Please describe the task and required details more clearly.",
          unsupported_action: plan.action,
        },
      };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return reply({ error: "Authorization required." }, 401);

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) {
      return reply({ error: "Supabase secrets are missing." }, 500);
    }

    const db = createClient(url, serviceKey);
    const token = auth.replace(/^Bearer\s+/i, "");
    const { data: authData, error: authError } = await db.auth.getUser(token);

    if (authError || !authData.user) {
      return reply({ error: "Invalid session." }, 401);
    }

    let body: any = {};
    let transcript = "";

    const type = req.headers.get("content-type") || "";

    if (type.includes("multipart/form-data")) {
      const form = await req.formData();
      const audio = form.get("audio");

      if (audio instanceof File) {
        transcript = await transcribe(audio);
      }

      body = {
        message: str(form.get("message")),
        confirmed: str(form.get("confirmed")) === "true",
        confirmation_log_id: str(form.get("confirmation_log_id")),
      };
    } else {
      body = await req.json();
    }

    const message = str(body.message) || transcript;
    const confirmed = Boolean(body.confirmed);
    const logId = str(body.confirmation_log_id);

    if (!message && !logId) {
      return reply({ error: "message is required." }, 400);
    }

    if (confirmed) {
      if (!logId) {
        return reply({ error: "confirmation_log_id is required." }, 400);
      }

      const { data: log, error } = await db
        .from("ss_ai_automation_logs")
        .select("*")
        .eq("id", logId)
        .eq("user_id", authData.user.id)
        .single();

      if (error || !log) {
        return reply({ error: "Automation request not found." }, 404);
      }

      if (log.status !== "awaiting_confirmation") {
        return reply({ error: "This request is already processed." }, 409);
      }

      const ctx = await loadContext(db, authData.user.id);
      const result = await execute(
        db,
        authData.user.id,
        planClean(log.plan),
        ctx,
      );

      await db
        .from("ss_ai_automation_logs")
        .update({
          status: result.executed ? "executed" : "prepared",
          result: result.data || {},
        })
        .eq("id", log.id)
        .eq("user_id", authData.user.id);

      return reply({
        log_id: log.id,
        title: log.plan?.title || "AI Automation",
        summary: log.plan?.summary || "",
        action: log.action,
        requires_confirmation: false,
        executed: result.executed,
        data: result.data,
        voice_transcript: transcript || null,
      });
    }

    const ctx = await loadContext(db, authData.user.id);
    const plan = await askAI(message, ctx);
    const needsConfirmation = WRITE_ACTIONS.has(plan.action);

    let resultData = {};

    if (!needsConfirmation) {
      resultData = (await execute(
        db,
        authData.user.id,
        plan,
        ctx,
      )).data || {};
    }

    const { data: log, error: logError } = await db
      .from("ss_ai_automation_logs")
      .insert({
        user_id: authData.user.id,
        request_text: message,
        action: plan.action,
        status: needsConfirmation ? "awaiting_confirmation" : "executed",
        plan,
        result: resultData,
      })
      .select("id")
      .single();

    if (logError) {
      throw new Error("Could not save AI log: " + logError.message);
    }

    return reply({
      log_id: log.id,
      title: plan.title,
      summary: plan.summary,
      action: plan.action,
      requires_confirmation: needsConfirmation,
      confirmation_message: needsConfirmation
        ? plan.confirmation_message || "Confirm this action to continue."
        : "",
      executed: !needsConfirmation,
      steps: plan.steps,
      data: resultData,
      voice_transcript: transcript || null,
    });
  } catch (error) {
    console.error(error);
    return reply(
      { error: error instanceof Error ? error.message : "AI automation failed." },
      500,
    );
  }
});
