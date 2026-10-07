import React from "react";
import { useAuth } from "./AuthContext";
import Login from "./Login";

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

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

  return children;
}
