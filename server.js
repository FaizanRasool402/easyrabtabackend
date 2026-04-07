import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth.js";
import propertiesRoutes from "./routes/properties.js";
import contactRoutes from "./routes/contact.js";
import inquiriesRoutes from "./routes/inquiries.js";

const app = express();
const PORT = process.env.PORT || 5000;

const ALLOWED_ORIGINS = [
  "https://easyraabta.com",
  "https://www.easyraabta.com",
  "http://localhost:3000",
  process.env.FRONTEND_URL,
].filter(Boolean);

// CORS must be before all routes
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, Postman)
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Handle preflight OPTIONS requests for all routes
app.options("*", cors());

app.use(express.json({ limit: "50mb" }));
app.use(cookieParser());

// /uploads only works locally (Vercel filesystem is read-only)
if (!process.env.VERCEL) {
  const { fileURLToPath } = await import("url");
  const { default: path } = await import("path");
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  app.use("/uploads", express.static(path.join(__dirname, "uploads")));
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "easy-rabta-backend" });
});

app.use("/api/auth", authRoutes);
app.use("/api/properties", propertiesRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/inquiries", inquiriesRoutes);

app.use((error, _req, res, next) => {
  if (error?.type === "entity.too.large") {
    return res.status(413).json({
      message:
        "Uploaded files are too large. Please reduce image/video size and try again.",
    });
  }

  if (error?.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      message: "Each uploaded file must be 50MB or less.",
    });
  }

  if (error?.code === "LIMIT_FILE_COUNT") {
    return res.status(400).json({
      message: "You can upload up to 5 images and 2 videos only.",
    });
  }

  if (error instanceof Error) {
    return res.status(400).json({ message: error.message });
  }

  return next(error);
});

// Important: On Vercel we cannot (and should not) call app.listen().
// Instead, Vercel will call the Express app via serverless-http.
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
  });
}

export default app;
