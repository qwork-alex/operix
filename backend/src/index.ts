import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { ZodError } from "zod";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { authRouter } from "./routes/auth.js";
import { accountRouter } from "./routes/account.js";
import { billingRouter } from "./routes/billing.js";
import { workspaceRouter } from "./routes/workspaces.js";

const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN.split(",").map((item: string) => item.trim()), credentials: true }));
app.use(
  express.json({
    limit: "5mb",
    verify: (req: Request & { rawBody?: string }, _res: Response, buf: Uint8Array) => {
      req.rawBody = new TextDecoder().decode(buf);
    },
  }),
);
app.use(morgan("combined"));

app.get("/api/health", async (_req: Request, res: Response) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({
    status: "ok",
    service: "qw-nexus-api",
  });
});

app.use("/api/auth", authRouter);
app.use("/api/account", accountRouter);
app.use("/api/billing", billingRouter);
app.use("/api/workspaces", workspaceRouter);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    return res.status(400).json({
      message: "Payload inválido.",
      issues: err.issues,
    });
  }

  const message = err instanceof Error ? err.message : String(err);
  console.error("[api] unhandled error", message);
  return res.status(500).json({
    message: "Erro interno no servidor.",
  });
});

app.listen(env.PORT, () => {
  console.log(`[api] listening on port ${env.PORT}`);
});
