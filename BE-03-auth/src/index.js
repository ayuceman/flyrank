require("dotenv").config({ quiet: true });
const { createApp } = require("./app");

const PORT = process.env.PORT || 3000;

// Ping the auth service before listening so a wrong URL/key fails loudly
// at startup instead of on the first login attempt.
async function checkSupabase() {
  const url = process.env.SUPABASE_URL.replace(/\/+$/, "");
  if (!/^https?:\/\//.test(url)) {
    throw new Error(`SUPABASE_URL must start with https:// (got "${url}")`);
  }
  let res;
  try {
    res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: process.env.SUPABASE_KEY } });
  } catch (err) {
    const cause = err.cause ? `${err.cause.code || ""} ${err.cause.message || ""}`.trim() : err.message;
    throw new Error(`could not reach ${url} (${cause}) - check SUPABASE_URL in .env`);
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error(`Supabase rejected the key (${res.status}) - check SUPABASE_KEY in .env`);
  }
  if (!res.ok) throw new Error(`Supabase answered ${res.status} from ${url} - check SUPABASE_URL`);
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
