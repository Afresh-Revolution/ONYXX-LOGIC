import { v2 as cloudinary } from "cloudinary";
import { config } from "./config.js";

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
  const dataUri = `data:${mime || "image/jpeg"};base64,${buffer.toString("base64")}`;
  const res = await cloudinary.uploader.upload(dataUri, {
    folder,
    resource_type: "image",
  });
  return res.secure_url;
}
