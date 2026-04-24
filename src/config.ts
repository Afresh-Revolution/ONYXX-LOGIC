import "dotenv/config";

function parseOrigins(raw: string | undefined): string[] {
  if (!raw?.trim()) return ["http://localhost:3000"];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

/** Same secret the Next app uses for cookie JWT verification (JWT_SECRET or ADMIN_SESSION_SECRET). */
export const config = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? "",
  jwtSecret:
    process.env.JWT_SECRET?.trim() ||
    process.env.ADMIN_SESSION_SECRET?.trim() ||
    "",
  corsOrigins: parseOrigins(process.env.CORS_ORIGINS),
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? "",
    apiKey: process.env.CLOUDINARY_API_KEY ?? "",
    apiSecret: process.env.CLOUDINARY_API_SECRET ?? "",
    unsignedUploadPreset:
      process.env.CLOUDINARY_UNSIGNED_UPLOAD_PRESET?.trim() ?? "",
  },
  folders: {
    applications: `${process.env.CLOUDINARY_UPLOAD_FOLDER ?? "onyxx"}/applications`,
    roster: `${process.env.CLOUDINARY_UPLOAD_FOLDER ?? "onyxx"}/roster`,
    editorial: `${process.env.CLOUDINARY_UPLOAD_FOLDER ?? "onyxx"}/editorial`,
  },
  resendApiKey: process.env.RESEND_API_KEY?.trim() ?? "",
  resendFrom:
    process.env.RESEND_FROM?.trim() ?? "ONYXX <noreply@onyxx.club>",
};

export function assertDb() {
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
}

export function assertJwtSecret() {
  if (!config.jwtSecret) {
    throw new Error(
      "JWT_SECRET or ADMIN_SESSION_SECRET is required for auth and admin routes"
    );
  }
}
