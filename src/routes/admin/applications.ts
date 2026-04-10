import type { FastifyInstance } from "fastify";
import { getPool } from "../../db.js";

export async function registerAdminApplicationsRoutes(
  fastify: FastifyInstance
) {
  fastify.get("/", async (_request, reply) => {
    try {
      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT id, full_name, email, phone, date_of_birth, height, city,
                experience_level, portfolio_url, message, photo_urls, status, created_at
         FROM applications
         ORDER BY created_at DESC`
      );
      return reply.send({ applications: rows });
    } catch (e) {
      console.error(e);
      return reply.status(500).send({
        error: "Failed to list applications",
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  });

  fastify.patch<{
    Params: { id: string };
    Body: { status?: string };
  }>("/:id/status", async (request, reply) => {
    const { id } = request.params;
    const status = String(request.body?.status ?? "").trim();
    if (!status) {
      return reply.status(400).send({ error: "status required" });
    }
    try {
      const pool = getPool();
      const { rowCount } = await pool.query(
        `UPDATE applications SET status = $1 WHERE id = $2::uuid`,
        [status, id]
      );
      if (!rowCount) return reply.status(404).send({ error: "Not found" });
      return reply.send({ ok: true });
    } catch (e) {
      console.error(e);
      return reply.status(500).send({ error: "Update failed" });
    }
  });
}
