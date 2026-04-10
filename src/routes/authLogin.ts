import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { assertDb, assertJwtSecret, config } from "../config.js";
import { getPool } from "../db.js";

export async function registerAuthRoutes(fastify: FastifyInstance) {
  fastify.post<{
    Body: { email?: string; password?: string };
  }>("/login", async (request, reply) => {
    try {
      assertDb();
      assertJwtSecret();
    } catch (e) {
      return reply.status(503).send({
        error: e instanceof Error ? e.message : "Auth not configured",
      });
    }

    const email = String(request.body?.email ?? "").trim().toLowerCase();
    const password = String(request.body?.password ?? "");

    if (!email || !password) {
      return reply
        .status(400)
        .send({ error: "Email and password are required" });
    }

    try {
      const pool = getPool();
      const { rows } = await pool.query<{
        email: string;
        password_hash: string;
      }>(
        `SELECT email, password_hash FROM admin_users WHERE lower(email) = lower($1)`,
        [email]
      );
      const row = rows[0];
      if (
        !row ||
        !(await bcrypt.compare(password, row.password_hash))
      ) {
        return reply.status(401).send({ error: "Invalid email or password" });
      }

      const token = await new SignJWT({
        sub: row.email,
        role: "admin",
      })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("8h")
        .sign(new TextEncoder().encode(config.jwtSecret));

      return reply.send({ token });
    } catch (e) {
      console.error(e);
      return reply.status(500).send({ error: "Login failed" });
    }
  });
}
