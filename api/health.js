import serverless from "serverless-http";
import app from "../server.js";

// Vercel function for /api/health
export default serverless(app);

