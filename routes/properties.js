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
import { imageFileToDataUrl } from "../lib/imageUpload.js";

const router = express.Router();
const LISTING_DAYS = 30;
const MONTHLY_USER_EDIT_LIMIT = 3;
const PAID_TAGS = ["premium", "hot-deal", "investor-pick"];
const USER_ALLOWED_TAGS = ["featured", "premium", "hot-deal", "investor-pick", "new", "budget"];

// On Vercel, filesystem is read-only so disk storage is not available.
// Use memory storage on Vercel, disk storage locally.
const isVercel = !!process.env.VERCEL;

let upload;

if (isVercel) {
  upload = multer({
    storage: multer.memoryStorage(),
    limits: { files: 8, fileSize: 50 * 1024 * 1024 },
    fileFilter: (_req, file, callback) => {
      if (file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/")) {
        callback(null, true);
        return;
      }
      callback(new Error("Only image and video files are allowed."));
    },
  });
} else {
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

  upload = multer({
    storage,
    limits: { files: 8, fileSize: 50 * 1024 * 1024 },
    fileFilter: (_req, file, callback) => {
      if (file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/")) {
        callback(null, true);
        return;
      }
      callback(new Error("Only image and video files are allowed."));
    },
  });
}

function uploadsPathForFile(file) {
  const folder = file.mimetype?.startsWith("video/") ? "videos" : "images";
  return `/uploads/properties/${folder}/${file.filename}`;
}

function toFileUrl(filePath, file) {
  if (!filePath) {
    return file?.filename ? uploadsPathForFile(file) : null;
  }

  const normalizedPath = filePath.replace(/\\/g, "/");
  const uploadsIndex = normalizedPath.lastIndexOf("/uploads/");
  if (uploadsIndex !== -1) {
    return normalizedPath.slice(uploadsIndex);
  }

  return file?.filename ? uploadsPathForFile(file) : null;
}

