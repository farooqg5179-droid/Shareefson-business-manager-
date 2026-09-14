import React, { useEffect, useRef, useState } from "react";
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

  // Logo and signature states
  const [logoUploading, setLogoUploading] = useState(false);
  const [signatureUploading, setSignatureUploading] = useState(false);

  const [logoMessage, setLogoMessage] = useState("");
  const [signatureMessage, setSignatureMessage] = useState("");

  const [logoPreview, setLogoPreview] = useState("");
  const [signaturePreview, setSignaturePreview] = useState("");

  const logoInputRef = useRef(null);
  const signatureInputRef = useRef(null);

  // ---------------------------------------------------
  // CUSTOMERS
  // ---------------------------------------------------

  const [customers, setCustomers] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(false);

  const [showCustomerForm, setShowCustomerForm] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerWhatsapp, setCustomerWhatsapp] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");

  const [customerMessage, setCustomerMessage] = useState("");
  const [customerSaving, setCustomerSaving] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const [editingCustomer, setEditingCustomer] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editWhatsapp, setEditWhatsapp] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editMessage, setEditMessage] = useState("");

  // ---------------------------------------------------
  // SESSION
  // ---------------------------------------------------

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

  // ---------------------------------------------------
  // LOAD BUSINESS PROFILE
  // ---------------------------------------------------

  useEffect(() => {
    async function loadBusinessProfile() {
      if (!session?.user?.id) {
        return;
      }

      const { data, error } = await supabase
        .from("ss_business_profiles")
        .select("*")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (error) {
        console.error("Profile loading error:", error);
        return;
      }

      if (!data) {
        return;
      }

      setBusinessName(
        data.business_name || "Shareef Sons Events Organizer"
      );

      setPhone(data.phone || "");
      setWhatsapp(data.whatsapp_number || "");
      setAddress(data.address || "");

      // Create temporary signed URL for private logo
      if (data.logo_url) {
        const { data: logoData, error: logoError } =
          await supabase.storage
            .from("ss-logos")
            .createSignedUrl(data.logo_url, 3600);

        if (!logoError && logoData?.signedUrl) {
          setLogoPreview(logoData.signedUrl);
        }
      }

      // Create temporary signed URL for private signature
      if (data.signature_url) {
        const { data: signatureData, error: signatureError } =
          await supabase.storage
            .from("ss-signatures")
            .createSignedUrl(data.signature_url, 3600);

        if (!signatureError && signatureData?.signedUrl) {
          setSignaturePreview(signatureData.signedUrl);
        }
      }
    }

    loadBusinessProfile();
  }, [session]);

  // ---------------------------------------------------
  // LOAD CUSTOMERS
  // ---------------------------------------------------

  async function loadCustomers() {
    if (!session?.user?.id) {
      return;
    }

    setCustomersLoading(true);
    setCustomerMessage("");

    const { data, error } = await supabase
      .from("ss_customers")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Customers loading error:", error);

      setCustomerMessage(
        "❌ Customers load failed: " + error.message
      );
    } else {
      setCustomers(data || []);
    }

    setCustomersLoading(false);
  }

  // Load customers when Customers page opens
  useEffect(() => {
    if (currentPage === "customers" && session?.user?.id) {
      loadCustomers();
    }
  }, [currentPage, session]);

  // ---------------------------------------------------
  // SAVE CUSTOMER
  // ---------------------------------------------------

  async function saveCustomer() {
    if (!customerName) {
      setCustomerMessage("❌ Please enter customer name.");
      return;
    }

    setCustomerSaving(true);
    setCustomerMessage("");

    const { error } = await supabase.from("ss_customers").insert({
      user_id: session.user.id,
      name: customerName,
      phone: customerPhone,
      whatsapp_number: customerWhatsapp,
      address: customerAddress,
      notes: customerNotes,
    });

    if (error) {
      console.error("Customer save error:", error);
      setCustomerMessage("❌ Save failed: " + error.message);
    } else {
      setCustomerMessage("✅ Customer saved successfully.");

      setCustomerName("");
      setCustomerPhone("");
      setCustomerWhatsapp("");
      setCustomerAddress("");
      setCustomerNotes("");

      setShowCustomerForm(false);

      loadCustomers();
    }

    setCustomerSaving(false);
  }

  // ---------------------------------------------------
  // EDIT CUSTOMER
  // ---------------------------------------------------

  function openEditCustomer() {
    setEditName(selectedCustomer.name || "");
    setEditPhone(selectedCustomer.phone || "");
    setEditWhatsapp(selectedCustomer.whatsapp_number || "");
    setEditAddress(selectedCustomer.address || "");
    setEditNotes(selectedCustomer.notes || "");
    setEditMessage("");
    setEditingCustomer(true);
  }

  async function updateCustomer() {
    if (!editName) {
      setEditMessage("❌ Please enter customer name.");
      return;
    }

    setEditSaving(true);
    setEditMessage("");

    const { error } = await supabase
      .from("ss_customers")
      .update({
        name: editName,
        phone: editPhone,
        whatsapp_number: editWhatsapp,
        address: editAddress,
        notes: editNotes,
      })
      .eq("id", selectedCustomer.id);

    if (error) {
      console.error("Customer update error:", error);
      setEditMessage("❌ Update failed: " + error.message);
    } else {
      const updatedCustomer = {
        ...selectedCustomer,
        name: editName,
        phone: editPhone,
        whatsapp_number: editWhatsapp,
        address: editAddress,
        notes: editNotes,
      };

      setSelectedCustomer(updatedCustomer);
      setEditingCustomer(false);
      loadCustomers();
    }

    setEditSaving(false);
  }

  // ---------------------------------------------------
  // AUTH
  // ---------------------------------------------------

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

  // ---------------------------------------------------
  // LOGOUT
  // ---------------------------------------------------

  async function handleLogout() {
    await supabase.auth.signOut();

    setSession(null);
    setCurrentPage("home");

    setLogoPreview("");
    setSignaturePreview("");
  }

  // ---------------------------------------------------
  // SAVE BUSINESS PROFILE
  // ---------------------------------------------------

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

      setProfileMessage(
        "❌ Profile save failed: " + error.message
      );
    } else {
      setProfileMessage(
        "✅ Business profile saved successfully."
      );
    }

    setProfileSaving(false);
  }

  // ---------------------------------------------------
  // UPLOAD LOGO
  // ---------------------------------------------------

  async function uploadLogo(file) {
    if (!file) {
      return;
    }

    setLogoMessage("");

    if (!file.type.startsWith("image/")) {
      setLogoMessage("❌ Please select an image file.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setLogoMessage("❌ Logo must be smaller than 5 MB.");
      return;
    }

    setLogoUploading(true);

    const userId = session.user.id;

    const fileExtension =
      file.name.split(".").pop()?.toLowerCase() || "png";

    const filePath = `${userId}/logo-${Date.now()}.${fileExtension}`;

    const { error: uploadError } = await supabase.storage
      .from("ss-logos")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });

    if (uploadError) {
      console.error("Logo upload error:", uploadError);

      setLogoMessage(
        "❌ Logo upload failed: " + uploadError.message
      );

      setLogoUploading(false);
      return;
    }

    const { data: signedData, error: signedError } =
      await supabase.storage
        .from("ss-logos")
        .createSignedUrl(filePath, 3600);

    if (!signedError && signedData?.signedUrl) {
      setLogoPreview(signedData.signedUrl);
    }

    const { error: profileError } = await supabase
      .from("ss_business_profiles")
      .upsert(
        {
          user_id: userId,
          business_name: businessName,
          phone: phone,
          whatsapp_number: whatsapp,
          address: address,
          logo_url: filePath,
        },
        {
          onConflict: "user_id",
        }
      );

    if (profileError) {
      console.error("Logo profile save error:", profileError);

      setLogoMessage(
        "⚠️ Logo uploaded, but profile path could not be saved."
      );
    } else {
      setLogoMessage("✅ Logo uploaded successfully.");
    }

    setLogoUploading(false);
  }

  // ---------------------------------------------------
  // UPLOAD DIGITAL SIGNATURE
  // ---------------------------------------------------

  async function uploadSignature(file) {
    if (!file) {
      return;
    }

    setSignatureMessage("");

    if (!file.type.startsWith("image/")) {
      setSignatureMessage("❌ Please select an image file.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setSignatureMessage(
        "❌ Signature must be smaller than 5 MB."
      );

      return;
    }

    setSignatureUploading(true);

    const userId = session.user.id;

    const fileExtension =
      file.name.split(".").pop()?.toLowerCase() || "png";

    const filePath =
      `${userId}/signature-${Date.now()}.${fileExtension}`;

    const { error: uploadError } = await supabase.storage
      .from("ss-signatures")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });

    if (uploadError) {
      console.error(
        "Signature upload error:",
        uploadError
      );

      setSignatureMessage(
        "❌ Signature upload failed: " +
          uploadError.message
      );

      setSignatureUploading(false);
      return;
    }

    const { data: signedData, error: signedError } =
      await supabase.storage
        .from("ss-signatures")
        .createSignedUrl(filePath, 3600);

    if (!signedError && signedData?.signedUrl) {
      setSignaturePreview(signedData.signedUrl);
    }

    const { error: profileError } = await supabase
      .from("ss_business_profiles")
      .upsert(
        {
          user_id: userId,
          business_name: businessName,
          phone: phone,
          whatsapp_number: whatsapp,
          address: address,
          signature_url: filePath,
        },
        {
          onConflict: "user_id",
        }
      );

    if (profileError) {
      console.error(
        "Signature profile save error:",
        profileError
      );

      setSignatureMessage(
        "⚠️ Signature uploaded, but profile path could not be saved."
      );
    } else {
      setSignatureMessage(
        "✅ Digital signature uploaded successfully."
      );
    }

    setSignatureUploading(false);
  }

  // ---------------------------------------------------
  // NAVIGATION
  // ---------------------------------------------------

  function showSettings() {
    setCurrentPage("settings");

    setProfileMessage("");
    setLogoMessage("");
    setSignatureMessage("");
  }

  function showCustomers() {
    setCurrentPage("customers");

    setShowCustomerForm(false);
    setCustomerMessage("");
    setSelectedCustomer(null);
    setEditingCustomer(false);
  }

  function showHome() {
    setCurrentPage("home");
  }

  // ---------------------------------------------------
  // LOADING
  // ---------------------------------------------------

  if (loading) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------
  // LOGIN / SIGNUP
  // ---------------------------------------------------

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

            {error && (
              <p className="auth-error">
                {error}
              </p>
            )}

            {message && (
              <p className="auth-message">
                {message}
              </p>
            )}

            <button
              className="auth-submit"
              type="submit"
            >
              {isSignup
                ? "Create Account"
                : "Login"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------
  // CUSTOMERS PAGE
  // ---------------------------------------------------

  if (currentPage === "customers" && selectedCustomer) {
    return (
      <div className="app">
        <header className="topbar">
          <div>
            <p className="eyebrow">CUSTOMER DETAIL</p>

            <h1>{selectedCustomer.name || "Unnamed Customer"}</h1>
          </div>

          <button
            className="profile-button"
            onClick={() => {
              setSelectedCustomer(null);
              setEditingCustomer(false);
            }}
          >
            ← Back
          </button>
        </header>

        <main className="dashboard">
          <section className="section">
            {editingCustomer ? (
              <div className="profile-form">
                <label>Customer Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />

                <label>Phone Number</label>
                <input
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                />

                <label>WhatsApp Number</label>
                <input
                  type="tel"
                  value={editWhatsapp}
                  onChange={(e) => setEditWhatsapp(e.target.value)}
                />

                <label>Address</label>
                <textarea
                  rows="3"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                />

                <label>Notes</label>
                <textarea
                  rows="3"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                />

                <button
                  className="auth-submit"
                  type="button"
                  onClick={updateCustomer}
                  disabled={editSaving}
                >
                  {editSaving ? "Saving..." : "Save Changes"}
                </button>

                <button
                  className="profile-button"
                  type="button"
                  onClick={() => setEditingCustomer(false)}
                >
                  Cancel
                </button>

                {editMessage && (
                  <p className="auth-message">{editMessage}</p>
                )}
              </div>
            ) : (
              <div className="profile-form">
                <label>Customer Name</label>
                <p>{selectedCustomer.name || "—"}</p>

                <label>Phone Number</label>
                <p>{selectedCustomer.phone || "—"}</p>

                <label>WhatsApp Number</label>
                <p>{selectedCustomer.whatsapp_number || "—"}</p>

                <label>Address</label>
                <p>{selectedCustomer.address || "—"}</p>

                <label>Notes</label>
                <p>{selectedCustomer.notes || "—"}</p>

                <button
                  className="auth-submit"
                  type="button"
                  onClick={openEditCustomer}
                >
                  Edit Customer
                </button>
              </div>
            )}
          </section>
        </main>

        <nav className="bottom-nav">
          <button onClick={showHome}>
            ⌂
            <span>Home</span>
          </button>

          <button
            className="active"
            onClick={() => {
              setSelectedCustomer(null);
              setEditingCustomer(false);
            }}
          >
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

  if (currentPage === "customers") {
    return (
      <div className="app">
        <header className="topbar">
          <div>
            <p className="eyebrow">CUSTOMERS</p>

            <h1>Customers</h1>
          </div>

          <button
            className="profile-button"
            onClick={showHome}
          >
            ← Back
          </button>
        </header>

        <main className="dashboard">
          <section className="welcome-card">
            <p>CUSTOMER MANAGEMENT</p>

            <h2>Your Customers</h2>

            <span>
              Add and manage your event customers from one
              place.
            </span>
          </section>

          <section className="section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">CUSTOMERS</p>

                <h2>Customer List</h2>
              </div>

              <button
                className="profile-button"
                onClick={() => {
                  setShowCustomerForm(
                    !showCustomerForm
                  );

                  setCustomerMessage("");
                }}
              >
                + New Customer
              </button>
            </div>

            {showCustomerForm && (
              <div className="profile-form">
                <label>Customer Name</label>

                <input
                  type="text"
                  placeholder="Enter customer name"
                  value={customerName}
                  onChange={(e) =>
                    setCustomerName(e.target.value)
                  }
                />

                <label>Phone Number</label>

                <input
                  type="tel"
                  placeholder="03XX XXXXXXX"
                  value={customerPhone}
                  onChange={(e) =>
                    setCustomerPhone(e.target.value)
                  }
                />

                <label>WhatsApp Number</label>

                <input
                  type="tel"
                  placeholder="03XX XXXXXXX"
                  value={customerWhatsapp}
                  onChange={(e) =>
                    setCustomerWhatsapp(
                      e.target.value
                    )
                  }
                />

                <label>Address</label>

                <textarea
                  placeholder="Customer address"
                  rows="3"
                  value={customerAddress}
                  onChange={(e) =>
                    setCustomerAddress(
                      e.target.value
                    )
                  }
                />

                <label>Notes</label>

                <textarea
                  placeholder="Additional notes"
                  rows="3"
                  value={customerNotes}
                  onChange={(e) =>
                    setCustomerNotes(
                      e.target.value
                    )
                  }
                />

                <button
                  className="auth-submit"
                  type="button"
                  onClick={saveCustomer}
                  disabled={customerSaving}
                >
                  {customerSaving ? "Saving..." : "Save Customer"}
                </button>

                {customerMessage && (
                  <p className="auth-message">
                    {customerMessage}
                  </p>
                )}
              </div>
            )}
          </section>

          <section className="section">
            {customerMessage &&
              !showCustomerForm && (
                <p className="auth-message">
                  {customerMessage}
                </p>
              )}

            {customersLoading ? (
              <div className="welcome-card">
                <p>Loading customers...</p>
              </div>
            ) : customers.length === 0 ? (
              <div className="welcome-card">
                <p className="eyebrow">
                  NO CUSTOMERS
                </p>

                <h2>No customers yet</h2>

                <span>
                  Click "+ New Customer" to add your
                  first customer.
                </span>
              </div>
            ) : (
              <div className="actions-grid">
                {customers.map((customer) => (
                  <div
                    className="stat-card"
                    key={customer.id}
                    onClick={() => setSelectedCustomer(customer)}
                    style={{ cursor: "pointer" }}
                  >
                    <span>
                      {customer.name ||
                        "Unnamed Customer"}
                    </span>

                    <strong>
                      {customer.phone ||
                        "No phone"}
                    </strong>

                    {customer.whatsapp_number && (
                      <small>
                        WhatsApp:{" "}
                        {customer.whatsapp_number}
                      </small>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </main>

        <nav className="bottom-nav">
          <button onClick={showHome}>
            ⌂
            <span>Home</span>
          </button>

          <button
            className="active"
            onClick={showCustomers}
          >
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

  // ---------------------------------------------------
  // SETTINGS PAGE
  // ---------------------------------------------------

  if (currentPage === "settings") {
    return (
      <div className="app">
        <header className="topbar">
          <div>
            <p className="eyebrow">SETTINGS</p>

            <h1>Business Profile</h1>
          </div>

          <button
            className="profile-button"
            onClick={showHome}
          >
            ← Back
          </button>
        </header>

        <main className="dashboard">
          <section className="welcome-card">
            <p>BUSINESS INFORMATION</p>

            <h2>Business Profile</h2>

            <span>
              Add your business details. Your
              information will be securely saved to
              your business account.
            </span>
          </section>

          <section className="section">
            <div className="profile-form">
              <label>Business Name</label>

              <input
                type="text"
                value={businessName}
                onChange={(e) =>
                  setBusinessName(e.target.value)
                }
                placeholder="Business Name"
              />

              <label>Phone Number</label>

              <input
                type="tel"
                value={phone}
                onChange={(e) =>
                  setPhone(e.target.value)
                }
                placeholder="03XX XXXXXXX"
              />

              <label>WhatsApp Number</label>

              <input
                type="tel"
                value={whatsapp}
                onChange={(e) =>
                  setWhatsapp(e.target.value)
                }
                placeholder="03XX XXXXXXX"
              />

              <label>Business Address</label>

              <textarea
                value={address}
                onChange={(e) =>
                  setAddress(e.target.value)
                }
                placeholder="Enter business address"
                rows="4"
              />

              {/* BUSINESS LOGO */}

              <div className="upload-placeholder">
                <div className="upload-icon">
                  🖼️
                </div>

                <h3>Business Logo</h3>

                {logoPreview && (
                  <img
                    src={logoPreview}
                    alt="Business Logo"
                    style={{
                      width: "140px",
                      maxHeight: "140px",
                      objectFit: "contain",
                      display: "block",
                      margin: "15px auto",
                      borderRadius: "12px",
                      border: "1px solid #ddd",
                      padding: "8px",
                    }}
                  />
                )}

                <p>
                  Upload your business logo from
                  your mobile gallery. Maximum size:
                  5 MB.
                </p>

                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    uploadLogo(
                      e.target.files?.[0]
                    );

                    e.target.value = "";
                  }}
                />

                <button
                  type="button"
                  onClick={() =>
                    logoInputRef.current?.click()
                  }
                  disabled={logoUploading}
                >
                  {logoUploading
                    ? "Uploading..."
                    : "Choose Logo"}
                </button>

                {logoMessage && (
                  <p className="auth-message">
                    {logoMessage}
                  </p>
                )}
              </div>

              {/* DIGITAL SIGNATURE */}

              <div className="upload-placeholder">
                <div className="upload-icon">
                  ✍️
                </div>

                <h3>Digital Signature</h3>

                {signaturePreview && (
                  <img
                    src={signaturePreview}
                    alt="Digital Signature"
                    style={{
                      width: "180px",
                      maxHeight: "100px",
                      objectFit: "contain",
                      display: "block",
                      margin: "15px auto",
                      borderRadius: "12px",
                      border: "1px solid #ddd",
                      padding: "8px",
                    }}
                  />
                )}

                <p>
                  Upload your digital signature from
                  your mobile gallery. Maximum size:
                  5 MB.
                </p>

                <input
                  ref={signatureInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    uploadSignature(
                      e.target.files?.[0]
                    );

                    e.target.value = "";
                  }}
                />

                <button
                  type="button"
                  onClick={() =>
                    signatureInputRef.current?.click()
                  }
                  disabled={signatureUploading}
                >
                  {signatureUploading
                    ? "Uploading..."
                    : "Choose Signature"}
                </button>

                {signatureMessage && (
                  <p className="auth-message">
                    {signatureMessage}
                  </p>
                )}
              </div>

              <button
                className="auth-submit"
                type="button"
                onClick={saveBusinessProfile}
                disabled={profileSaving}
              >
                {profileSaving
                  ? "Saving..."
                  : "Save Business Profile"}
              </button>

              {profileMessage && (
                <p className="auth-message">
                  {profileMessage}
                </p>
              )}
            </div>
          </section>
        </main>
      </div>
    );
  }

  // ---------------------------------------------------
  // HOME PAGE
  // ---------------------------------------------------

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <p className="eyebrow">SHAREEF SONS</p>

          <h1>Business Manager</h1>
        </div>

        <button
          className="profile-button"
          onClick={handleLogout}
        >
          Logout
        </button>
      </header>

      <main className="dashboard">
        <section className="welcome-card">
          <p>WELCOME BACK</p>

          <h2>
            Shareef Sons Events Organizer
          </h2>

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
              <p className="eyebrow">
                QUICK ACTIONS
              </p>

              <h2>Manage Business</h2>
            </div>
          </div>

          <div className="actions-grid">
            <button
              onClick={showCustomers}
            >
              + New Customer
            </button>

            <button>
              + New Booking
            </button>

            <button>
              + Create Invoice
            </button>

            <button>
              + Payment In
            </button>

            <button>
              + Payment Out
            </button>

            <button>
              + Add Note
            </button>
          </div>
        </section>
      </main>

      <nav className="bottom-nav">
        <button onClick={showHome}>
          ⌂
          <span>Home</span>
        </button>

        <button onClick={showCustomers}>
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
                
