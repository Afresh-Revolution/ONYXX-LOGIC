import { v2 as cloudinary } from "cloudinary";
import { config } from "./config.js";

const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const ALLOWED_VIDEO_MIMES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

function ensureConfigured() {
  const { cloudName, apiKey, apiSecret } = config.cloudinary;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary env vars are not set");
  }
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
}

export async function uploadImageBuffer(
  buffer: Buffer,
  mime: string,
  folder: string
): Promise<string> {
  ensureConfigured();
  const normalizedMime = (mime || "image/jpeg").toLowerCase();
  if (!ALLOWED_IMAGE_MIMES.has(normalizedMime)) {
    throw new Error(`Unsupported image type: ${normalizedMime}`);
  }
  const dataUri = `data:${normalizedMime};base64,${buffer.toString("base64")}`;
  const res = await cloudinary.uploader.upload(dataUri, {
    folder,
    resource_type: "image",
    unique_filename: true,
    overwrite: false,
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
  });
  return res.secure_url;
}

export async function uploadVideoBuffer(
  buffer: Buffer,
  mime: string,
  folder: string
): Promise<string> {
  ensureConfigured();
  const normalizedMime = (mime || "video/mp4").toLowerCase();
  if (!ALLOWED_VIDEO_MIMES.has(normalizedMime)) {
    throw new Error(`Unsupported video type: ${normalizedMime}`);
  }
  const dataUri = `data:${normalizedMime};base64,${buffer.toString("base64")}`;
  const res = await cloudinary.uploader.upload(dataUri, {
    folder,
    resource_type: "video",
    unique_filename: true,
    overwrite: false,
    allowed_formats: ["mp4", "mov", "webm"],
  });
  return res.secure_url;
}
