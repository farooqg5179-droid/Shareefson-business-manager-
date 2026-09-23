import { supabase } from "../../lib/supabase";
import { makeAutomationRequest } from "./types";

const FUNCTION_NAME = "ai-automation";

export async function runAIAutomation(message, confirmed = false, confirmationLogId = null) {
  const request = makeAutomationRequest(message, confirmed, confirmationLogId);

  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
    body: request,
  });

  if (error) throw new Error(error.message || "AI automation request failed.");
  if (!data) throw new Error("AI automation returned no response.");
  if (data.error) throw new Error(data.error);
  return data;
}

export async function previewAIAutomation(message) {
  return runAIAutomation(message, false, null);
}

export async function confirmAIAutomation(logId) {
  if (!logId) throw new Error("Confirmation request is missing.");
  return runAIAutomation("", true, logId);
}