/** Multer sometimes returns a single file object instead of [file] for one upload. */
function multerFileArray(value) {
  if (value == null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function fileToVideoUrl(file) {
  if (!file) {
    return null;
  }

  if (file.path) {
    const url = toFileUrl(file.path, file);
    if (url) {
      return url;
    }
  }

  if (file.filename) {
    return uploadsPathForFile(file);
  }

  return null;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function monthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

function userSafeTag(tag) {
  return USER_ALLOWED_TAGS.includes(tag) ? tag : "featured";
}

function isSuperAdmin(payload) {
  return payload?.role === "super_admin" || payload?.email === "admin@gmail.com";
}

function listingExpiresAt(property) {
  if (property.expiresAt) {
    return new Date(property.expiresAt);
  }

  return addDays(property.createdAt ?? new Date(), LISTING_DAYS);
}

function publicListingFilter(baseFilters = {}) {
  const cutoff = new Date(Date.now() - LISTING_DAYS * 24 * 60 * 60 * 1000);
  return {
    ...baseFilters,
    status: { $nin: ["expired", "sold"] },
    $or: [
      { expiresAt: { $gte: new Date() } },
      { expiresAt: { $exists: false }, createdAt: { $gte: cutoff } },
    ],
  };
}

function serializeProperty(property) {
  const serialized = property.toObject ? property.toObject() : { ...property };
  const expiresAt = listingExpiresAt(serialized);
  const expired = expiresAt.getTime() < Date.now() || serialized.status === "expired";
  const currentMonthKey = monthKey();
  const monthlyEditCount =
    serialized.monthlyEditKey === currentMonthKey
      ? Number(serialized.monthlyEditCount ?? 0)
      : 0;
  const isPaidListing =
    Boolean(serialized.isPaidListing) || serialized.paymentStatus === "verified";

  return {
    ...serialized,
    tag:
      serialized.tag === "verified" && serialized.paymentStatus !== "verified"
        ? "featured"
        : serialized.tag,
    isPaidListing,
    expiresAt,
    status: expired ? "expired" : serialized.status ?? "active",
    monthlyEditCount,
    monthlyEditLimit: MONTHLY_USER_EDIT_LIMIT,
    remainingMonthlyEdits: Math.max(0, MONTHLY_USER_EDIT_LIMIT - monthlyEditCount),
  };
}

function mediaDataUrl(file) {
  if (!file?.buffer || !file?.mimetype) {
    return "";
  }

  return `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
}

function uploadedImageUrls(imageFiles) {
  if (isVercel) {
    return imageFiles.map(mediaDataUrl).filter(Boolean);
  }

  return imageFiles.map((file) => toFileUrl(file.path));
}

function uploadedVideoUrls(videoFiles) {
  if (isVercel) {
    return [];
  }

  return videoFiles.map((file) => toFileUrl(file.path));
}

function parseStringArray(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === "string");
  }

  if (typeof value !== "string" || !value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item) => typeof item === "string")
      : [];
  } catch {
    return [value];
  }
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

    return res.status(200).json({ properties: properties.map(serializeProperty) });
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
    const payload = getTokenPayloadFromRequest(req);

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

    const query = isSuperAdmin(payload) ? filters : publicListingFilter(filters);
    const properties = await Property.find(query)
      .sort({ isPaidListing: -1, createdAt: -1 })
      .lean();
    return res.status(200).json({ properties: properties.map(serializeProperty) });
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

    const filters = { _id: req.params.id };
    if (!isSuperAdmin(payload)) {
      filters.owner = payload.id;
    }

    const property = await Property.findOne(filters).lean();

    if (!property) {
      return res.status(404).json({ message: "Property not found." });
    }

    if (!isSuperAdmin(payload)) {
      const currentMonthKey = monthKey();
      const currentEditCount =
        property.monthlyEditKey === currentMonthKey
          ? Number(property.monthlyEditCount ?? 0)
          : 0;

      if (currentEditCount >= MONTHLY_USER_EDIT_LIMIT) {
        return res.status(429).json({
          message:
            "Monthly edit limit reached. You can edit each listing only 3 times in a month.",
          monthlyEditLimit: MONTHLY_USER_EDIT_LIMIT,
          monthlyEditCount: currentEditCount,
          remainingMonthlyEdits: 0,
        });
      }

      property.monthlyEditKey = currentMonthKey;
      property.monthlyEditCount = currentEditCount + 1;
    }

    return res.status(200).json({ property: serializeProperty(property) });
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
    { name: "paymentProof", maxCount: 1 },
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
        paymentReference,
      } = req.body;
      const files = req.files ?? {};
      const imageFiles = multerFileArray(files.images);
      const videoFiles = multerFileArray(files.videos);
      const paymentProofFiles = multerFileArray(files.paymentProof);

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

      const imageUrls = (
        await Promise.all(imageFiles.map((file) => imageFileToDataUrl(file)))
      ).filter((url) => typeof url === "string" && url.length > 0);

      const videoUrls = videoFiles
        .map((file) => fileToVideoUrl(file))
        .filter((url) => typeof url === "string" && url.length > 0);
      const safeTag = userSafeTag(tag);
      const paidTagRequested = PAID_TAGS.includes(safeTag);
      const paymentProofUrl =
        (await imageFileToDataUrl(paymentProofFiles[0])) ?? "";

      if (paidTagRequested && (!paymentReference || !paymentProofUrl)) {
        return res.status(400).json({
          message:
            "Paid listings require bank payment reference and payment proof screenshot.",
        });
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
        tag: safeTag,
        isPaidListing: false,
        paymentStatus: paidTagRequested ? "pending" : "unpaid",
        paymentReference,
        paymentProof: paymentProofUrl,
        description,
        contactName: finalContactName,
        contactPhone: finalContactPhone,
        images: imageUrls,
        videos: videoUrls,
        expiresAt: addDays(new Date(), LISTING_DAYS),
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

router.put(
  "/:id",
  upload.fields([
    { name: "images", maxCount: 5 },
    { name: "videos", maxCount: 2 },
    { name: "paymentProof", maxCount: 1 },
  ]),
  async (req, res) => {
  try {
    await connectToDatabase();
    const payload = getTokenPayloadFromRequest(req);

    if (!payload?.id) {
      return res.status(401).json({ message: "Login is required." });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid property id." });
    }

    const filters = { _id: req.params.id };
    if (!isSuperAdmin(payload)) {
      filters.owner = payload.id;
    }

    const property = await Property.findOne(filters);

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
      "status",
      "isPaidListing",
      "paymentStatus",
      "paymentReference",
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

      if (field === "isPaidListing") {
        if (!isSuperAdmin(payload)) {
          continue;
        }
        property[field] = req.body[field] === true || req.body[field] === "true";
        continue;
      }

      if (field === "paymentStatus" && !isSuperAdmin(payload)) {
        continue;
      }

      if (field === "tag" && !isSuperAdmin(payload)) {
        property[field] = userSafeTag(req.body[field]);
        continue;
      }

      property[field] = req.body[field];
    }

    const files = req.files ?? {};
    const imageFiles = multerFileArray(files.images);
    const videoFiles = multerFileArray(files.videos);
    const paymentProofFiles = multerFileArray(files.paymentProof);
    const existingImages = parseStringArray(req.body.existingImages);
    const existingVideos = parseStringArray(req.body.existingVideos);

    if ("existingImages" in req.body || imageFiles.length > 0) {
      const newImageUrls = (
        await Promise.all(imageFiles.map((file) => imageFileToDataUrl(file)))
      ).filter((url) => typeof url === "string" && url.length > 0);
      const nextImages = [...existingImages, ...newImageUrls];
      if (nextImages.length > 5) {
        return res.status(400).json({ message: "Max 5 images allowed." });
      }
      property.images = nextImages;
    }

    if ("existingVideos" in req.body || videoFiles.length > 0) {
      const newVideoUrls = videoFiles
        .map((file) => fileToVideoUrl(file))
        .filter((url) => typeof url === "string" && url.length > 0);
      const nextVideos = [...existingVideos, ...newVideoUrls];
      if (nextVideos.length > 2) {
        return res.status(400).json({ message: "Max 2 videos allowed." });
      }
      property.videos = nextVideos;
    }

    if (paymentProofFiles.length > 0) {
      property.paymentProof = (await imageFileToDataUrl(paymentProofFiles[0])) ?? "";
    }

    const paidTagRequested = PAID_TAGS.includes(property.tag);
    if (
      paidTagRequested &&
      property.paymentStatus !== "verified" &&
      (!property.paymentReference || !property.paymentProof)
    ) {
      return res.status(400).json({
        message:
          "Paid listings require bank payment reference and payment proof screenshot.",
      });
    }
    if (
      property.paymentStatus === "verified" &&
      (!property.paymentReference || !property.paymentProof)
    ) {
      return res.status(400).json({
        message:
          "Admin verification requires bank payment reference and proof screenshot.",
      });
    }
    if (paidTagRequested && property.paymentStatus === "unpaid") {
      property.paymentStatus = "pending";
    }
    property.isPaidListing = property.paymentStatus === "verified";

    if (!property.title || !property.city || !property.price || !property.contactPhone) {
      return res.status(400).json({
        message: "Title, city, price, and contact phone are required.",
      });
    }

    await property.save();

    return res.status(200).json({
      message: "Property updated successfully.",
      property: serializeProperty(property),
    });
  } catch (error) {
    console.error("Property update error:", error);
    const message =
      error instanceof Error ? error.message : "Property update failed.";
    return res.status(500).json({ message });
  }
});

router.post("/:id/view", async (req, res) => {
  try {
    await connectToDatabase();

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid property id." });
    }

    const today = new Date().toISOString().slice(0, 10);
    const property = await Property.findById(req.params.id);
    if (!property) {
      return res.status(404).json({ message: "Property not found." });
    }

    const day = property.dailyViews.find((item) => item.date === today);
    if (day) {
      day.count += 1;
    } else {
      property.dailyViews.push({ date: today, count: 1 });
    }
    property.totalViews = Number(property.totalViews ?? 0) + 1;

    await property.save();

    return res.status(200).json({
      totalViews: property.totalViews,
      dailyViews: property.dailyViews,
    });
  } catch (error) {
    console.error("Property view error:", error);
    const message =
      error instanceof Error ? error.message : "Property view update failed.";
    return res.status(500).json({ message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await connectToDatabase();
    const payload = getTokenPayloadFromRequest(req);

    if (!payload?.id) {
      return res.status(401).json({ message: "Login is required." });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid property id." });
    }

    const filters = { _id: req.params.id };
    if (!isSuperAdmin(payload)) {
      filters.owner = payload.id;
    }

    const property = await Property.findOneAndDelete(filters);
    if (!property) {
      return res.status(404).json({ message: "Property not found." });
    }

    return res.status(200).json({ message: "Property deleted successfully." });
  } catch (error) {
    console.error("Property delete error:", error);
    const message =
      error instanceof Error ? error.message : "Property delete failed.";
    return res.status(500).json({ message });
  }
});

export default router;
