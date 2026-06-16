import nodemailer from "nodemailer";
import { env } from "../../config/env.js";

export type EmailSendResult =
  | { ok: true; provider: "smtp"; id: string | null }
  | { ok: false; provider: "smtp"; error: string };

function resolveEmailFrom() {
  const from = (env.EMAIL_FROM || "").trim();
  if (!from) return null;
  return from;
}

export function isEmailConfigured(): boolean {
  return (
    Boolean((env.SMTP_HOST || "").trim()) &&
    Boolean((env.SMTP_USER || "").trim()) &&
    Boolean((env.SMTP_PASS || "").trim()) &&
    Boolean(resolveEmailFrom())
  );
}

let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!_transporter) {
    const secure = env.SMTP_SECURE !== "false";
    _transporter = nodemailer.createTransport({
      host: (env.SMTP_HOST || "").trim(),
      port: env.SMTP_PORT ?? 465,
      secure,
      auth: {
        user: (env.SMTP_USER || "").trim(),
        pass: (env.SMTP_PASS || "").trim(),
      },
    });
  }
  return _transporter;
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  cc?: string | null;
  attachments?: Array<{ filename: string; contentBase64: string }> | null;
}): Promise<EmailSendResult> {
  const from = resolveEmailFrom();
  if (!from) return { ok: false, provider: "smtp", error: "EMAIL_FROM missing" };
  if (!isEmailConfigured()) return { ok: false, provider: "smtp", error: "SMTP not configured" };

  try {
    const transporter = getTransporter();
    const info = await transporter.sendMail({
      from,
      to: params.to,
      cc: params.cc?.trim() || undefined,
      subject: params.subject,
      html: params.html,
      text: params.text,
      attachments: params.attachments
        ?.filter((a) => a?.filename && a?.contentBase64)
        .map((a) => ({
          filename: a.filename,
          content: Buffer.from(a.contentBase64, "base64"),
        })),
    });
    return { ok: true, provider: "smtp", id: info.messageId ?? null };
  } catch (err: any) {
    return { ok: false, provider: "smtp", error: String(err?.message ?? err) };
  }
}
