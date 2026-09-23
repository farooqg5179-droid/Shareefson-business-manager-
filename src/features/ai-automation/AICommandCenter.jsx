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
  if (!text || typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(String(text));
  utterance.lang = /[\u0600-\u06ff]/.test(String(text)) ? "ur-PK" : "en-PK";
  utterance.rate = 0.95;
  window.speechSynthesis.speak(utterance);
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
      const data = await previewAIAutomation(message, voiceBlob);
      setResult(data);
      if (data.voice_transcript) setMessage(data.voice_transcript);
      const spoken = data.summary || data.title;
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
            <button type="button" className="secondary-button" onClick={() => speakText(result.summary || result.title)}>
              🔊 Read Result
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
        </div>
      )}
    </section>
  );
}
