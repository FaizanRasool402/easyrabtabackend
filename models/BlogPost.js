import mongoose from "mongoose";

const blogSectionSchema = new mongoose.Schema(
  {
    heading: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const blogPostSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    category: { type: String, required: true, trim: true },
    excerpt: { type: String, required: true, trim: true },
    image: { type: String, required: true },
    content: {
      type: [blogSectionSchema],
      validate: {
        validator: (value) => Array.isArray(value) && value.length > 0,
        message: "At least one blog section is required.",
      },
    },
    authorName: { type: String, trim: true, default: "Easy Raabta Editorial" },
    published: { type: Boolean, default: true },
    publishedAt: { type: Date, default: Date.now },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

const BlogPost =
  mongoose.models.BlogPost || mongoose.model("BlogPost", blogPostSchema);

export default BlogPost;
