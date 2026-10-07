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

  // Explicitly attach the current user's access token.
  // This is important for protected Edge Functions (verify_jwt=true),
  // especially inside the Android Capacitor WebView.
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw new Error(
      sessionError.message || "Unable to read the current login session.",
    );
  }

  if (!session?.access_token) {
    throw new Error("Permission denied: please sign in again.");
  }

  const { data, error } = await supabase.functions.invoke(
    FUNCTION_NAME,
    {
      body,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    },
  );

  if (error) {
    let details = "";
    try {
      if (error.context instanceof Response) {
        const responseText = await error.context.text();
        if (responseText) {
          try {
            const parsed = JSON.parse(responseText);
            details = parsed?.error ? `: ${parsed.error}` : `: ${responseText}`;
          } catch {
            details = `: ${responseText}`;
          }
        }
      }
    } catch {
      // Keep the normal Supabase error when the response body is unavailable.
    }

    throw new Error(
      `${error.message || "AI Assistant Supabase request failed."}${details}`,
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
