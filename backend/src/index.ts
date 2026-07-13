import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { ZodError } from "zod";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { ensureBuckets } from "./lib/minio.js";
import { authRouter } from "./routes/auth.js";
import { accountRouter } from "./routes/account.js";
import { billingRouter } from "./routes/billing.js";
import { workspaceRouter } from "./routes/workspaces.js";
import { extractRouter } from "./routes/extract.js";
import { storageRouter } from "./routes/storage.js";
import { documentsRouter } from "./routes/documents.js";
import { serviceOrdersRouter } from "./routes/serviceOrders.js";
import { productionOrdersRouter } from "./routes/productionOrders.js";
import { productionPhotosRouter } from "./routes/productionPhotos.js";
import { invitesRouter } from "./routes/invites.js";
import { paymentOrdersRouter } from "./routes/paymentOrders.js";

const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN.split(",").map((item: string) => item.trim()), credentials: true }));
app.use(
  express.json({
    limit: "20mb",
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
app.use("/api/extract", extractRouter);
app.use("/api/storage", storageRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/service-orders", serviceOrdersRouter);
app.use("/api/production-orders", productionOrdersRouter);
app.use("/api/production-orders/:orderId/photos", productionPhotosRouter);
app.use("/api", invitesRouter);
app.use("/api/payment-orders", paymentOrdersRouter);

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

app.listen(env.PORT, async () => {
  console.log(`[api] listening on port ${env.PORT}`);
  try {
    await ensureBuckets();
  } catch (err) {
    console.error("[minio] falha ao inicializar buckets:", err);
  }
});
