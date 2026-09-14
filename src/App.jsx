import React, { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

function App() {
  const [status, setStatus] = useState("Checking Supabase...");

  useEffect(() => {
    async function testSupabase() {
      const { error } = await supabase
        .from("ss_business_profiles")
        .select("id")
        .limit(1);

      if (error) {
        console.error(error);
        setStatus("❌ Supabase connection failed");
      } else {
        setStatus("✅ Supabase connected successfully");
      }
    }

    testSupabase();
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#ffffff",
        padding: "20px",
        textAlign: "center",
      }}
    >
      <div>
        <h1 style={{ color: "#a98216" }}>
          Shareef Sons Business Manager
        </h1>

        <p>{status}</p>
      </div>
    </div>
  );
}

export default App;
