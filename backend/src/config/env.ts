import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must have at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  CORS_ORIGIN: z.string().default("http://localhost:8080"),
  STRIPE_SANDBOX_API_KEY: z.string().optional().or(z.literal("")),
  STRIPE_LIVE_API_KEY: z.string().optional().or(z.literal("")),
  STRIPE_PORTAL_SANDBOX_URL: z.string().url().optional().or(z.literal("")),
  STRIPE_PORTAL_LIVE_URL: z.string().url().optional().or(z.literal("")),
  PAYMENTS_SANDBOX_WEBHOOK_SECRET: z.string().optional().or(z.literal("")),
  PAYMENTS_LIVE_WEBHOOK_SECRET: z.string().optional().or(z.literal("")),
});

export const env = envSchema.parse(process.env);
