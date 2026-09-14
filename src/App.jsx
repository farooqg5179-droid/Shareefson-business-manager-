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

  const [currentPage, setCurrentPage] = useState("home");

  const [businessName, setBusinessName] = useState(
    "Shareef Sons Events Organizer"
  );
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [address, setAddress] = useState("");

  // Business profile saving states
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");

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
    setCurrentPage("home");
  }

  // Save Business Profile to Supabase
  async function saveBusinessProfile() {
    setProfileSaving(true);
    setProfileMessage("");

    const userId = session.user.id;

    const { error } = await supabase
      .from("ss_business_profiles")
      .upsert(
        {
          user_id: userId,
          business_name: businessName,
          phone: phone,
          whatsapp_number: whatsapp,
          address: address,
        },
        {
          onConflict: "user_id",
        }
      );

    if (error) {
      console.error(error);
      setProfileMessage("❌ Profile save failed: " + error.message);
    } else {
      setProfileMessage("✅ Business profile saved successfully.");
    }

    setProfileSaving(false);
  }

  function showSettings() {
    setCurrentPage("settings");
    setProfileMessage("");
  }

  function showHome() {
    setCurrentPage("home");
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

  if (!session) {
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
                setIsSignup(false);
                setError("");
                setMessage("");
              }}
            >
              Login
            </button>

            <button
              className={isSignup ? "active" : ""}
              onClick={() => {
                setIsSignup(true);
                setError("");
                setMessage("");
              }}
            >
              Signup
            </button>
          </div>

          <form onSubmit={handleAuth}>
            {isSignup && (
              <input
                type="text"
                placeholder="Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            )}

            <input
              type="email"
              placeholder="Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            {error && <p className="auth-error">{error}</p>}

            {message && <p className="auth-message">{message}</p>}

            <button className="auth-submit" type="submit">
              {isSignup ? "Create Account" : "Login"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (currentPage === "settings") {
    return (
      <div className="app">
        <header className="topbar">
          <div>
            <p className="eyebrow">SETTINGS</p>
            <h1>Business Profile</h1>
          </div>

          <button className="profile-button" onClick={showHome}>
            ← Back
          </button>
        </header>

        <main className="dashboard">
          <section className="welcome-card">
            <p>BUSINESS INFORMATION</p>

            <h2>Business Profile</h2>

            <span>
              Add your business details. Your information will be securely
              saved to your business account.
            </span>
          </section>

          <section className="section">
            <div className="profile-form">
              <label>Business Name</label>

              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Business Name"
              />

              <label>Phone Number</label>

              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="03XX XXXXXXX"
              />

              <label>WhatsApp Number</label>

              <input
                type="tel"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="03XX XXXXXXX"
              />

              <label>Business Address</label>

              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Enter business address"
                rows="4"
              />

              <div className="upload-placeholder">
                <div className="upload-icon">🖼️</div>

                <h3>Business Logo</h3>

                <p>
                  Logo upload will be connected to Supabase Storage in the next
                  step.
                </p>

                <button type="button">Choose Logo</button>
              </div>

              <div className="upload-placeholder">
                <div className="upload-icon">✍️</div>

                <h3>Digital Signature</h3>

                <p>
                  Signature upload will be connected to Supabase Storage in the
                  next step.
                </p>

                <button type="button">Choose Signature</button>
              </div>

              <button
                className="auth-submit"
                type="button"
                onClick={saveBusinessProfile}
                disabled={profileSaving}
              >
                {profileSaving ? "Saving..." : "Save Business Profile"}
              </button>

              {profileMessage && (
                <p className="auth-message">{profileMessage}</p>
              )}
            </div>
          </section>
        </main>
      </div>
    );
  }

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
          <p>WELCOME BACK</p>

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
        <button onClick={showHome}>
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

        <button onClick={showSettings}>
          ⚙️
          <span>Settings</span>
        </button>
      </nav>
    </div>
  );
}

export default App;
