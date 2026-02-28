import mongoose from "mongoose";

export async function connectToDatabase() {
  const MONGODB_URI = process.env.MONGODB_URI;

  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI is not set in backend .env");
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  try {
    await mongoose.connect(MONGODB_URI, {
      dbName: process.env.MONGODB_DB || "easy-rabta",
      serverSelectionTimeoutMS: 10000,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown DB error";
    throw new Error(`MongoDB connection failed: ${message}`);
  }

  return mongoose.connection;
}
