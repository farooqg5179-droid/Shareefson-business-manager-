import React, { useState } from "react";
import { confirmAIAutomation, previewAIAutomation } from "./aiAutomationService";
import "./aiAutomation.css";

function prettyData(data) {
  if (!data) return null;
  if (Array.isArray(data)) return data;
  if (data.customer || data.booking) return [data];
  return null;
}

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
    setResult(null);
    try {
      setResult(await previewAIAutomation(message));
    } catch (e) {
      setError(e.message || "AI automation failed.");
    } finally {
      setLoading(false);
    }
  }

  async function confirm() {
    if (!result?.log_id) return;
    setConfirming(true);
    setError("");
    try {
      const executed = await confirmAIAutomation(result.log_id);
      setResult(executed);
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
          <span className="ai-command-badge">AI AUTOMATION</span>
          <h2>AI Command Center</h2>
          <p>Customers, bookings, invoices, quotations, financial analysis and business actions.</p>
        </div>
      </div>

      <textarea
        value={message}
        onChange={e => setMessage(e.target.value)}
        placeholder='Example: "Ahmed ki wedding booking find karo aur invoice prepare karo."'
        rows={4}
      />

      <div className="ai-command-actions">
        <button type="button" onClick={preview} disabled={loading || confirming || !message.trim()}>
          {loading ? "Thinking..." : "Run AI"}
        </button>
        {needsConfirmation && (
          <button type="button" className="confirm" onClick={confirm} disabled={confirming}>
            {confirming ? "Executing..." : "Confirm & Execute"}
          </button>
        )}
      </div>

      {error && <div className="ai-command-error">{error}</div>}

      {result && (
        <div className="ai-command-result">
          <div className="ai-result-title">{result.title || "AI Automation Result"}</div>
          {result.summary && <p>{result.summary}</p>}

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

          {result.data && !rows && (
            <pre>{JSON.stringify(result.data, null, 2)}</pre>
          )}
        </div>
      )}
    </section>
  );
}
