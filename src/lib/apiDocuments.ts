import { apiRequest } from "@/lib/api";

export interface DocumentRecord {
  id: string;
  name: string;
  display_name: string | null;
  entity_type: string;
  module: string | null;
  type: string;
  parent_id: string | null;
  storage_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  rotation: number | null;
  zoom: number | null;
  validated: boolean;
  visual_state: Record<string, unknown> | null;
  uploaded_by: string | null;
  workspace_id: string | null;
  created_at: string;
  updated_at: string;
}

export type FolderRecord = Pick<DocumentRecord, "id" | "name" | "parent_id">;

export function listDocuments(
  entityType: string,
  mod: string,
  parentId: string | null,
): Promise<DocumentRecord[]> {
  const params = new URLSearchParams({ entity_type: entityType, module: mod });
  if (parentId !== null) params.set("parent_id", parentId);
  return apiRequest<DocumentRecord[]>(`/documents?${params}`, { timeoutMs: 10000 });
}

export function listFolders(entityType: string): Promise<FolderRecord[]> {
  return apiRequest<FolderRecord[]>(`/documents/folders?entity_type=${encodeURIComponent(entityType)}`, { timeoutMs: 10000 });
}

export function createDocument(payload: Record<string, unknown>): Promise<DocumentRecord> {
  return apiRequest<DocumentRecord>("/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    timeoutMs: 12000,
  });
}

export function updateDocument(id: string, payload: Record<string, unknown>): Promise<DocumentRecord> {
  return apiRequest<DocumentRecord>(`/documents/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    timeoutMs: 10000,
  });
}

export function deleteDocument(id: string): Promise<void> {
  return apiRequest<void>(`/documents/${id}`, { method: "DELETE", timeoutMs: 10000 });
}

export function batchDeleteDocuments(ids: string[]): Promise<void> {
  return apiRequest<void>("/documents/batch", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
    timeoutMs: 10000,
  });
}
