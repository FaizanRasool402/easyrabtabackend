import serverless from "serverless-http";
import app from "../../server.js";

// Vercel function for /api/auth/logout
export default serverless(app);

