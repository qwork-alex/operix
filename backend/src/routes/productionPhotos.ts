import { Router, type Response } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";

export const productionPhotosRouter = Router({ mergeParams: true });

function mapPhoto(p: any) {
  return {
    id: p.id,
    production_order_id: p.productionOrderId,
    workspace_id: p.workspaceId,
    uploaded_by: p.uploadedBy,
    category: p.category,
    storage_path: p.storagePath,
    caption: p.caption ?? null,
    size_bytes: p.sizeBytes ?? null,
    created_at: p.createdAt.toISOString(),
  };
}

// GET /production-orders/:orderId/photos
productionPhotosRouter.get("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { orderId } = req.params as { orderId: string };
  const photos = await prisma.productionPhoto.findMany({
    where: { productionOrderId: orderId },
    orderBy: { createdAt: "desc" },
  });
  return res.json(photos.map(mapPhoto));
});

// POST /production-orders/:orderId/photos
productionPhotosRouter.post("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { orderId } = req.params as { orderId: string };
  const b = req.body;

  if (!b.storage_path || !b.category || !b.workspace_id) {
    return res.status(400).json({ message: "Campos obrigatórios: storage_path, category, workspace_id." });
  }

  const photo = await prisma.productionPhoto.create({
    data: {
      productionOrderId: orderId,
      workspaceId: b.workspace_id,
      uploadedBy: b.uploaded_by ?? req.auth?.userId ?? "",
      category: b.category,
      storagePath: b.storage_path,
      caption: b.caption ?? null,
      sizeBytes: b.size_bytes ?? null,
    },
  });
  return res.status(201).json(mapPhoto(photo));
});

// DELETE /production-orders/:orderId/photos/:photoId
productionPhotosRouter.delete("/:photoId", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { photoId } = req.params as { photoId: string };
  await prisma.productionPhoto.delete({ where: { id: photoId } });
  return res.json({ deleted: 1 });
});
