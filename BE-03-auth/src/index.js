require("dotenv").config({ quiet: true });
const express = require("express");
const { supabase } = require("./supabase");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "Auth API - BE-03" });
});

async function start() {
  // cheap call just to prove the URL and key are good before accepting traffic
  const { error } = await supabase.auth.getSession();
  if (error) throw error;
  app.listen(PORT, () => {
    console.log("Server running and connected to Supabase");
    console.log(`http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error("failed to start:", err.message);
  process.exit(1);
});
