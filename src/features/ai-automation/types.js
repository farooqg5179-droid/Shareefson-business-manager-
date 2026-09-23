export const AI_AUTOMATION_VERSION = "2.0.0";

export const AI_ACTIONS = Object.freeze({
  SEARCH_CUSTOMER: "search_customer",
  SEARCH_BOOKING: "search_booking",
  PREPARE_INVOICE: "prepare_invoice",
  CREATE_INVOICE: "create_invoice",
  PREPARE_QUOTATION: "prepare_quotation",
  CREATE_QUOTATION: "create_quotation",
  DAILY_BRIEFING: "daily_briefing",
  CUSTOMER_FOLLOWUP: "customer_followup",
  FINANCIAL_ANALYSIS: "financial_analysis",
  SMART_NOTIFICATION: "smart_notification",
  WHATSAPP_MESSAGE: "whatsapp_message",
});

export function makeAutomationRequest(message, confirmed = false, confirmationLogId = null) {
  return {
    message: String(message || "").trim(),
    confirmed: Boolean(confirmed),
    confirmation_log_id: confirmationLogId || null,
    client: "shareef-sons-business-manager",
    version: AI_AUTOMATION_VERSION,
  };
}
