import type { FastifyInstance } from "fastify";
import { uploadImageBuffer } from "../cloudinary.js";
import { config } from "../config.js";
import { getPool } from "../db.js";
import { filesNamed, readMultipart } from "../lib/multipart.js";

export async function registerApplicationsPublicRoutes(
  fastify: FastifyInstance
) {
  fastify.post("/", async (request, reply) => {
    const { fields, files } = await readMultipart(request);

    const full_name = String(fields.full_name ?? "").trim();
    const email = String(fields.email ?? "").trim();
    const date_of_birth = String(fields.date_of_birth ?? "").trim();
    const phone = String(fields.phone ?? "").trim() || null;
    const height = String(fields.height ?? "").trim() || null;
    const city = String(fields.city ?? "").trim() || null;
    const experience_level = String(fields.experience_level ?? "").trim() || null;
    const portfolio_url = String(fields.portfolio_url ?? "").trim() || null;
    const message = String(fields.message ?? "").trim() || null;

    if (!full_name || !email || !date_of_birth) {
      return reply.status(400).send({
        error: "Missing required fields: full_name, email, date_of_birth",
      });
    }

    const photoParts = filesNamed(files, "photos");
    const photoUrls: string[] = [];

    try {
      for (const file of photoParts) {
        if (!file.buffer?.length) continue;
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
        error: "Image upload failed. Check Cloudinary configuration.",
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
        detail: e instanceof Error ? e.message : String(e),
      });
    }

    return reply.send({ ok: true, photo_count: photoUrls.length });
  });
}
