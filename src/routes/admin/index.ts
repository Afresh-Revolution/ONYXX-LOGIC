import type { FastifyInstance } from "fastify";
import { adminPreHandler } from "../../auth/adminPreHandler.js";
import { registerAdminApplicationsRoutes } from "./applications.js";
import { registerAdminEditorialRoutes } from "./editorial.js";
import { registerAdminRosterRoutes } from "./roster.js";

export async function registerAdminRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", adminPreHandler);

  await fastify.register(registerAdminApplicationsRoutes, {
    prefix: "/applications",
  });
  await fastify.register(registerAdminRosterRoutes, { prefix: "/roster" });
  await fastify.register(registerAdminEditorialRoutes, {
    prefix: "/editorial",
  });
}
