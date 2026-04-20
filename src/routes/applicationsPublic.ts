import type { FastifyInstance } from "fastify";
import { uploadImageBuffer } from "../cloudinary.js";
import { config } from "../config.js";
import { getPool } from "../db.js";
import { filesNamed, readMultipart } from "../lib/multipart.js";

function isValidEmail(email: string): boolean {
  // Simple, pragmatic validation; avoids rejecting common real addresses.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isLikelyHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function registerApplicationsPublicRoutes(
  fastify: FastifyInstance
) {
  fastify.post(
    "/",
    { config: { rateLimit: { max: 20, timeWindow: "1 hour" } } },
    async (request, reply) => {
    const { fields, files } = await readMultipart(request);

    const full_name = String(fields.full_name ?? "").trim();
    const email = String(fields.email ?? "").trim().toLowerCase();
    const date_of_birth = String(fields.date_of_birth ?? "").trim();
    const phone = String(fields.phone ?? "").trim() || null;
    const height = String(fields.height ?? "").trim() || null;
    const city = String(fields.city ?? "").trim() || null;
    const experience_level = String(fields.experience_level ?? "").trim() || null;
    const portfolio_url_raw = String(fields.portfolio_url ?? "").trim();
    const portfolio_url = portfolio_url_raw ? portfolio_url_raw : null;
    const message_raw = String(fields.message ?? "").trim();
    const message = message_raw ? message_raw : null;

    if (!full_name || !email || !date_of_birth) {
      return reply.status(400).send({
        error: "Missing required fields: full_name, email, date_of_birth",
      });
    }
    if (!isValidEmail(email)) {
      return reply.status(400).send({ error: "Invalid email" });
    }
    if (portfolio_url && !isLikelyHttpUrl(portfolio_url)) {
      return reply.status(400).send({ error: "Invalid portfolio_url" });
    }
    if (message && message.length > 4000) {
      return reply.status(400).send({ error: "message too long" });
    }

    const photoParts = filesNamed(files, "photos");
    if (photoParts.length > 10) {
      return reply.status(400).send({ error: "Too many photos" });
    }
    const photoUrls: string[] = [];

    try {
      for (const file of photoParts) {
        if (!file.buffer?.length) continue;
        if (!file.mimetype?.toLowerCase().startsWith("image/")) {
          return reply.status(400).send({ error: "Invalid photo type" });
        }
        const url = await uploadImageBuffer(
          file.buffer,
          file.mimetype,
          config.folders.applications
        );
        photoUrls.push(url);
      }
    } catch (e) {
      console.error(e);
      return reply.status(502).send({
        error: "Image upload failed",
      });
    }

    try {
      const pool = getPool();
      await pool.query(
        `INSERT INTO applications (
          full_name, email, phone, date_of_birth, height, city,
          experience_level, portfolio_url, message, photo_urls
        ) VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8, $9, $10::jsonb)`,
        [
          full_name,
          email,
          phone,
          date_of_birth,
          height,
          city,
          experience_level,
          portfolio_url,
          message,
          photoUrls.length ? JSON.stringify(photoUrls) : null,
        ]
      );
    } catch (e) {
      console.error(e);
      return reply.status(500).send({
        error: "Could not save application",
      });
    }

    return reply.send({ ok: true, photo_count: photoUrls.length });
    }
  );
}
