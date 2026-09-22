import { supabase } from "../../lib/supabase";
import { makeAutomationRequest } from "./types";

const FUNCTION_NAME = "ai-automation";

export async function runAIAutomation(message, confirmed = false) {
  const request = makeAutomationRequest(message, confirmed);

  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
    body: request,
  });

  if (error) {
    throw new Error(error.message || "AI automation request failed.");
  }

  if (!data) {
    throw new Error("AI automation returned no response.");
  }

  return data;
}

export async function previewAIAutomation(message) {
  return runAIAutomation(message, false);
}

export async function confirmAIAutomation(message) {
  return runAIAutomation(message, true);
}
