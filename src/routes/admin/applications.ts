import type { FastifyInstance } from "fastify";
import { getPool } from "../../db.js";
import {
  sendRejectedEmail,
  sendShortlistedEmail,
} from "../../lib/emailApplicants.js";

const ALLOWED_STATUSES = [
  "new",
  "reviewed",
  "shortlisted",
  "rejected",
  "archived",
] as const;

function formatDateOnly(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const d = new Date(v as string);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function mapApplicationRow(row: Record<string, unknown>) {
  let photo_urls: unknown = row.photo_urls;
  if (typeof photo_urls === "string") {
    try {
      photo_urls = JSON.parse(photo_urls);
    } catch {
      photo_urls = [];
    }
  }
  if (!Array.isArray(photo_urls)) photo_urls = [];

  const interview_at = row.interview_at;
  const created_at = row.created_at;
  const updated_at = row.updated_at;

  return {
    id: String(row.id),
    full_name: row.full_name,
    email: row.email,
    phone: row.phone,
    date_of_birth: formatDateOnly(row.date_of_birth),
    height: row.height,
    city: row.city,
    experience_level: row.experience_level,
    portfolio_url: row.portfolio_url,
    message: row.message,
    photo_urls,
    status: row.status,
    interview_at: interview_at
      ? new Date(interview_at as string).toISOString()
      : null,
    created_at: created_at
      ? new Date(created_at as string).toISOString()
      : null,
    updated_at: updated_at
      ? new Date(updated_at as string).toISOString()
      : null,
  };
}

export async function registerAdminApplicationsRoutes(
  fastify: FastifyInstance
) {
  fastify.get("/", async (_request, reply) => {
    try {
      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT id, full_name, email, phone, date_of_birth, height, city,
                experience_level, portfolio_url, message, photo_urls, status,
                interview_at, created_at, updated_at
         FROM applications
         ORDER BY created_at DESC`
      );
      return reply.send({
        applications: rows.map((r) => mapApplicationRow(r as Record<string, unknown>)),
      });
    } catch (e) {
      console.error(e);
      return reply.status(500).send({
        error: "Failed to list applications",
      });
    }
  });

  fastify.patch<{
    Params: { id: string };
    Body: { status?: string; interview_at?: string };
  }>(
    "/:id/status",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { id } = request.params;
      const status = String(request.body?.status ?? "").trim();
      const interview_at_raw = request.body?.interview_at;

      if (!status) {
        return reply.status(400).send({ error: "status required" });
      }
      if (!ALLOWED_STATUSES.includes(status as (typeof ALLOWED_STATUSES)[number])) {
        return reply.status(400).send({ error: "Invalid status" });
      }

      let interviewAtIso: string | null = null;
      if (status === "shortlisted") {
        if (typeof interview_at_raw !== "string" || !interview_at_raw.trim()) {
          return reply.status(400).send({
            error:
              "interview_at is required when status is shortlisted (ISO date string)",
          });
        }
        const d = new Date(interview_at_raw);
        if (Number.isNaN(d.getTime())) {
          return reply.status(400).send({ error: "interview_at must be a valid date" });
        }
        interviewAtIso = d.toISOString();
      }

      try {
        const pool = getPool();
        const prev = await pool.query(
          `SELECT id, full_name, email, status FROM applications WHERE id = $1::uuid`,
          [id]
        );
        if (!prev.rows.length) {
          return reply.status(404).send({ error: "Not found" });
        }
        const before = prev.rows[0] as {
          full_name: string;
          email: string;
          status: string;
        };

        const { rows } = await pool.query(
          `UPDATE applications
           SET status = $1,
               interview_at = CASE WHEN $1::text = 'shortlisted' THEN $2::timestamptz ELSE NULL END,
               updated_at = now()
           WHERE id = $3::uuid
           RETURNING id, full_name, email, phone, date_of_birth, height, city,
                     experience_level, portfolio_url, message, photo_urls, status,
                     interview_at, created_at, updated_at`,
          [status, interviewAtIso, id]
        );

        const row = rows[0] as Record<string, unknown>;
        const statusChanged = before.status !== status;

        let emailError: string | undefined;
        if (statusChanged && status === "shortlisted" && interviewAtIso) {
          try {
            await sendShortlistedEmail({
              to: String(row.email),
              name: String(row.full_name),
              interviewAtIso,
            });
          } catch (err) {
            console.error("Shortlisted email failed:", err);
            emailError =
              "Status saved, but the shortlisted email could not be sent. Check RESEND_API_KEY and domain verification.";
          }
        } else if (statusChanged && status === "rejected") {
          try {
            await sendRejectedEmail({
              to: String(row.email),
              name: String(row.full_name),
            });
          } catch (err) {
            console.error("Rejected email failed:", err);
            emailError =
              "Status saved, but the rejection email could not be sent. Check RESEND_API_KEY and domain verification.";
          }
        }

        return reply.send({
          ok: true,
          application: mapApplicationRow(row),
          ...(emailError ? { emailError } : {}),
        });
      } catch (e) {
        console.error(e);
        return reply.status(500).send({ error: "Update failed" });
      }
    }
  );

  fastify.patch<{
    Params: { id: string };
    Body: { interview_at?: string };
  }>(
    "/:id",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { id } = request.params;
      const interview_at_raw = request.body?.interview_at;
      if (typeof interview_at_raw !== "string" || !interview_at_raw.trim()) {
        return reply.status(400).send({ error: "interview_at is required" });
      }
      const d = new Date(interview_at_raw);
      if (Number.isNaN(d.getTime())) {
        return reply.status(400).send({ error: "interview_at must be a valid date" });
      }
      const interviewIso = d.toISOString();

      try {
        const pool = getPool();
        const { rows } = await pool.query(
          `UPDATE applications
           SET interview_at = $1::timestamptz, updated_at = now()
           WHERE id = $2::uuid AND status = 'shortlisted'
           RETURNING id, full_name, email, phone, date_of_birth, height, city,
                     experience_level, portfolio_url, message, photo_urls, status,
                     interview_at, created_at, updated_at`,
          [interviewIso, id]
        );
        if (!rows.length) {
          return reply.status(400).send({
            error: "Application not found or not in shortlisted status.",
          });
        }
        return reply.send({
          ok: true,
          application: mapApplicationRow(rows[0] as Record<string, unknown>),
        });
      } catch (e) {
        console.error(e);
        return reply.status(500).send({ error: "Update failed" });
      }
    }
  );
}
