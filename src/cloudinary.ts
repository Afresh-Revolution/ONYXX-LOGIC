import { v2 as cloudinary } from "cloudinary";
import { config } from "./config.js";
import type { Readable } from "node:stream";

const CLOUDINARY_VIDEO_CHUNK_SIZE_BYTES = 20 * 1024 * 1024;

function ensureConfigured() {
  const { cloudName, apiKey, apiSecret } = config.cloudinary;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary env vars are not set");
  }
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
}

export function createUploadSignature(params: Record<string, string | number>): {
  timestamp: number;
  signature: string;
  apiKey: string;
  cloudName: string;
} {
  ensureConfigured();
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = cloudinary.utils.api_sign_request(
    { ...params, timestamp },
    config.cloudinary.apiSecret
  );
  return {
    timestamp,
    signature,
    apiKey: config.cloudinary.apiKey,
    cloudName: config.cloudinary.cloudName,
  };
}

export async function uploadImageBuffer(
  buffer: Buffer,
  mime: string,
  folder: string
): Promise<string> {
  ensureConfigured();
  const normalizedMime = (mime || "image/jpeg").toLowerCase();
  if (!normalizedMime.startsWith("image/")) {
    throw new Error(`Unsupported image type: ${normalizedMime}`);
  }
  const dataUri = `data:${normalizedMime};base64,${buffer.toString("base64")}`;
  const res = await cloudinary.uploader.upload(dataUri, {
    folder,
    resource_type: "image",
    unique_filename: true,
    overwrite: false,
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
  if (!normalizedMime.startsWith("video/")) {
    throw new Error(`Unsupported video type: ${normalizedMime}`);
  }
  const dataUri = `data:${normalizedMime};base64,${buffer.toString("base64")}`;
  const res = await cloudinary.uploader.upload(dataUri, {
    folder,
    resource_type: "video",
    unique_filename: true,
    overwrite: false,
  });
  return res.secure_url;
}

export async function uploadVideoStream(
  stream: Readable,
  mime: string,
  folder: string
): Promise<string> {
  ensureConfigured();
  const normalizedMime = (mime || "video/mp4").toLowerCase();
  if (!normalizedMime.startsWith("video/")) {
    throw new Error(`Unsupported video type: ${normalizedMime}`);
  }

  return await new Promise<string>((resolve, reject) => {
    const options = {
      folder,
      resource_type: "video" as const,
      unique_filename: true,
      overwrite: false,
    };
    const onUploadDone = (err: unknown, res: { secure_url?: string } | undefined) => {
      if (err) return reject(err);
      if (!res?.secure_url) return reject(new Error("Cloudinary upload failed"));
      resolve(res.secure_url);
    };
    const uploader = cloudinary.uploader as typeof cloudinary.uploader & {
      upload_chunked_stream?: (
        opts: Record<string, unknown>,
        callback: (err: unknown, res: { secure_url?: string } | undefined) => void
      ) => NodeJS.WritableStream;
    };
    const upload =
      typeof uploader.upload_chunked_stream === "function"
        ? uploader.upload_chunked_stream(
            {
              ...options,
              chunk_size: CLOUDINARY_VIDEO_CHUNK_SIZE_BYTES,
            },
            onUploadDone
          )
        : cloudinary.uploader.upload_stream(options, onUploadDone);

    stream.on("error", reject);
    stream.pipe(upload);
  });
}
