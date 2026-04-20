import type { FastifyInstance } from "fastify";
import { getPool } from "../db.js";

export async function registerPublicContentRoutes(fastify: FastifyInstance) {
  fastify.get("/roster", async (_request, reply) => {
    try {
      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT id::text, name, category, image_url, sort_order
         FROM roster
         ORDER BY sort_order ASC NULLS LAST, name ASC`
      );
      return reply.send({ roster: rows });
    } catch (e) {
      console.error(e);
      return reply.status(500).send({ error: "Failed to load roster" });
    }
  });

  fastify.get("/editorial", async (_request, reply) => {
    try {
      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT id::text, title, image_url, video_url, sort_order
         FROM editorial
         ORDER BY sort_order ASC NULLS LAST, title ASC`
      );
      return reply.send({ editorial: rows });
    } catch (e) {
      console.error(e);
      return reply.status(500).send({ error: "Failed to load editorial" });
    }
  });
}
