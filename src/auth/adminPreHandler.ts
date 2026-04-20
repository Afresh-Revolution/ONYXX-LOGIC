import type { FastifyReply, FastifyRequest } from "fastify";
import { jwtVerify } from "jose";
import { assertJwtSecret, config } from "../config.js";

export async function adminPreHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    assertJwtSecret();
  } catch {
    await reply.status(503).send({ error: "Admin API not configured" });
    return;
  }

  const bearer = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!bearer) {
    await reply.status(401).send({ error: "Unauthorized" });
    return;
  }

  try {
    const { payload } = await jwtVerify(
      bearer,
      new TextEncoder().encode(config.jwtSecret),
      {
        algorithms: ["HS256"],
        issuer: "onyxx-backend",
        audience: "onyxx-admin",
      }
    );
    if (payload.role !== "admin") {
      await reply.status(403).send({ error: "Forbidden" });
      return;
    }
  } catch {
    await reply.status(401).send({ error: "Unauthorized" });
    return;
  }
}
