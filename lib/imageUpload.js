import fs from "fs";
import fsPromises from "fs/promises";
import sharp from "sharp";

const TARGET_MAX_BYTES = 900 * 1024;

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
    let compressed = await sharp(buffer)
      .rotate()
      .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();

    if (compressed.length > TARGET_MAX_BYTES) {
      compressed = await sharp(buffer)
        .rotate()
        .resize({ width: 960, height: 960, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 70, mozjpeg: true })
        .toBuffer();
    }

    if (compressed.length > TARGET_MAX_BYTES) {
      compressed = await sharp(buffer)
        .rotate()
        .resize({ width: 720, height: 720, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 65, mozjpeg: true })
        .toBuffer();
    }

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
