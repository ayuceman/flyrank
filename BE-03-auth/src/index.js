require("dotenv").config({ quiet: true });
const { createApp } = require("./app");

const PORT = process.env.PORT || 3000;

// Ping the auth service before listening so a wrong URL/key fails loudly
// at startup instead of on the first login attempt.
async function checkSupabase() {
  const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/settings`, {
    headers: { apikey: process.env.SUPABASE_KEY },
  });
  if (!res.ok) throw new Error(`Supabase answered ${res.status} - check SUPABASE_URL / SUPABASE_KEY`);
}

async function start() {
  require("./supabase"); // validates env, exits if missing
  await checkSupabase();
  createApp().listen(PORT, () => {
    console.log("Server running and connected to Supabase");
    console.log(`http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error("failed to start:", err.message);
  process.exit(1);
});
