import type { FastifyInstance } from "fastify";
import { uploadImageBuffer } from "../../cloudinary.js";
import { config } from "../../config.js";
import { getPool } from "../../db.js";
import { firstFileNamed, readMultipart } from "../../lib/multipart.js";

export async function registerAdminEditorialRoutes(
  fastify: FastifyInstance
) {
  fastify.get("/", async (_request, reply) => {
    try {
      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT id::text, title, image_url, sort_order, created_at, updated_at
         FROM editorial
         ORDER BY sort_order ASC NULLS LAST, title ASC`
      );
      return reply.send({ editorial: rows });
    } catch (e) {
      console.error(e);
      return reply.status(500).send({ error: "Failed to list editorial" });
    }
  });

  fastify.post("/", async (request, reply) => {
    const { fields, files } = await readMultipart(request);
    const title = String(fields.title ?? "").trim();
    const sort_order = Number(fields.sort_order ?? 0) || 0;
    const file = firstFileNamed(files, "image");

    if (!title) {
      return reply.status(400).send({ error: "title required" });
    }
    if (!file?.buffer?.length) {
      return reply.status(400).send({ error: "image file required" });
    }

    try {
      const image_url = await uploadImageBuffer(
        file.buffer,
        file.mimetype,
        config.folders.editorial
      );
      const pool = getPool();
      const { rows } = await pool.query(
        `INSERT INTO editorial (title, image_url, sort_order)
         VALUES ($1, $2, $3)
         RETURNING id::text, title, image_url, sort_order`,
        [title, image_url, sort_order]
      );
      return reply.status(201).send({ item: rows[0] });
    } catch (e) {
      console.error(e);
      return reply.status(500).send({
        error: "Failed to create editorial item",
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  });

  fastify.patch<{
    Params: { id: string };
  }>("/:id", async (request, reply) => {
    const { id } = request.params;
    const { fields, files } = await readMultipart(request);

    const title =
      fields.title !== undefined ? String(fields.title).trim() : undefined;
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
          config.folders.editorial
        );
      } catch (e) {
        console.error(e);
        return reply.status(502).send({ error: "Image upload failed" });
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
         RETURNING id::text, title, image_url, sort_order`,
        vals
      );
      if (!rowCount) return reply.status(404).send({ error: "Not found" });
      return reply.send({ item: rows[0] });
    } catch (e) {
      console.error(e);
      return reply.status(500).send({ error: "Update failed" });
    }
  });

  fastify.delete<{
    Params: { id: string };
  }>("/:id", async (request, reply) => {
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
  });
}
