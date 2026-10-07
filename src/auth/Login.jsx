import React, { useState } from "react";
import { useAuth } from "./AuthContext";

export default function Login() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const isSignup = mode === "signup";

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setError("Email and password are required.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setBusy(true);
    try {
      const result = isSignup
        ? await signUp(cleanEmail, password)
        : await signIn(cleanEmail, password);

      if (result.error) {
        setError(result.error.message);
        return;
      }

      if (isSignup && !result.data?.session) {
        setMessage("Account created. Check your email to confirm the account, then sign in.");
      } else {
        window.history.replaceState({}, "", "/");
      }
    } catch (err) {
      setError(err?.message || "Authentication failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={styles.logo}>SS</div>
        <h1 style={styles.title}>Shareef Sons</h1>
        <p style={styles.subtitle}>Business Manager</p>

        <div style={styles.tabs}>
          <button
            type="button"
            onClick={() => { setMode("login"); setError(""); setMessage(""); }}
            style={{ ...styles.tab, ...(mode === "login" ? styles.activeTab : {}) }}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => { setMode("signup"); setError(""); setMessage(""); }}
            style={{ ...styles.tab, ...(mode === "signup" ? styles.activeTab : {}) }}
          >
            Create account
          </button>
        </div>

        <form onSubmit={submit} style={styles.form}>
          <label style={styles.label}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            style={styles.input}
          />

          <label style={styles.label}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
            autoComplete={isSignup ? "new-password" : "current-password"}
            style={styles.input}
          />

          {error ? <div style={styles.error}>{error}</div> : null}
          {message ? <div style={styles.message}>{message}</div> : null}

          <button type="submit" disabled={busy} style={styles.submit}>
            {busy ? "Please wait..." : isSignup ? "Create account" : "Sign in"}
          </button>
        </form>

        <p style={styles.footer}>
          Your business data stays protected by Supabase Auth and Row Level Security.
        </p>
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    boxSizing: "border-box",
    background: "#fff",
    fontFamily: "Arial, sans-serif",
  },
  card: {
    width: "100%",
    maxWidth: 420,
    padding: 28,
    border: "1px solid #e8e1cf",
    borderRadius: 22,
    background: "#fff",
    boxShadow: "0 16px 45px rgba(0,0,0,.08)",
  },
  logo: {
    width: 58,
    height: 58,
    margin: "0 auto 14px",
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    background: "#111",
    color: "#d4af37",
    fontWeight: 800,
    fontSize: 20,
  },
  title: { textAlign: "center", margin: 0, fontSize: 25, color: "#111" },
  subtitle: { textAlign: "center", margin: "5px 0 24px", color: "#777" },
  tabs: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 6,
    padding: 5,
    background: "#f6f3ec",
    borderRadius: 12,
    marginBottom: 22,
  },
  tab: {
    border: 0,
    borderRadius: 9,
    padding: "11px 8px",
    background: "transparent",
    color: "#666",
    fontWeight: 700,
    cursor: "pointer",
  },
  activeTab: { background: "#111", color: "#d4af37" },
  form: { display: "grid", gap: 9 },
  label: { fontSize: 13, fontWeight: 700, color: "#333", marginTop: 4 },
  input: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #ddd",
    borderRadius: 11,
    padding: "13px 14px",
    fontSize: 16,
    outline: "none",
  },
  submit: {
    marginTop: 9,
    border: 0,
    borderRadius: 11,
    padding: "14px",
    background: "#111",
    color: "#d4af37",
    fontSize: 16,
    fontWeight: 800,
    cursor: "pointer",
  },
  error: {
    padding: 10,
    borderRadius: 9,
    background: "#fff1f1",
    color: "#a40000",
    fontSize: 13,
  },
  message: {
    padding: 10,
    borderRadius: 9,
    background: "#f2f8f2",
    color: "#23652b",
    fontSize: 13,
  },
  footer: {
    margin: "18px 0 0",
    textAlign: "center",
    color: "#888",
    fontSize: 12,
    lineHeight: 1.5,
  },
};
