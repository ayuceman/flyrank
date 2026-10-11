import { createApp } from "./app.js";

const PORT = process.env.PORT || 3000;
createApp().listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`model: ${process.env.LLM_MODEL || "(unset)"} via ${process.env.LLM_BASE_URL || "(unset)"} | stub=${process.env.LLM_STUB === "1"} | enabled=${process.env.LLM_ENABLED !== "false"}`);
});
