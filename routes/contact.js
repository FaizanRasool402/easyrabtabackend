import express from "express";
import { connectToDatabase } from "../lib/mongodb.js";
import ContactMessage from "../models/ContactMessage.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    await connectToDatabase();

    const { name, email, phone, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
      return res.status(400).json({
        message: "Name, email, subject, and message are required.",
      });
    }

    await ContactMessage.create({
      name,
      email: String(email).toLowerCase(),
      phone: phone ?? "",
      subject,
      message,
    });

    return res.status(201).json({
      message: "Message sent successfully. Our team will contact you shortly.",
    });
  } catch (error) {
    console.error("Contact form error:", error);
    const message =
      error instanceof Error ? error.message : "Contact request failed.";
    return res.status(500).json({ message });
  }
});

export default router;
