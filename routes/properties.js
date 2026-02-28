import express from "express";
import { connectToDatabase } from "../lib/mongodb.js";
import { getTokenPayloadFromRequest } from "../lib/auth.js";
import Property from "../models/Property.js";
import User from "../models/User.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    await connectToDatabase();
    const payload = getTokenPayloadFromRequest(req);

    if (!payload?.id) {
      return res.status(401).json({ message: "Login is required to post a property." });
    }

    const user = await User.findById(payload.id).select("name phone");
    if (!user) {
      return res.status(401).json({ message: "User not found." });
    }

    const {
      title,
      purpose,
      propertyType,
      city,
      area,
      address,
      price,
      bedrooms,
      bathrooms,
      areaSize,
      coveredArea,
      plotSize,
      tag,
      description,
      contactName,
      contactPhone,
      images = [],
      videos = [],
    } = req.body;

    const finalContactName = contactName || user.name;
    const finalContactPhone = contactPhone || user.phone;

    if (!title || !city || !price || !finalContactPhone) {
      return res
        .status(400)
        .json({ message: "Title, city, price, and contact phone are required." });
    }

    if (!Array.isArray(images) || images.length > 5) {
      return res.status(400).json({ message: "Max 5 images allowed." });
    }

    if (!Array.isArray(videos) || videos.length > 2) {
      return res.status(400).json({ message: "Max 2 videos allowed." });
    }

    const normalizedImages = images
      .filter((item) => typeof item?.dataUrl === "string")
      .map((item) => item.dataUrl);
    const normalizedVideos = videos
      .filter((item) => typeof item?.dataUrl === "string")
      .map((item) => item.dataUrl);

    const property = await Property.create({
      owner: user._id,
      title,
      purpose,
      propertyType,
      city,
      area,
      address,
      price: Number(price),
      bedrooms: bedrooms ? Number(bedrooms) : undefined,
      bathrooms: bathrooms ? Number(bathrooms) : undefined,
      areaSize,
      coveredArea,
      plotSize,
      tag,
      description,
      contactName: finalContactName,
      contactPhone: finalContactPhone,
      images: normalizedImages,
      videos: normalizedVideos,
    });

    return res.status(201).json({
      message: "Property submitted successfully.",
      propertyId: property._id,
    });
  } catch (error) {
    console.error("Property create error:", error);
    const message =
      error instanceof Error ? error.message : "Property submit failed.";
    return res.status(500).json({ message });
  }
});

export default router;
