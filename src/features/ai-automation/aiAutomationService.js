import { supabase } from "../../lib/supabase";
import { makeAutomationRequest } from "./types";

const FUNCTION_NAME = "ai-automation-v2";

export async function runAIAutomation(
  message,
  confirmed = false,
  confirmationLogId = null,
  audioBlob = null,
) {
  const request = makeAutomationRequest(
    message,
    confirmed,
    confirmationLogId,
  );

  let body = request;

  if (audioBlob instanceof Blob) {
    const form = new FormData();

    form.append("message", request.message);
    form.append("confirmed", String(request.confirmed));

    if (request.confirmation_log_id) {
      form.append("confirmation_log_id", request.confirmation_log_id);
    }

    form.append("client", request.client);
    form.append("version", request.version);

    const extension = audioBlob.type.includes("mp4") ? "m4a" : "webm";
    form.append("audio", audioBlob, `voice.${extension}`);

    body = form;
  }

  const { data, error } = await supabase.functions.invoke(
    FUNCTION_NAME,
    { body },
  );

  if (error) {
    throw new Error(
      error.message || "AI Assistant Supabase request failed.",
    );
  }

  if (!data) {
    throw new Error("AI Assistant returned no response.");
  }

  if (data.error) {
    throw new Error(String(data.error));
  }

  return data;
}

export async function previewAIAutomation(
  message,
  audioBlob = null,
) {
  return runAIAutomation(
    message,
    false,
    null,
    audioBlob,
  );
}

export async function confirmAIAutomation(logId) {
  if (!logId) {
    throw new Error("Confirmation request is missing.");
  }

  return runAIAutomation(
    "",
    true,
    logId,
    null,
  );
}
