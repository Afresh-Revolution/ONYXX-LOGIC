import type { FastifyInstance } from "fastify";
import { uploadImageBuffer } from "../../cloudinary.js";
import { config } from "../../config.js";
import { getPool } from "../../db.js";
import { firstFileNamed, readMultipart } from "../../lib/multipart.js";

export async function registerAdminRosterRoutes(fastify: FastifyInstance) {
  fastify.get("/", async (_request, reply) => {
    try {
      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT id::text, name, category, image_url, sort_order, created_at, updated_at
         FROM roster
         ORDER BY sort_order ASC NULLS LAST, name ASC`
      );
      return reply.send({ roster: rows });
    } catch (e) {
      console.error(e);
      return reply.status(500).send({ error: "Failed to list roster" });
    }
  });

  fastify.post(
    "/",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request, reply) => {
    const { fields, files } = await readMultipart(request);
    const name = String(fields.name ?? "").trim();
    const category = String(fields.category ?? "").trim();
    const sort_order = Number(fields.sort_order ?? 0) || 0;
    const img = firstFileNamed(files, "image");

    if (!name || !category) {
      return reply.status(400).send({ error: "name and category required" });
    }
    if (!img?.buffer?.length) {
      return reply.status(400).send({ error: "image file required" });
    }

    try {
      const image_url = await uploadImageBuffer(
        img.buffer,
        img.mimetype,
        config.folders.roster
      );
      const pool = getPool();
      const { rows } = await pool.query(
        `INSERT INTO roster (name, category, image_url, sort_order)
         VALUES ($1, $2, $3, $4)
         RETURNING id::text, name, category, image_url, sort_order`,
        [name, category, image_url, sort_order]
      );
      return reply.status(201).send({ model: rows[0] });
    } catch (e) {
      console.error(e);
      return reply.status(500).send({
        error: "Failed to create roster entry",
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
    const { fields, files } = await readMultipart(request);

    const name =
      fields.name !== undefined ? String(fields.name).trim() : undefined;
    const category =
      fields.category !== undefined ? String(fields.category).trim() : undefined;
    const sort_order =
      fields.sort_order !== undefined ? Number(fields.sort_order) : undefined;
    const image_url_body =
      fields.image_url !== undefined
        ? String(fields.image_url).trim()
        : undefined;

    const imgFile = firstFileNamed(files, "image");

    let image_url: string | undefined = image_url_body;
    if (imgFile?.buffer?.length) {
      try {
        image_url = await uploadImageBuffer(
          imgFile.buffer,
          imgFile.mimetype,
          config.folders.roster
        );
      } catch (e) {
        console.error(e);
        return reply.status(502).send({ error: "Image upload failed" });
      }
    }

    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;

    if (name !== undefined) {
      sets.push(`name = $${i++}`);
      vals.push(name);
    }
    if (category !== undefined) {
      sets.push(`category = $${i++}`);
      vals.push(category);
    }
    if (sort_order !== undefined && !Number.isNaN(sort_order)) {
      sets.push(`sort_order = $${i++}`);
      vals.push(sort_order);
    }
    if (image_url !== undefined && image_url !== "") {
      sets.push(`image_url = $${i++}`);
      vals.push(image_url);
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
        `UPDATE roster SET ${sets.join(", ")} WHERE id = $${idPlaceholder}::uuid
         RETURNING id::text, name, category, image_url, sort_order`,
        vals
      );
      if (!rowCount) return reply.status(404).send({ error: "Not found" });
      return reply.send({ model: rows[0] });
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
        `DELETE FROM roster WHERE id = $1::uuid`,
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
