import type { FastifyInstance } from "fastify";
import type { MultipartFile } from "@fastify/multipart";
import { createUploadSignature, uploadImageBuffer, uploadVideoStream } from "../../cloudinary.js";
import { config } from "../../config.js";
import { getPool } from "../../db.js";

const MAX_VIDEO_SIZE_BYTES = 500 * 1024 * 1024;

function isLikelyHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

async function readEditorialMultipart(request: any): Promise<{
  fields: Record<string, string>;
  image?: { buffer: Buffer; mimetype: string };
  video?: { file: MultipartFile["file"]; mimetype: string };
}> {
  const fields: Record<string, string> = {};
  let image: { buffer: Buffer; mimetype: string } | undefined;
  let video: { file: MultipartFile["file"]; mimetype: string } | undefined;

  for await (const part of request.parts()) {
    if (part.type === "file") {
      if (part.fieldname === "image") {
        const buf = await part.toBuffer();
        if (buf?.length) {
          image = { buffer: buf, mimetype: part.mimetype || "application/octet-stream" };
        }
      } else if (part.fieldname === "video") {
        video = { file: part.file, mimetype: part.mimetype || "application/octet-stream" };
      }
    } else {
      fields[part.fieldname] = String(part.value ?? "");
    }
  }

  return { fields, image, video };
}

