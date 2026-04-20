import { Resend } from "resend";
import { config } from "../config.js";

function client(): Resend {
  if (!config.resendApiKey) {
    throw new Error("RESEND_API_KEY is not set");
  }
  return new Resend(config.resendApiKey);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatInterview(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export async function sendShortlistedEmail(opts: {
  to: string;
  name: string;
  interviewAtIso: string;
}): Promise<void> {
  const r = client();
  const when = formatInterview(opts.interviewAtIso);
  const { error } = await r.emails.send({
    from: config.resendFrom,
    to: opts.to,
    subject: "ONYXX — You're shortlisted",
    html: `
      <p>Hi ${escapeHtml(opts.name)},</p>
      <p>Thank you for applying to <strong>ONYXX</strong>. We're pleased to let you know you've been <strong>shortlisted</strong>.</p>
      <p>Your interview is scheduled for:</p>
      <p style="font-size:1.1em;margin:1rem 0;"><strong>${escapeHtml(when)}</strong></p>
      <p>We'll send any further details separately. If you need to reschedule, reply to this email.</p>
      <p style="color:#666;font-size:0.9em;margin-top:2rem;">— ONYXX</p>
    `,
  });
  if (error) throw new Error(error.message);
}

export async function sendRejectedEmail(opts: {
  to: string;
  name: string;
}): Promise<void> {
  const r = client();
  const { error } = await r.emails.send({
    from: config.resendFrom,
    to: opts.to,
    subject: "ONYXX — Application update",
    html: `
      <p>Hi ${escapeHtml(opts.name)},</p>
      <p>Thank you for your interest in <strong>ONYXX</strong> and for taking the time to apply.</p>
      <p>After careful review, we won't be moving forward with your application at this time. We encourage you to keep developing your portfolio and to consider applying again in the future.</p>
      <p style="color:#666;font-size:0.9em;margin-top:2rem;">— ONYXX</p>
    `,
  });
  if (error) throw new Error(error.message);
}
