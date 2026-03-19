import app from "../server.js";

// Vercel Node.js runtime directly accepts an Express app as the default export.
// No wrapper (serverless-http) needed — that's for AWS Lambda only.
export default app;
