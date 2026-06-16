import { Router, type Request, type Response } from "express";
import multer from "multer";
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { s3, PUBLIC_BUCKETS } from "../lib/minio.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { verifyAccessToken } from "../lib/jwt.js";
import { prisma } from "../lib/prisma.js";
import type { Readable } from "node:stream";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

/** Aceita JWT via header Authorization OU via query param ?token= (para uso em <img src> e links) */
async function requireAuthFlexible(req: AuthenticatedRequest, res: Response, next: () => void) {
  const header = req.headers.authorization;
  const queryToken = typeof req.query.token === "string" ? req.query.token : null;
  const raw = header?.startsWith("Bearer ") ? header.slice(7) : queryToken;

  if (!raw) {
    res.status(401).json({ message: "Token JWT ausente." });
    return;
  }
  try {
    const payload = verifyAccessToken(raw);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, isActive: true },
    });
    if (!user || !user.isActive) {
      res.status(401).json({ message: "Usuário não encontrado ou inativo." });
      return;
    }
    req.auth = { userId: user.id, email: user.email, role: user.role };
    next();
  } catch {
    res.status(401).json({ message: "Token JWT inválido ou expirado." });
  }
}

export const storageRouter = Router();

// POST /storage/upload
storageRouter.post(
  "/upload",
  requireAuth,
  upload.single("file"),
  async (req: AuthenticatedRequest, res: Response) => {
    const file = req.file;
    const bucket = req.body.bucket as string | undefined;
    const path = req.body.path as string | undefined;

    if (!file || !bucket || !path) {
      res.status(400).json({ message: "Campos obrigatórios: file, bucket, path." });
      return;
    }

    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: path,
          Body: file.buffer,
          ContentType: file.mimetype || "application/octet-stream",
        })
      );
      res.json({ path, bucket });
    } catch (err) {
      console.error("[storage] upload error", err);
      res.status(500).json({ message: "Erro ao fazer upload do arquivo." });
    }
  }
);

async function streamObject(bucket: string, filePath: string, res: Response, cacheControl: string) {
  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: filePath }));
    if (obj.ContentType) res.setHeader("Content-Type", obj.ContentType);
    if (obj.ContentLength) res.setHeader("Content-Length", obj.ContentLength);
    res.setHeader("Cache-Control", cacheControl);
    (obj.Body as Readable).pipe(res);
  } catch (err: unknown) {
    const code = (err as { name?: string })?.name;
    if (code === "NoSuchKey" || code === "NotFound") {
      res.status(404).json({ message: "Arquivo não encontrado." });
    } else {
      console.error("[storage] stream error", err);
      res.status(500).json({ message: "Erro ao recuperar o arquivo." });
    }
  }
}

function wildcardPath(req: Request): string {
  const raw = (req.params as Record<string, string | string[]>)["0"];
  return Array.isArray(raw) ? raw.join("/") : (raw ?? "");
}

function bucketParam(req: Request): string {
  const raw = (req.params as Record<string, string | string[]>)["bucket"];
  return Array.isArray(raw) ? raw[0] : (raw ?? "");
}

// GET /storage/file/:bucket/* — arquivos privados (JWT obrigatório)
storageRouter.get(
  "/file/:bucket/*",
  requireAuthFlexible as unknown as Parameters<typeof storageRouter.get>[1],
  async (req: Request, res: Response) => {
    await streamObject(bucketParam(req), wildcardPath(req), res, "private, max-age=3600");
  }
);

// GET /storage/public/:bucket/* — arquivos públicos (sem auth)
storageRouter.get("/public/:bucket/*", async (req: Request, res: Response) => {
  const bucket = bucketParam(req);
  if (!PUBLIC_BUCKETS.includes(bucket)) {
    res.status(403).json({ message: "Bucket não é público." });
    return;
  }
  await streamObject(bucket, wildcardPath(req), res, "public, max-age=86400");
});

// DELETE /storage/files
storageRouter.delete("/files", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { bucket, paths } = req.body as { bucket?: string; paths?: string[] };

  if (!bucket || !Array.isArray(paths) || paths.length === 0) {
    res.status(400).json({ message: "Campos obrigatórios: bucket, paths (array)." });
    return;
  }

  try {
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: paths.map((Key) => ({ Key })) },
      })
    );
    res.json({ deleted: paths.length });
  } catch (err) {
    console.error("[storage] delete error", err);
    res.status(500).json({ message: "Erro ao deletar arquivo(s)." });
  }
});
