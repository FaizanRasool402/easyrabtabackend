import serverless from "serverless-http";
import app from "../../server.js";

// Vercel function for /api/auth/login
export default serverless(app);

