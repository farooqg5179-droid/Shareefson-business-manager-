import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY || "";

export const supabaseConfigError =
  !supabaseUrl || !supabaseKey
    ? "Supabase configuration is missing. Add VITE_SUPABASE_URL and VITE_SUPABASE_KEY to GitHub Actions Secrets, then rebuild the APK."
    : "";

export const supabase = supabaseConfigError
  ? null
  : createClient(supabaseUrl, supabaseKey);
