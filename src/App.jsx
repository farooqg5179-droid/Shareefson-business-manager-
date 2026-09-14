import React, { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  const [isSignup, setIsSignup] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function getSession() {
      const { data } = await supabase.auth.getSession();

      setSession(data.session);
      setLoading(false);
    }

    getSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function handleAuth(e) {
    e.preventDefault();

    setMessage("");
    setError("");

    if (!email || !password) {
      setError("Please enter email and password.");
      return;
    }

    if (isSignup && !name) {
      setError("Please enter your name.");
      return;
    }

    if (isSignup) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name,
          },
        },
      });

      if (error) {
        setError(error.message);
        return;
      }

      if (data.session) {
        setMessage("Account created successfully.");
      } else {
        setMessage(
          "Account created. Please check your email to confirm your account."
        );
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
        return;
      }

      setMessage("Login successful.");
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setSession(null);
  }

  if (loading) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (session) {
    return (
      <div className="app">
        <header className="topbar">
          <div>
            <p className="eyebrow">SHAREEF SONS</p>
            <h1>Business Manager</h1>
          </div>

          <button className="profile-button" onClick={handleLogout}>
            Logout
          </button>
        </header>

        <main className="dashboard">
          <section className="welcome-card">
            <p>Welcome back</p>
            <h2>Shareef Sons Events Organizer</h2>
            <span>{session.user.email}</span>
          </section>

          <section className="stats-grid">
            <div className="stat-card">
              <span>Bookings</span>
              <strong>0</strong>
            </div>

            <div className="stat-card">
              <span>Income</span>
              <strong>Rs. 0</strong>
            </div>

            <div className="stat-card">
              <span>Expenses</span>
              <strong>Rs. 0</strong>
            </div>

            <div className="stat-card">
              <span>Pending</span>
              <strong>Rs. 0</strong>
            </div>
          </section>

          <section className="section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">QUICK ACTIONS</p>
                <h2>Manage Business</h2>
              </div>
            </div>

            <div className="actions-grid">
              <button>+ New Customer</button>
              <button>+ New Booking</button>
              <button>+ Create Invoice</button>
              <button>+ Payment In</button>
              <button>+ Payment Out</button>
              <button>+ Add Note</button>
            </div>
          </section>
        </main>

        <nav className="bottom-nav">
          <button>
            ⌂
            <span>Home</span>
          </button>

          <button>
            👥
            <span>Customers</span>
          </button>

          <button>
            📅
            <span>Bookings</span>
          </button>

          <button>
            🧾
            <span>Invoices</span>
          </button>

          <button>
            ⚙️
            <span>Settings</span>
          </button>
        </nav>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <p className="eyebrow">SHAREEF SONS</p>

        <h1>Business Manager</h1>

        <p className="auth-subtitle">
          Manage your events, customers, bookings and finances.
        </p>

        <div className="auth-tabs">
          <button
            className={!isSignup ? "active" : ""}
            onClick={() => {
             
