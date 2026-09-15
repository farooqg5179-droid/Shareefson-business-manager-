import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

export const supabaseConfigError =
  !supabaseUrl ||
  !supabaseKey ||
  !String(supabaseUrl).startsWith("http");

export const supabase = supabaseConfigError
  ? null
  : createClient(supabaseUrl, supabaseKey);
