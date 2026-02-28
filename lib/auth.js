import jwt from "jsonwebtoken";

export function getTokenPayloadFromRequest(req) {
  const token = req.cookies?.token;
  if (!token) {
    return null;
  }

  if (!process.env.JWT_SECRET) {
    throw new Error("Set JWT_SECRET in environment variables.");
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (typeof payload === "string") {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
