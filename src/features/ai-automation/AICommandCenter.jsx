import React, { useEffect, useRef, useState } from "react";
import { confirmAIAutomation, previewAIAutomation } from "./aiAutomationService";
import "./aiAutomation.css";

function prettyData(data) {
  if (data === null || data === undefined) return null;
  if (Array.isArray(data)) return data;
  if (typeof data === "object") return [data];
  return null;
}

function displayValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function labelFor(key) {
  return String(key || "").replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
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
      const response = await confirmAIAutomation(result.log_id);
      const executed = response?.result
        ? {
            ...response,
            title: response.title || response.plan?.title || "AI Automation Result",
            summary: response.summary || response.result?.message || "",
            message: response.message || response.result?.message || "",
            action: response.action || response.plan?.action || "",
            steps: response.steps || response.plan?.steps || [],
            data: response.data ?? response.result?.data ?? response.plan?.data ?? null,
            requires_confirmation: Boolean(response.requires_confirmation),
            confirmation_message: response.confirmation_message || response.plan?.confirmation_message || "",
          }
        : response;
      setResult(executed);
      speakText(executed.summary || executed.message || "Action completed.");
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

          {result.message && <div className="ai-result-message">{result.message}</div>}

          {rows && rows.length > 0 && (
            <div className="ai-readable-results">
              <div className="ai-results-heading">
                <span>FOUND RECORDS</span>
                <strong>{rows.length} {rows.length === 1 ? "record" : "records"}</strong>
              </div>
              {rows.slice(0, 10).map((row, index) => {
                const isBooking = Boolean(row.event_type || row.event_date || row.venue);
                const amount = Number(row.total_amount ?? row.total ?? 0);
                const advance = Number(row.advance_amount ?? row.advance ?? 0);
                const remaining = Number(row.remaining_amount ?? row.remaining ?? Math.max(0, amount - advance));
                const status = row.booking_status || row.status || "Record found";
                return (
                  <article className="ai-result-card" key={row.id || index}>
                    <div className="ai-card-topline">
                      <span className="ai-card-kind">{isBooking ? "📅 BOOKING" : row.phone ? "👤 CUSTOMER" : "📄 BUSINESS RECORD"}</span>
                      <span className={/complete|paid/i.test(status) ? "ai-status-pill is-done" : "ai-status-pill"}>{status}</span>
                    </div>
                    <h3>{row.customer_name || row.name || row.event_type || row.title || "Record"}</h3>
                    {isBooking && <div className="ai-event-name">{row.event_type || "Event"}{row.package_name ? " · " + row.package_name : ""}</div>}
                    <div className="ai-card-details">
                      {row.phone && <div className="ai-detail"><span>Phone</span><strong>{displayValue(row.phone)}</strong></div>}
                      {row.event_date && <div className="ai-detail"><span>Event date</span><strong>{displayValue(row.event_date)}</strong></div>}
                      {row.event_time && row.event_time !== "00:00:00" && <div className="ai-detail"><span>Time</span><strong>{String(row.event_time).slice(0, 5)}</strong></div>}
                      {row.venue && <div className="ai-detail"><span>Venue</span><strong>{displayValue(row.venue)}</strong></div>}
                      {row.services && <div className="ai-detail ai-detail-wide"><span>Services</span><strong>{displayValue(row.services)}</strong></div>}
                      {Object.entries(row)
                        .filter(([key, value]) => !["id","user_id","customer_id","booking_id","invoice_id","event_type","event_date","event_time","venue","services","customer_name","name","title","package_name","phone","total_amount","total","advance_amount","advance","remaining_amount","remaining","booking_status","status","created_at","updated_at","custom_data","attachments","items","next_bookings"].includes(key) && value !== null && value !== "" && typeof value !== "object")
                        .slice(0, 10)
                        .map(([key, value]) => <div className="ai-detail" key={key}><span>{labelFor(key)}</span><strong>{displayValue(value)}</strong></div>)}
                      {Array.isArray(row.next_bookings) && row.next_bookings.length > 0 && (
                        <div className="ai-detail ai-detail-wide"><span>Next bookings</span><strong>{row.next_bookings.map(b => `${b.customer_name || b.event_type || "Event"} — ${b.event_date || "Date not set"}`).join(" · ")}</strong></div>
                      )}
                    </div>
                    {(row.total_amount !== undefined || row.advance_amount !== undefined || row.remaining_amount !== undefined) && (
                      <div className="ai-money-strip">
                        <div><span>Total</span><strong>Rs. {amount.toLocaleString("en-PK")}</strong></div>
                        <div><span>Advance</span><strong>Rs. {advance.toLocaleString("en-PK")}</strong></div>
                        <div><span>Remaining</span><strong>Rs. {remaining.toLocaleString("en-PK")}</strong></div>
                      </div>
                    )}
                  </article>
                );
              })}
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
