const express = require("express");
const swaggerUi = require("swagger-ui-express");
const openapi = require("./openapi");
const authRoutes = require("./routes/auth");
const publicRoutes = require("./routes/public");
const protectedRoutes = require("./routes/protected");

function createApp() {
  const app = express();
  app.use(express.json());

  app.get("/", (req, res) => {
    res.json({ message: "Auth API - BE-03", docs: "/docs" });
  });

  app.use("/auth", authRoutes);
  app.use("/public", publicRoutes);
  app.use("/protected", protectedRoutes);

  // Swagger UI at /docs, raw spec at /openapi.json
  app.get("/openapi.json", (req, res) => res.json(openapi));
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: "BE-03 Auth API" }));

  app.use((req, res) => res.status(404).json({ error: "Not found" }));

  app.use((err, req, res, next) => {
    if (err.type === "entity.parse.failed") {
      return res.status(400).json({ error: "Invalid JSON body" });
    }
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}

module.exports = { createApp };
