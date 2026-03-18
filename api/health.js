import app from "../server.js";

// Vercel calls this handler with (req, res). Express apps are callable as middleware.
export default function handler(req, res) {
  return app(req, res);
}

