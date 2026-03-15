import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import authRoutes from "./routes/auth.js";
import propertiesRoutes from "./routes/properties.js";
import contactRoutes from "./routes/contact.js";
import inquiriesRoutes from "./routes/inquiries.js";

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);
app.use(express.json({ limit: "50mb" }));
app.use(cookieParser());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

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

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