export async function registerAdminEditorialRoutes(
  fastify: FastifyInstance
) {
  // Direct-to-Cloudinary upload support to avoid proxy timeouts (e.g. Cloudflare 524)
  // for large videos. Client uploads to Cloudinary using this signature, then calls
  // POST/PATCH with the resulting `video_url`.
  fastify.get(
    "/upload-signature",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const resource_type = String((request.query as any)?.resource_type ?? "video").trim();
      const unsignedFlag = String((request.query as any)?.unsigned ?? "").trim().toLowerCase();
      const wantsUnsigned = unsignedFlag === "1" || unsignedFlag === "true";
      if (resource_type !== "video" && resource_type !== "image") {
        return reply.status(400).send({ error: "Invalid resource_type" });
      }

      const folder =
        resource_type === "video" ? config.folders.editorial : config.folders.editorial;

      if (wantsUnsigned) {
        if (!config.cloudinary.unsignedUploadPreset) {
          return reply.status(500).send({
            error:
              "Unsigned Cloudinary upload preset is not configured (CLOUDINARY_UNSIGNED_UPLOAD_PRESET)",
          });
        }
        return reply.send({
          cloudName: config.cloudinary.cloudName,
          apiKey: config.cloudinary.apiKey,
          folder,
          resource_type,
          upload_preset: config.cloudinary.unsignedUploadPreset,
          max_file_size: resource_type === "video" ? MAX_VIDEO_SIZE_BYTES : undefined,
        });
      }

      const { timestamp, signature, apiKey, cloudName } = createUploadSignature({
        folder,
        resource_type,
        ...(resource_type === "video" ? { max_file_size: MAX_VIDEO_SIZE_BYTES } : {}),
      });

      return reply.send({
        cloudName,
        apiKey,
        timestamp,
        signature,
        folder,
        resource_type,
        max_file_size: resource_type === "video" ? MAX_VIDEO_SIZE_BYTES : undefined,
      });
    }
  );

  fastify.get("/", async (_request, reply) => {
    try {
      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT id::text, title, image_url, video_url, sort_order, created_at, updated_at
         FROM editorial
         ORDER BY sort_order ASC NULLS LAST, title ASC`
      );
      return reply.send({ editorial: rows });
    } catch (e) {
      console.error(e);
      return reply.status(500).send({ error: "Failed to list editorial" });
    }
  });

  fastify.post(
    "/",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request, reply) => {
    const { fields, image, video } = await readEditorialMultipart(request);
    const title = String(fields.title ?? "").trim();
    const sort_order = Number(fields.sort_order ?? 0) || 0;
    const image_url_body =
      fields.image_url !== undefined ? String(fields.image_url).trim() : "";
    const video_url_body =
      fields.video_url !== undefined ? String(fields.video_url).trim() : "";

    if (!title) {
      return reply.status(400).send({ error: "title required" });
    }
    if (!image?.buffer?.length && !video?.file && !image_url_body && !video_url_body) {
      return reply.status(400).send({
        error: "image or video file required (or image_url/video_url)",
      });
    }
    if (image_url_body && !isLikelyHttpUrl(image_url_body)) {
      return reply.status(400).send({ error: "Invalid image_url" });
    }
    if (video_url_body && !isLikelyHttpUrl(video_url_body)) {
      return reply.status(400).send({ error: "Invalid video_url" });
    }

    try {
      const image_url = image?.buffer?.length
        ? await uploadImageBuffer(image.buffer, image.mimetype, config.folders.editorial)
        : image_url_body || null;
      const video_url = video?.file
        ? await uploadVideoStream(video.file, video.mimetype, config.folders.editorial)
        : video_url_body || null;
      const pool = getPool();
      const { rows } = await pool.query(
        `INSERT INTO editorial (title, image_url, video_url, sort_order)
         VALUES ($1, $2, $3, $4)
         RETURNING id::text, title, image_url, video_url, sort_order`,
        [title, image_url, video_url, sort_order]
      );
      return reply.status(201).send({ item: rows[0] });
    } catch (e) {
      console.error(e);
      return reply.status(500).send({
        error: "Failed to create editorial item",
      });
    }
    }
  );

  fastify.patch<{
    Params: { id: string };
  }>(
    "/:id",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (request, reply) => {
    const { id } = request.params;
    const { fields, image, video } = await readEditorialMultipart(request);

    const title =
      fields.title !== undefined ? String(fields.title).trim() : undefined;
    const sort_order =
      fields.sort_order !== undefined ? Number(fields.sort_order) : undefined;
    const image_url_body =
      fields.image_url !== undefined
        ? String(fields.image_url).trim()
        : undefined;
    const video_url_body =
      fields.video_url !== undefined
        ? String(fields.video_url).trim()
        : undefined;
    const clear_video =
      fields.clear_video !== undefined ? String(fields.clear_video).trim() : "";

    let image_url: string | undefined = image_url_body;
    if (image?.buffer?.length) {
      try {
        image_url = await uploadImageBuffer(
          image.buffer,
          image.mimetype,
          config.folders.editorial
        );
      } catch (e) {
        console.error(e);
        return reply.status(502).send({ error: "Image upload failed" });
      }
    }

    let video_url: string | null | undefined = undefined;
    if (clear_video === "1" || clear_video.toLowerCase() === "true") {
      video_url = null;
    } else if (video_url_body !== undefined) {
      if (video_url_body && !isLikelyHttpUrl(video_url_body)) {
        return reply.status(400).send({ error: "Invalid video_url" });
      }
      video_url = video_url_body || null;
    } else if (video?.file) {
      try {
        video_url = await uploadVideoStream(
          video.file,
          video.mimetype,
          config.folders.editorial
        );
      } catch (e) {
        console.error(e);
        return reply.status(502).send({ error: "Video upload failed" });
      }
    }

    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;

    if (title !== undefined) {
      sets.push(`title = $${i++}`);
      vals.push(title);
    }
    if (sort_order !== undefined && !Number.isNaN(sort_order)) {
      sets.push(`sort_order = $${i++}`);
      vals.push(sort_order);
    }
    if (image_url !== undefined && image_url !== "") {
      sets.push(`image_url = $${i++}`);
      vals.push(image_url);
    }
    if (video_url !== undefined) {
      sets.push(`video_url = $${i++}`);
      vals.push(video_url);
    }

    if (!sets.length) {
      return reply.status(400).send({ error: "No fields to update" });
    }

    sets.push(`updated_at = now()`);
    vals.push(id);
    const idPlaceholder = vals.length;

    try {
      const pool = getPool();
      const { rowCount, rows } = await pool.query(
        `UPDATE editorial SET ${sets.join(", ")} WHERE id = $${idPlaceholder}::uuid
         RETURNING id::text, title, image_url, video_url, sort_order`,
        vals
      );
      if (!rowCount) return reply.status(404).send({ error: "Not found" });
      return reply.send({ item: rows[0] });
    } catch (e) {
      console.error(e);
      return reply.status(500).send({ error: "Update failed" });
    }
    }
  );

  fastify.delete<{
    Params: { id: string };
  }>(
    "/:id",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (request, reply) => {
    const { id } = request.params;
    try {
      const pool = getPool();
      const { rowCount } = await pool.query(
        `DELETE FROM editorial WHERE id = $1::uuid`,
        [id]
      );
      if (!rowCount) return reply.status(404).send({ error: "Not found" });
      return reply.send({ ok: true });
    } catch (e) {
      console.error(e);
      return reply.status(500).send({ error: "Delete failed" });
    }
    }
  );
}
