import { supabase } from "../../lib/supabase";
import { makeAutomationRequest } from "./types";

const FUNCTION_NAME = "ai-automation-v2";

export async function runAIAutomation(message, confirmed = false, confirmationLogId = null, audioBlob = null) {
  const request = makeAutomationRequest(message, confirmed, confirmationLogId);
  const body = audioBlob instanceof Blob
    ? (() => {
        const form = new FormData();
        form.append("message", request.message);
        form.append("confirmed", String(request.confirmed));
        if (request.confirmation_log_id) form.append("confirmation_log_id", request.confirmation_log_id);
        form.append("client", request.client);
        form.append("version", request.version);
        form.append("audio", audioBlob, "voice.webm");
        return form;
      })()
    : request;

  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body });

  if (error) throw new Error(error.message || "AI automation request failed.");
  if (!data) throw new Error("AI automation returned no response.");
  if (data.error) throw new Error(data.error);
  return data;
}

export async function previewAIAutomation(message, audioBlob = null) {
  return runAIAutomation(message, false, null, audioBlob);
}

export async function confirmAIAutomation(logId) {
  if (!logId) throw new Error("Confirmation request is missing.");
  return runAIAutomation("", true, logId);
}
