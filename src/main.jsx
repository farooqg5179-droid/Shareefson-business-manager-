import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";

function showStartupError(message) {
  const root = document.getElementById("root");
  if (!root) return;
  root.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#fff;font-family:Arial,sans-serif;">
      <div style="max-width:720px;width:100%;border:1px solid #e4d29a;border-radius:18px;padding:24px;box-shadow:0 10px 35px rgba(0,0,0,.08);">
        <div style="font-size:22px;font-weight:700;margin-bottom:10px;">Shareef Sons Business Manager</div>
        <div style="font-size:18px;font-weight:700;margin-bottom:8px;">App startup error</div>
        <div style="color:#555;line-height:1.6;word-break:break-word;">${String(message || "Unknown error")}</div>
        <div style="margin-top:16px;color:#777;font-size:14px;">Please send a screenshot of this screen so the exact error can be fixed.</div>
      </div>
    </div>`;
}

window.addEventListener("error", (event) => {
  showStartupError(event?.error?.message || event?.message || "JavaScript error");
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event?.reason;
  showStartupError(reason?.message || String(reason || "Unhandled promise error"));
});

try {
  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (error) {
  showStartupError(error?.message || String(error));
}
