import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { getPool } from "../../db.js";

const ID = 1;

/** Ensures the singleton row exists (defaults from table DDL). */
async function ensureSiteMetricsRow(pool: Pool) {
  await pool.query(
    `INSERT INTO public.site_metrics (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
    [ID]
  );
}

function parseJsonArray<T>(raw: unknown, guard: (x: unknown) => x is T, fallback: T[]): T[] {
  if (Array.isArray(raw) && raw.every(guard)) return raw;
  return fallback;
}

function isCat(x: unknown): x is { label: string; value: number } {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return typeof o.label === "string" && typeof o.value === "number" && Number.isFinite(o.value);
}

function isYearRate(x: unknown): x is { year: number; rate: number } {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return typeof o.year === "number" && typeof o.rate === "number" && Number.isFinite(o.rate);
}

export async function registerAdminSiteMetricsRoutes(fastify: FastifyInstance) {
  fastify.get("/", async (_request, reply) => {
    try {
      const pool = getPool();
      await ensureSiteMetricsRow(pool);
      const { rows } = await pool.query(
        `SELECT id, total_earnings_display, brand_partnerships, countries_placements,
                models_represented, campaigns_delivered, years_excellence, placement_rate_percent,
                category_distribution, placement_by_year, updated_at
         FROM site_metrics WHERE id = $1`,
        [ID]
      );
      if (!rows.length) {
        return reply
          .status(500)
          .send({ error: "site_metrics row still missing after seed; check DB permissions." });
      }
      return reply.send({ metrics: rows[0] });
    } catch (e) {
      console.error(e);
      return reply.status(500).send({ error: "Failed to load site metrics" });
    }
  });

  fastify.patch<{
    Body: Record<string, unknown>;
  }>("/", async (request, reply) => {
    const body = request.body ?? {};
    try {
      const pool = getPool();
      await ensureSiteMetricsRow(pool);
      const cur = await pool.query(
        `SELECT total_earnings_display, brand_partnerships, countries_placements,
                models_represented, campaigns_delivered, years_excellence, placement_rate_percent,
                category_distribution, placement_by_year
         FROM site_metrics WHERE id = $1`,
        [ID]
      );
      if (!cur.rows.length) {
        return reply
          .status(500)
          .send({ error: "site_metrics row still missing after seed; check DB permissions." });
      }
      const r = cur.rows[0] as Record<string, unknown>;

      const total_earnings_display =
        typeof body.total_earnings_display === "string"
          ? body.total_earnings_display.trim()
          : String(r.total_earnings_display ?? "");

      const intField = (key: string, prev: unknown): number => {
        if (body[key] === undefined) return Number(prev) || 0;
        const n = Number(body[key]);
        if (!Number.isFinite(n) || n < 0) throw new Error(`Invalid ${key}`);
        return Math.trunc(n);
      };

      const category_distribution = parseJsonArray(
        body.category_distribution !== undefined ? body.category_distribution : r.category_distribution,
        isCat,
        []
      );
      if (!category_distribution.length) {
        return reply.status(400).send({ error: "category_distribution must be a non-empty array" });
      }

      const placement_by_year = parseJsonArray(
        body.placement_by_year !== undefined ? body.placement_by_year : r.placement_by_year,
        isYearRate,
        []
      );
      if (!placement_by_year.length) {
        return reply.status(400).send({ error: "placement_by_year must be a non-empty array" });
      }

      const brand_partnerships = intField("brand_partnerships", r.brand_partnerships);
      const countries_placements = intField("countries_placements", r.countries_placements);
      const models_represented = intField("models_represented", r.models_represented);
      const campaigns_delivered = intField("campaigns_delivered", r.campaigns_delivered);
      const years_excellence = intField("years_excellence", r.years_excellence);
      const placement_rate_percent = intField("placement_rate_percent", r.placement_rate_percent);
      if (placement_rate_percent > 100) {
        return reply.status(400).send({ error: "placement_rate_percent cannot exceed 100" });
      }

      const { rows } = await pool.query(
        `UPDATE site_metrics SET
          total_earnings_display = $1,
          brand_partnerships = $2,
          countries_placements = $3,
          models_represented = $4,
          campaigns_delivered = $5,
          years_excellence = $6,
          placement_rate_percent = $7,
          category_distribution = $8::jsonb,
          placement_by_year = $9::jsonb,
          updated_at = now()
         WHERE id = $10
         RETURNING id, total_earnings_display, brand_partnerships, countries_placements,
           models_represented, campaigns_delivered, years_excellence, placement_rate_percent,
           category_distribution, placement_by_year, updated_at`,
        [
          total_earnings_display,
          brand_partnerships,
          countries_placements,
          models_represented,
          campaigns_delivered,
          years_excellence,
          placement_rate_percent,
          JSON.stringify(category_distribution),
          JSON.stringify(placement_by_year),
          ID,
        ]
      );

      return reply.send({ metrics: rows[0] });
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "Update failed";
      if (msg.startsWith("Invalid")) {
        return reply.status(400).send({ error: msg });
      }
      return reply.status(500).send({ error: "Update failed" });
    }
  });
}
