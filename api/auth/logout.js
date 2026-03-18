import app from "../../server.js";

// Directly invoke Express app (Vercel serverless runtime calls this).
export default function handler(req, res) {
  return app(req, res);
}

