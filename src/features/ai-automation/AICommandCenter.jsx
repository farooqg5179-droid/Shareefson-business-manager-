import React, { useState } from "react";
import { confirmAIAutomation, previewAIAutomation } from "./aiAutomationService";
import "./aiAutomation.css";

export default function AICommandCenter() {
  const [message, setMessage] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  async function preview() {
    if (!message.trim()) return;
    setLoading(true);
    setError("");
    try {
      setResult(await previewAIAutomation(message));
    } catch (e) {
      setError(e.message || "AI automation failed.");
    } finally {
      setLoading(false);
    }
  }

  async function confirm() {
    if (!message.trim()) return;
    setConfirming(true);
    setError("");
    try {
      setResult(await confirmAIAutomation(message));
    } catch (e) {
      setError(e.message || "AI automation failed.");
    } finally {
      setConfirming(false);
    }
  }

  const needsConfirmation = Boolean(result?.requires_confirmation);

  return (
    <section className="ai-command-center">
      <div className="ai-command-header">
        <div>
          <span className="ai-command-badge">AI AUTOMATION</span>
          <h2>AI Command Center</h2>
          <p>Customer, booking, invoice, quotation, follow-up and business analysis commands.</p>
        </div>
      </div>

      <textarea
        value={message}
        onChange={e => setMessage(e.target.value)}
        placeholder='Example: "Find Ahmed and prepare his invoice for the Wedding booking."'
        rows={4}
      />

      <div className="ai-command-actions">
        <button type="button" onClick={preview} disabled={loading || confirming || !message.trim()}>
          {loading ? "Thinking..." : "Run AI"}
        </button>
        {needsConfirmation && (
          <button type="button" className="confirm" onClick={confirm} disabled={confirming}>
            {confirming ? "Confirming..." : "Confirm & Execute"}
          </button>
        )}
      </div>

      {error && <div className="ai-command-error">{error}</div>}

      {result && (
        <div className="ai-command-result">
          <div className="ai-result-title">{result.title || "AI Automation Result"}</div>
          {result.summary && <p>{result.summary}</p>}

          {Array.isArray(result.steps) && result.steps.length > 0 && (
            <ol>
              {result.steps.map((step, index) => <li key={index}>{step}</li>)}
            </ol>
          )}

          {result.requires_confirmation && (
            <div className="ai-confirm-box">
              <strong>Admin confirmation required</strong>
              <span>{result.confirmation_message || "Please confirm before any write/send action."}</span>
            </div>
          )}

          {result.data && (
            <pre>{JSON.stringify(result.data, null, 2)}</pre>
          )}
        </div>
      )}
    </section>
  );
}
