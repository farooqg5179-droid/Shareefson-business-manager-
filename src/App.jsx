import React from "react";

function App() {
  return (
    <div className="app">
      <header className="topbar">
        <div>
          <p className="eyebrow">SHAREEF SONS</p>
          <h1>Business Manager</h1>
        </div>

        <div className="profile-button">
          👤
        </div>
      </header>

      <main className="dashboard">
        <section className="welcome-card">
          <p>Welcome back</p>
          <h2>Shareef Sons Events Organizer</h2>
          <span>Manage your events, bookings and payments.</span>
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

        <section className="section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">UPCOMING</p>
              <h2>Upcoming Events</h2>
            </div>
          </div>

          <div className="empty-card">
            <div className="empty-icon">📅</div>
            <h3>No upcoming events</h3>
            <p>
              Your upcoming bookings will appear here.
            </p>
          </div>
        </section>
      </main>

      <nav className="bottom-nav">
        <button>⌂<span>Home</span></button>
        <button>👥<span>Customers</span></button>
        <button>📅<span>Bookings</span></button>
        <button>🧾<span>Invoices</span></button>
        <button>⚙️<span>Settings</span></button>
      </nav>
    </div>
  );
}

export default App;
