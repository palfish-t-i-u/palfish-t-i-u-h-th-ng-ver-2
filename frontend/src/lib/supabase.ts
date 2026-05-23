import { createClient } from "@supabase/supabase-js";

// Fallback placeholders prevent createClient from throwing when env vars are
// missing in local dev (dev-mode bypass skips all Supabase calls anyway).
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || "https://placeholder.supabase.co",
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    "placeholder-anon-key"
);
