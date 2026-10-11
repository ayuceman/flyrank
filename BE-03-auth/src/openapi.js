// OpenAPI 3 description of the API. swagger-ui-express renders it at /docs.
// The `bearerAuth` security scheme is what makes the Authorize padlock show up.

const credentials = {
  type: "object",
  required: ["email", "password"],
  properties: {
    email: { type: "string", format: "email", example: "me@example.com" },
    password: { type: "string", format: "password", example: "correct horse battery" },
  },
};

const errorBody = (example) => ({
  "application/json": {
    schema: { type: "object", properties: { error: { type: "string" } } },
    example: { error: example },
  },
});

module.exports = {
  openapi: "3.0.3",
  info: {
    title: "BE-03 Auth API",
    version: "1.0.0",
    description:
      "Sign up, log in and log out with Supabase Auth. Routes under /protected need a bearer token: " +
      "log in, copy the access_token, click Authorize and paste it.",
  },
  servers: [{ url: "/" }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: { Credentials: credentials },
  },
  tags: [
    { name: "auth", description: "Sign up / log in / log out" },
    { name: "public", description: "No token needed" },
    { name: "protected", description: "Token needed" },
  ],
  paths: {
    "/auth/signup": {
      post: {
        tags: ["auth"],
        summary: "Create an account",
        requestBody: { required: true, content: { "application/json": { schema: credentials } } },
        responses: {
          201: { description: "Created" },
          400: { description: "Missing/invalid email or password", content: errorBody("email and password are required") },
        },
      },
    },
    "/auth/login": {
      post: {
        tags: ["auth"],
        summary: "Log in and get a JWT",
        requestBody: { required: true, content: { "application/json": { schema: credentials } } },
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                example: { access_token: "eyJhbGciOi...", refresh_token: "...", token_type: "bearer", expires_in: 3600, user: { id: "uuid", email: "me@example.com" } },
              },
            },
          },
          400: { description: "Missing fields", content: errorBody("email and password are required") },
          401: { description: "Wrong email or password", content: errorBody("Invalid login credentials") },
        },
      },
    },
    "/auth/logout": {
      post: {
        tags: ["auth"],
        summary: "Log out (revokes the token)",
        security: [{ bearerAuth: [] }],
        responses: {
          204: { description: "Logged out" },
          401: { description: "No or bad token", content: errorBody("Access token required") },
        },
      },
    },
    "/public/info": {
      get: {
        tags: ["public"],
        summary: "Public info",
        responses: {
          200: { description: "OK", content: { "application/json": { example: { message: "Welcome stranger! This info is public." } } } },
        },
      },
    },
    "/protected/profile": {
      get: {
        tags: ["protected"],
        summary: "Your profile",
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "OK", content: { "application/json": { example: { message: "This is your private profile.", user: { id: "uuid", email: "me@example.com", created_at: "2026-10-11T00:00:00Z" } } } } },
          401: { description: "No or bad token", content: errorBody("Invalid or expired token") },
        },
      },
    },
    "/protected/dashboard": {
      get: {
        tags: ["protected"],
        summary: "Dashboard",
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "OK" },
          401: { description: "No or bad token", content: errorBody("Access token required") },
        },
      },
    },
  },
};
