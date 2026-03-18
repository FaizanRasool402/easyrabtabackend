import serverless from "serverless-http";
import app from "../server.js";

// Catch-all API handler:
// - Vercel routes requests like /api/anything here
// - serverless-http forwards the request to your Express app routes
export default serverless(app);
