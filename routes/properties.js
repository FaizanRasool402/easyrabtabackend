import express from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { connectToDatabase } from "../lib/mongodb.js";
import { getTokenPayloadFromRequest } from "../lib/auth.js";
import Property from "../models/Property.js";
import User from "../models/User.js";

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsRoot = path.resolve(__dirname, "../uploads/properties");
const imagesDir = path.join(uploadsRoot, "images");
const videosDir = path.join(uploadsRoot, "videos");

fs.mkdirSync(imagesDir, { recursive: true });
fs.mkdirSync(videosDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, file, callback) => {
    if (file.mimetype.startsWith("image/")) {
      callback(null, imagesDir);
      return;
    }

    if (file.mimetype.startsWith("video/")) {
      callback(null, videosDir);
      return;
    }

    callback(new Error("Unsupported file type."), uploadsRoot);
  },
  filename: (_req, file, callback) => {
    const safeBaseName = path
      .parse(file.originalname)
      .name.replace(/[^a-zA-Z0-9-_]/g, "-")
      .toLowerCase();
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `${Date.now()}-${safeBaseName}${extension}`);
  },
});

const upload = multer({
  storage,
  limits: {
    files: 7,
    fileSize: 50 * 1024 * 1024,
  },
  fileFilter: (_req, file, callback) => {
    if (file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/")) {
      callback(null, true);
      return;
    }

    callback(new Error("Only image and video files are allowed."));
  },
});

function toFileUrl(filePath) {
  const normalizedPath = filePath.replace(/\\/g, "/");
  const uploadsIndex = normalizedPath.lastIndexOf("/uploads/");
  if (uploadsIndex === -1) {
    return normalizedPath;
  }

  return normalizedPath.slice(uploadsIndex);
}

router.get("/mine", async (req, res) => {
  try {
    await connectToDatabase();
    const payload = getTokenPayloadFromRequest(req);

    if (!payload?.id) {
      return res.status(401).json({ message: "Login required." });
    }

    const properties = await Property.find({ owner: payload.id })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ properties });
  } catch (error) {
    console.error("Properties mine error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to load properties.";
    return res.status(500).json({ message });
  }
});

router.get("/", async (req, res) => {
  try {
    await connectToDatabase();

    const filters = {};
    if (typeof req.query.purpose === "string" && req.query.purpose) {
      filters.purpose = req.query.purpose;
    }
    if (typeof req.query.propertyType === "string" && req.query.propertyType) {
      filters.propertyType = req.query.propertyType;
    }
    if (typeof req.query.tag === "string" && req.query.tag) {
      filters.tag = req.query.tag;
    }

    const properties = await Property.find(filters).sort({ createdAt: -1 }).lean();
    return res.status(200).json({ properties });
  } catch (error) {
    console.error("Properties list error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to load public properties.";
    return res.status(500).json({ message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    await connectToDatabase();
    const payload = getTokenPayloadFromRequest(req);

    if (!payload?.id) {
      return res.status(401).json({ message: "Login required." });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid property id." });
    }

    const property = await Property.findOne({
      _id: req.params.id,
      owner: payload.id,
    }).lean();

    if (!property) {
      return res.status(404).json({ message: "Property not found." });
    }

    return res.status(200).json({ property });
  } catch (error) {
    console.error("Property detail error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to load property.";
    return res.status(500).json({ message });
  }
});

router.post(
  "/",
  upload.fields([
    { name: "images", maxCount: 5 },
    { name: "videos", maxCount: 2 },
  ]),
  async (req, res) => {
    try {
      await connectToDatabase();
      const payload = getTokenPayloadFromRequest(req);

      if (!payload?.id) {
        return res
          .status(401)
          .json({ message: "Login is required to post a property." });
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
      } = req.body;
      const files = req.files ?? {};
      const imageFiles = Array.isArray(files.images) ? files.images : [];
      const videoFiles = Array.isArray(files.videos) ? files.videos : [];

      const finalContactName = contactName || user.name;
      const finalContactPhone = contactPhone || user.phone;

      if (!title || !city || !price || !finalContactPhone) {
        return res.status(400).json({
          message: "Title, city, price, and contact phone are required.",
        });
      }

      if (imageFiles.length > 5) {
        return res.status(400).json({ message: "Max 5 images allowed." });
      }

      if (videoFiles.length > 2) {
        return res.status(400).json({ message: "Max 2 videos allowed." });
      }

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
        images: imageFiles.map((file) => toFileUrl(file.path)),
        videos: videoFiles.map((file) => toFileUrl(file.path)),
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
  }
);

router.put("/:id", async (req, res) => {
  try {
    await connectToDatabase();
    const payload = getTokenPayloadFromRequest(req);

    if (!payload?.id) {
      return res.status(401).json({ message: "Login is required." });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid property id." });
    }

    const property = await Property.findOne({
      _id: req.params.id,
      owner: payload.id,
    });

    if (!property) {
      return res.status(404).json({ message: "Property not found." });
    }

    const allowedFields = [
      "title",
      "purpose",
      "propertyType",
      "city",
      "area",
      "address",
      "price",
      "bedrooms",
      "bathrooms",
      "areaSize",
      "coveredArea",
      "plotSize",
      "tag",
      "description",
      "contactName",
      "contactPhone",
    ];

    for (const field of allowedFields) {
      if (!(field in req.body)) {
        continue;
      }

      if (["price", "bedrooms", "bathrooms"].includes(field)) {
        const rawValue = req.body[field];
        property[field] = rawValue === "" || rawValue == null ? undefined : Number(rawValue);
        continue;
      }

      property[field] = req.body[field];
    }

    if (!property.title || !property.city || !property.price || !property.contactPhone) {
      return res.status(400).json({
        message: "Title, city, price, and contact phone are required.",
      });
    }

    await property.save();

    return res.status(200).json({
      message: "Property updated successfully.",
      property,
    });
  } catch (error) {
    console.error("Property update error:", error);
    const message =
      error instanceof Error ? error.message : "Property update failed.";
    return res.status(500).json({ message });
  }
});

export default router;
