import express from "express";
import { connectToDatabase } from "../lib/mongodb.js";
import { getTokenPayloadFromRequest } from "../lib/auth.js";
import BlogPost from "../models/BlogPost.js";

const router = express.Router();
const SUPER_ADMIN_EMAIL = "admin@gmail.com";

function isSuperAdmin(payload) {
  return (
    payload?.role === "super_admin" ||
    payload?.email?.toLowerCase() === SUPER_ADMIN_EMAIL
  );
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

async function buildUniqueSlug(title) {
  const baseSlug = slugify(title);
  let slug = baseSlug || `blog-${Date.now()}`;
  let suffix = 2;

  while (await BlogPost.exists({ slug })) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return slug;
}

async function buildUniqueSlugForUpdate(title, currentId) {
  const baseSlug = slugify(title);
  let slug = baseSlug || `blog-${Date.now()}`;
  let suffix = 2;

  while (await BlogPost.exists({ slug, _id: { $ne: currentId } })) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return slug;
}

router.get("/", async (_req, res) => {
  try {
    await connectToDatabase();
    const blogs = await BlogPost.find({ published: true })
      .sort({ publishedAt: -1, createdAt: -1 })
      .lean();

    return res.status(200).json({ blogs });
  } catch (error) {
    console.error("Blogs list error:", error);
    return res.status(500).json({ message: "Failed to load blogs." });
  }
});

router.get("/:slug", async (req, res) => {
  try {
    await connectToDatabase();
    const blog = await BlogPost.findOne({
      slug: req.params.slug,
      published: true,
    }).lean();

    if (!blog) {
      return res.status(404).json({ message: "Blog post not found." });
    }

    return res.status(200).json({ blog });
  } catch (error) {
    console.error("Blog detail error:", error);
    return res.status(500).json({ message: "Failed to load blog." });
  }
});

router.post("/", async (req, res) => {
  try {
    await connectToDatabase();
    const payload = getTokenPayloadFromRequest(req);

    if (!isSuperAdmin(payload)) {
      return res.status(403).json({ message: "Super admin access required." });
    }

    const { title, category, excerpt, image, content } = req.body;
    const sections = Array.isArray(content) ? content : [];

    if (!title || !category || !excerpt || !image || sections.length === 0) {
      return res.status(400).json({
        message: "Title, category, excerpt, image, and content are required.",
      });
    }

    const cleanedSections = sections
      .map((section) => ({
        heading: String(section.heading ?? "").trim(),
        body: String(section.body ?? "").trim(),
      }))
      .filter((section) => section.heading && section.body);

    if (cleanedSections.length === 0) {
      return res.status(400).json({ message: "Add at least one complete section." });
    }

    const blog = await BlogPost.create({
      title,
      slug: await buildUniqueSlug(title),
      category,
      excerpt,
      image,
      content: cleanedSections,
      createdBy: payload.id,
      authorName: payload.name || "Easy Raabta Editorial",
    });

    return res.status(201).json({
      message: "Blog post published successfully.",
      blog,
    });
  } catch (error) {
    console.error("Blog create error:", error);
    const message = error instanceof Error ? error.message : "Blog publish failed.";
    return res.status(500).json({ message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    await connectToDatabase();
    const payload = getTokenPayloadFromRequest(req);

    if (!isSuperAdmin(payload)) {
      return res.status(403).json({ message: "Super admin access required." });
    }

    const blog = await BlogPost.findById(req.params.id);
    if (!blog) {
      return res.status(404).json({ message: "Blog post not found." });
    }

    const { title, category, excerpt, image, content } = req.body;
    const sections = Array.isArray(content) ? content : [];

    if (!title || !category || !excerpt || !image || sections.length === 0) {
      return res.status(400).json({
        message: "Title, category, excerpt, image, and content are required.",
      });
    }

    const cleanedSections = sections
      .map((section) => ({
        heading: String(section.heading ?? "").trim(),
        body: String(section.body ?? "").trim(),
      }))
      .filter((section) => section.heading && section.body);

    if (cleanedSections.length === 0) {
      return res.status(400).json({ message: "Add at least one complete section." });
    }

    blog.title = title;
    blog.slug = await buildUniqueSlugForUpdate(title, blog._id);
    blog.category = category;
    blog.excerpt = excerpt;
    blog.image = image;
    blog.content = cleanedSections;
    blog.published = true;
    blog.publishedAt = blog.publishedAt || new Date();

    await blog.save();

    return res.status(200).json({
      message: "Blog post updated successfully.",
      blog,
    });
  } catch (error) {
    console.error("Blog update error:", error);
    const message = error instanceof Error ? error.message : "Blog update failed.";
    return res.status(500).json({ message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await connectToDatabase();
    const payload = getTokenPayloadFromRequest(req);

    if (!isSuperAdmin(payload)) {
      return res.status(403).json({ message: "Super admin access required." });
    }

    const blog = await BlogPost.findByIdAndDelete(req.params.id);
    if (!blog) {
      return res.status(404).json({ message: "Blog post not found." });
    }

    return res.status(200).json({ message: "Blog post deleted successfully." });
  } catch (error) {
    console.error("Blog delete error:", error);
    const message = error instanceof Error ? error.message : "Blog delete failed.";
    return res.status(500).json({ message });
  }
});

export default router;
