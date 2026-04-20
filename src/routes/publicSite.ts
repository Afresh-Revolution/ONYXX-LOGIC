import type { FastifyInstance } from "fastify";
import { getPool } from "../db.js";

/**
 * Read-only JSON for the Next.js marketing site (same shape as legacy `/api/editorial` + `/api/roster`).
 */
export async function registerPublicSiteRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/editorial",
    { config: { rateLimit: { max: 300, timeWindow: "1 minute" } } },
    async (_request, reply) => {
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
        return reply.status(500).send({ error: "Could not load editorial" });
      }
    }
  );

  fastify.get(
    "/roster",
    { config: { rateLimit: { max: 300, timeWindow: "1 minute" } } },
    async (_request, reply) => {
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
        return reply.status(500).send({ error: "Could not load roster" });
      }
    }
  );
}
