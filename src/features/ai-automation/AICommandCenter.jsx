import React, { useEffect, useRef, useState } from "react";
import { confirmAIAutomation, previewAIAutomation } from "./aiAutomationService";
import "./aiAutomation.css";

function prettyData(data) {
  if (!data) return null;
  if (Array.isArray(data)) return data;
  if (data.customer || data.booking) return [data];
  return null;
}

function speakText(text) {
  if (!text || typeof window === "undefined") return false;
  const synth = window.speechSynthesis;
  if (!synth || typeof window.SpeechSynthesisUtterance === "undefined") return false;
  try {
    synth.cancel();
    const utterance = new window.SpeechSynthesisUtterance(String(text));
    utterance.lang = /[\u0600-\u06ff]/.test(String(text)) ? "ur-PK" : "en-PK";
    utterance.rate = 0.95;
    synth.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

export default function AICommandCenter() {
  const [message, setMessage] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => {
    return () => {
      try { mediaRecorderRef.current?.stop(); } catch {}
      streamRef.current?.getTracks?.().forEach(track => track.stop());
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    };
  }, []);

  async function preview(voiceBlob = null) {
    if (!voiceBlob && !message.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await previewAIAutomation(message, voiceBlob);
      // The Edge Function may return the action details nested under plan/result.
      const normalized = response?.result
        ? {
            ...response,
            title: response.title || response.plan?.title || "AI Automation Result",
            summary: response.summary || response.plan?.summary || response.result?.summary || response.result?.message || "",
            message: response.message || response.result?.message || "",
            action: response.action || response.plan?.action || "",
            steps: response.steps || response.plan?.steps || [],
            data: response.data ?? response.result?.data ?? response.plan?.data ?? null,
            requires_confirmation: response.requires_confirmation ?? response.plan?.requires_confirmation ?? false,
            confirmation_message: response.confirmation_message || response.plan?.confirmation_message || "",
            voice_transcript: response.voice_transcript || response.transcript || "",
          }
        : response;
      setResult(normalized);
      if (normalized.voice_transcript) setMessage(normalized.voice_transcript);
      const spoken = normalized.summary || normalized.title || normalized.message;
      if (spoken) speakText(spoken);
    } catch (e) {
      setError(e.message || "AI automation failed.");
    } finally {
      setLoading(false);
    }
  }

  async function startVoice() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Voice recording is not supported on this Android WebView.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
      const mimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported?.(type)) || "";
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      recorder.ondataavailable = event => {
        if (event.data?.size) chunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        const blobType = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: blobType });
        chunksRef.current = [];
        if (blob.size < 1000) {
          setError("Voice recording bohat short thi. Dobara bolain.");
          return;
        }
        await preview(blob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch (e) {
      setError(e?.message || "Microphone permission required.");
    }
  }

  function stopVoice() {
    setRecording(false);
    try { mediaRecorderRef.current?.stop(); } catch {}
    mediaRecorderRef.current = null;
  }

  async function confirm() {
    if (!result?.log_id) return;
    setConfirming(true);
    setError("");
    try {
      const executed = await confirmAIAutomation(result.log_id);
      setResult(executed);
      speakText(executed.summary || "Action completed.");
    } catch (e) {
      setError(e.message || "AI automation execution failed.");
    } finally {
      setConfirming(false);
    }
  }

  function readResult() {
    const dataText = result?.data
      ? (Array.isArray(result.data) ? result.data : [result.data])
          .map((item, index) => {
            if (item && typeof item === "object") {
              const parts = Object.entries(item)
                .filter(([, value]) => value !== null && value !== undefined && value !== "")
                .map(([key, value]) => `${key.replaceAll("_", " ")}: ${typeof value === "object" ? JSON.stringify(value) : value}`);
              return `Result ${index + 1}. ${parts.join(". ")}`;
            }
            return String(item);
          }).join(". ")
      : "";
    const stepsText = Array.isArray(result?.steps) ? result.steps.join(". ") : "";
    const textToRead = [
      result?.summary,
      result?.title,
      result?.message,
      result?.confirmation_message,
      result?.action ? `Action: ${result.action}` : "",
      stepsText,
      dataText,
    ].filter(value => typeof value === "string" && value.trim()).join(". ");
    const fallbackText = result ? JSON.stringify(result, null, 2) : "";
    const finalText = textToRead || fallbackText;
    if (!finalText) {
      setError("AI response khali hai. Dobara command chala kar dekhein.");
      return;
    }
    if (!speakText(finalText)) {
      setError("Is Android WebView mein voice reading available nahi. Result neeche text mein mojood hai.");
    } else {
      setError("");
    }
  }

  const needsConfirmation = Boolean(result?.requires_confirmation);
  const rows = prettyData(result?.data);

  return (
    <section className="ai-command-center">
      <div className="ai-command-header">
        <div>
          <span className="ai-command-badge">AI AUTOMATION + VOICE</span>
          <h2>AI Command Center</h2>
          <p>Type or speak: customers, bookings, invoices, quotations, finance and business actions.</p>
        </div>
      </div>

      <textarea
        value={message}
        onChange={e => setMessage(e.target.value)}
        placeholder='Example: "Ahmed ki wedding booking find karo aur invoice prepare karo."'
        rows={4}
      />

      <div className="ai-command-actions">
        <button type="button" onClick={() => preview()} disabled={loading || confirming || !message.trim()}>
          {loading ? "Thinking..." : "Run AI"}
        </button>
        <button
          type="button"
          className={recording ? "voice-recording" : "voice-button"}
          onClick={recording ? stopVoice : startVoice}
          disabled={loading || confirming}
        >
          {recording ? "⏹ Stop & Process" : "🎙️ Speak"}
        </button>
        {needsConfirmation && (
          <button type="button" className="confirm" onClick={confirm} disabled={confirming}>
            {confirming ? "Executing..." : "Confirm & Execute"}
          </button>
        )}
      </div>

      {recording && <div className="ai-voice-status">🎙️ Listening... Roman Urdu, Urdu, English ya mixed language mein bol sakte hain.</div>}
      {error && <div className="ai-command-error">{error}</div>}

      {result && (
        <div className="ai-command-result">
          <div className="ai-result-title">{result.title || "AI Automation Result"}</div>
          {result.summary && <p>{result.summary}</p>}

          {result.voice_transcript && (
            <div className="ai-transcript">
              <strong>Voice command:</strong> {result.voice_transcript}
            </div>
          )}

          <div className="ai-result-actions">
            <button type="button" className="secondary-button ai-read-result-button" onClick={readResult}>
              🔊 Read Automation Results
            </button>
          </div>

          {result.action && (
            <div className="ai-result-meta">
              <span>Action: {result.action}</span>
              {result.executed && <span>Completed</span>}
            </div>
          )}

          {Array.isArray(result.steps) && result.steps.length > 0 && (
            <ol>{result.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
          )}

          {result.requires_confirmation && (
            <div className="ai-confirm-box">
              <strong>Admin confirmation required</strong>
              <span>{result.confirmation_message || "Please confirm before this action is executed."}</span>
            </div>
          )}

          {rows && rows.length > 0 && (
            <div className="ai-readable-results">
              {rows.slice(0, 10).map((row, index) => (
                <div className="ai-result-card" key={row.id || index}>
                  <strong>{row.name || row.customer_name || row.event_type || "Result"}</strong>
                  {row.phone && <span>Phone: {row.phone}</span>}
                  {row.event_date && <span>Event: {row.event_date}</span>}
                  {row.venue && <span>Venue: {row.venue}</span>}
                  {row.total_amount !== undefined && <span>Total: Rs. {Number(row.total_amount || 0).toLocaleString("en-PK")}</span>}
                </div>
              ))}
            </div>
          )}

          {result.data && !rows && <pre>{JSON.stringify(result.data, null, 2)}</pre>}
          {!result.summary && !result.title && !result.message && !result.steps?.length && !result.data && (
            <pre className="ai-raw-result">{JSON.stringify(result, null, 2)}</pre>
          )}
        </div>
      )}
    </section>
  );
}
