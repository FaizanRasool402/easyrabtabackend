import express from "express";
import mongoose from "mongoose";
import { connectToDatabase } from "../lib/mongodb.js";
import { getTokenPayloadFromRequest } from "../lib/auth.js";
import Property from "../models/Property.js";
import PropertyInquiry from "../models/PropertyInquiry.js";

const router = express.Router();

router.get("/mine", async (req, res) => {
  try {
    await connectToDatabase();
    const payload = getTokenPayloadFromRequest(req);

    if (!payload?.id) {
      return res.status(401).json({ message: "Login required." });
    }

    const inquiries = await PropertyInquiry.find({ owner: payload.id })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ inquiries });
  } catch (error) {
    console.error("Inquiry list error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to load inquiries.";
    return res.status(500).json({ message });
  }
});

router.post("/", async (req, res) => {
  try {
    await connectToDatabase();

    const { propertyId, senderName, senderEmail, senderPhone, message } = req.body;

    if (!propertyId || !senderName || !senderEmail || !message) {
      return res.status(400).json({
        message: "Property, name, email, and message are required.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(propertyId)) {
      return res.status(400).json({ message: "Invalid property id." });
    }

    const property = await Property.findById(propertyId).select("owner title");
    if (!property) {
      return res.status(404).json({ message: "Property not found." });
    }

    await PropertyInquiry.create({
      property: property._id,
      owner: property.owner,
      propertyTitle: property.title,
      senderName,
      senderEmail: String(senderEmail).toLowerCase(),
      senderPhone: senderPhone ?? "",
      message,
    });

    return res.status(201).json({
      message: "Inquiry sent successfully.",
    });
  } catch (error) {
    console.error("Inquiry create error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to send inquiry.";
    return res.status(500).json({ message });
  }
});

export default router;
