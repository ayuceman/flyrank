// One Supabase client for the whole app, built from .env.
const { createClient } = require("@supabase/supabase-js");

const { SUPABASE_URL, SUPABASE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_KEY. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

// This is a server, so I don't want the SDK trying to persist sessions
// anywhere or refresh tokens in the background. Every request carries its
// own token in the Authorization header.
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

module.exports = { supabase };
