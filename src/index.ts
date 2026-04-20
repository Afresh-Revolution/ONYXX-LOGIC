import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { config } from "./config.js";
import { registerApplicationsPublicRoutes } from "./routes/applicationsPublic.js";
import { registerAdminRoutes } from "./routes/admin/index.js";
import { registerAuthRoutes } from "./routes/authLogin.js";


async function main() {
  const fastify = Fastify({
    logger: true,
    trustProxy: true,
  });

  await fastify.register(helmet, {
    // Keep defaults; avoid breaking local dev with strict CSP unless needed.
    contentSecurityPolicy: false,
  });

  await fastify.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
    maxAge: 86400,
  });

  await fastify.register(rateLimit, {
    global: false,
    // Helps protect against header spoofing; relies on `trustProxy: true`.
    enableDraftSpec: true,
  });

  await fastify.register(multipart, {
    limits: {
      fileSize: 15 * 1024 * 1024,
      files: 10,
    },
  });

  fastify.get("/health", async () => ({ ok: true }));

  await fastify.register(registerAuthRoutes, { prefix: "/api/auth" });

  await fastify.register(registerApplicationsPublicRoutes, {
    prefix: "/api/applications",
  });

  await fastify.register(registerAdminRoutes, { prefix: "/api/admin" });

  const port = config.port;
  const host = "0.0.0.0";

  await fastify.listen({ port, host });
  console.log(`ONYXX API (Fastify) listening on http://localhost:${port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
