import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { connectToDatabase } from "../lib/mongodb.js";
import { getTokenPayloadFromRequest } from "../lib/auth.js";
import User from "../models/User.js";

const router = express.Router();

function errorMessage(error, fallback) {
  const details = error instanceof Error ? error.message : fallback;
  if (process.env.NODE_ENV !== "production") {
    return details;
  }
  return fallback;
}

router.post("/register", async (req, res) => {
  try {
    const { name, email, password, phone, profileImage } = req.body;

    if (!name || !email || !password || !phone) {
      return res
        .status(400)
        .json({ message: "Name, email, phone, and password are required." });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters long." });
    }

    await connectToDatabase();
    const normalizedEmail = email.toLowerCase();
    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      return res
        .status(409)
        .json({ message: "An account with this email already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email: normalizedEmail,
      password: hashedPassword,
      phone,
      profileImage: typeof profileImage === "string" ? profileImage : "",
    });

    return res.status(201).json({
      message: "Account created successfully.",
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone,
        profileImage: user.profileImage,
      },
    });
  } catch (error) {
    console.error("Register error:", error);
    return res
      .status(500)
      .json({ message: errorMessage(error, "Registration failed. Please try again.") });
  }
});

router.post("/login", async (req, res) => {
  try {
    if (!process.env.JWT_SECRET) {
      return res
        .status(500)
        .json({ message: "Set JWT_SECRET in environment variables." });
    }

    const { email, password } = req.body;
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required." });
    }

    await connectToDatabase();
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const token = jwt.sign(
      {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        phone: user.phone,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7 * 1000,
      path: "/",
    });

    return res.status(200).json({
      message: "Login successful.",
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone,
        profileImage: user.profileImage,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res
      .status(500)
      .json({ message: errorMessage(error, "Login failed. Please try again.") });
  }
});

router.get("/me", async (req, res) => {
  try {
    await connectToDatabase();
    const payload = getTokenPayloadFromRequest(req);

    if (!payload?.id) {
      return res.status(401).json({ message: "Login required." });
    }

    const user = await User.findById(payload.id).select("-password");
    if (!user) {
      return res.status(401).json({ message: "User not found." });
    }

    return res.status(200).json({
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone,
        profileImage: user.profileImage ?? "",
      },
    });
  } catch (error) {
    console.error("Me error:", error);
    return res.status(500).json({ message: errorMessage(error, "Auth failed.") });
  }
});

router.patch("/profile", async (req, res) => {
  try {
    await connectToDatabase();
    const payload = getTokenPayloadFromRequest(req);

    if (!payload?.id) {
      return res.status(401).json({ message: "Login required." });
    }

    const { name, phone, profileImage } = req.body;

    if (!name || !phone) {
      return res
        .status(400)
        .json({ message: "Name and phone are required." });
    }

    const user = await User.findById(payload.id);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    user.name = name;
    user.phone = phone;
    if (typeof profileImage === "string") {
      user.profileImage = profileImage;
    }

    await user.save();

    return res.status(200).json({
      message: "Profile updated successfully.",
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone,
        profileImage: user.profileImage ?? "",
      },
    });
  } catch (error) {
    console.error("Profile update error:", error);
    return res
      .status(500)
      .json({ message: errorMessage(error, "Profile update failed.") });
  }
});

router.post("/logout", (_req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });

  return res.status(200).json({ message: "Logout successful." });
});

export default router;
