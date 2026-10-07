import React from "react";
import { useAuth } from "./AuthContext";
import Login from "./Login";

export default function ProtectedRoute({ children }) {
  const { user, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#fff",
        color: "#555",
        fontFamily: "Arial, sans-serif",
      }}>
        Checking secure session...
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <>
      {children}
      <button
        type="button"
        onClick={() => signOut()}
        title={user.email || "Sign out"}
        aria-label="Sign out"
        style={{
          position: "fixed",
          top: 10,
          right: 10,
          zIndex: 99999,
          border: "1px solid #ddd",
          borderRadius: 999,
          background: "#fff",
          color: "#333",
          padding: "8px 11px",
          fontSize: 12,
          fontWeight: 700,
          boxShadow: "0 4px 14px rgba(0,0,0,.12)",
        }}
      >
        Sign out
      </button>
    </>
  );
}
