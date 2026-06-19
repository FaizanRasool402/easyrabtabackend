import fs from "fs";
import fsPromises from "fs/promises";
import sharp from "sharp";

const TARGET_MAX_BYTES = 900 * 1024;
const RESIZE_ATTEMPTS = [
  { size: 1600, quality: 82 },
  { size: 1280, quality: 78 },
  { size: 1080, quality: 72 },
  { size: 900, quality: 68 },
  { size: 720, quality: 62 },
  { size: 560, quality: 58 },
];

async function compressImage(buffer) {
  let best = null;

  for (const attempt of RESIZE_ATTEMPTS) {
    const compressed = await sharp(buffer, { failOn: "none" })
      .rotate()
      .resize({
        width: attempt.size,
        height: attempt.size,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: attempt.quality, mozjpeg: true })
      .toBuffer();

    if (!best || compressed.length < best.length) {
      best = compressed;
    }

    if (compressed.length <= TARGET_MAX_BYTES) {
      return compressed;
    }
  }

  return best;
}

export async function imageFileToDataUrl(file) {
  if (!file?.mimetype?.startsWith("image/")) {
    return null;
  }

  let buffer = file.buffer;
  if (!buffer && file.path && fs.existsSync(file.path)) {
    buffer = await fsPromises.readFile(file.path);
  }
  if (!buffer?.length) {
    return null;
  }

  try {
    const compressed = await compressImage(buffer);

    return `data:image/jpeg;base64,${compressed.toString("base64")}`;
  } catch (error) {
    console.error("Image compress error:", error);
    if (buffer.length <= 600 * 1024) {
      const mime = file.mimetype || "image/jpeg";
      return `data:${mime};base64,${buffer.toString("base64")}`;
    }
    return null;
  }
}
