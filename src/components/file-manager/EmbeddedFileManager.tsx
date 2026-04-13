import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { toast } from "sonner";
import {
  FolderOpen, FolderPlus, ChevronRight, Trash2, Download,
  Eye, Printer, FileText, MoveRight, Filter, CheckSquare, Pencil, Check, X,
  ExternalLink, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  entityType: "service_order" | "payment_order";
  module?: string;
  sessionFileNames?: string[];
}

/** Get a fresh signed URL, never reuse stale ones */
async function getFreshSignedUrl(storagePath: string, expiresIn = 600): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from("uploads")
      .createSignedUrl(storagePath, expiresIn);
    if (error) {
      console.error("[FileManager] Signed URL error:", error.message);
      return null;
    }
    return data?.signedUrl ?? null;
  } catch (err) {
    console.error("[FileManager] getFreshSignedUrl error:", err);
    return null;
  }
}

/** Detect correct Content-Type from filename */
function getMimeType(fileName: string, storedMime?: string | null): string {
  if (storedMime) return storedMime;
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    bmp: "image/bmp",
  };
  return map[ext] || "application/octet-stream";
}

function isImageMime(mime: string) {
  return mime.startsWith("image/");
}

function isPdfMime(mime: string) {
  return mime === "application/pdf";
}

export function EmbeddedFileManager({ entityType, module: moduleName = "orders", sessionFileNames = [] }: Props) {
  const { t, formatDate } = useLanguage();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [parentId, setParentId] = useState<string | null>(null);
  const [path, setPath] = useState<{ id: string | null; name: string }[]>([
    { id: null, name: t("common.root") },
  ]);
  const [folderName, setFolderName] = useState("");
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [moveTarget, setMoveTarget] = useState<any>(null);
  const [previewDoc, setPreviewDoc] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [filterMode, setFilterMode] = useState<"all" | "session">("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [newFolderInMove, setNewFolderInMove] = useState("");
  const [moveDestination, setMoveDestination] = useState<string>("__root__");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const queryKey = ["embedded-docs", entityType, parentId];

  const { data: docs = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      let q = supabase
        .from("documents")
        .select("*")
        .eq("entity_type", entityType)
        .eq("module", moduleName)
        .order("type", { ascending: true })
        .order("name");
      q = parentId ? q.eq("parent_id", parentId) : q.is("parent_id", null);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const { data: allFolders = [] } = useQuery({
    queryKey: ["embedded-folders", entityType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("id, name, parent_id")
        .eq("entity_type", entityType)
        .eq("type", "folder")
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: showMoveDialog,
  });

  const filteredDocs = filterMode === "session" && sessionFileNames.length > 0
    ? docs.filter((d: any) => d.type === "folder" || sessionFileNames.includes(d.name))
    : docs;

  const allSelected = filteredDocs.length > 0 && filteredDocs.every((d: any) => selectedIds.has(d.id));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredDocs.map((d: any) => d.id)));
    }
  };

  const clearSelection = () => setSelectedIds(new Set());

  const createFolder = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("documents").insert({
        name: folderName,
        type: "folder",
        parent_id: parentId,
        uploaded_by: user?.id,
        entity_type: entityType,
        module: moduleName,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["embedded-docs", entityType] });
      setShowFolderDialog(false);
      setFolderName("");
      toast.success(t("docs.folderCreated"));
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (doc: any) => {
      if (doc.storage_path) {
        await supabase.storage.from("uploads").remove([doc.storage_path]);
      }
      const { error } = await supabase.from("documents").delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["embedded-docs", entityType] });
      toast.success(t("toast.deleted"));
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const docsToDelete = docs.filter((d: any) => ids.includes(d.id));
      const storagePaths = docsToDelete
        .filter((d: any) => d.storage_path)
        .map((d: any) => d.storage_path);
      if (storagePaths.length > 0) {
        await supabase.storage.from("uploads").remove(storagePaths);
      }
      const { error } = await supabase.from("documents").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["embedded-docs", entityType] });
      clearSelection();
      toast.success(t("toast.deleted"));
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const moveMutation = useMutation({
    mutationFn: async ({ docIds, newParentId }: { docIds: string[]; newParentId: string | null }) => {
      const { error } = await supabase
        .from("documents")
        .update({ parent_id: newParentId })
        .in("id", docIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["embedded-docs", entityType] });
      setShowMoveDialog(false);
      setMoveTarget(null);
      clearSelection();
      toast.success(t("toast.updated"));
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const renameMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("documents").update({ name }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["embedded-docs", entityType] });
      setRenamingId(null);
      toast.success(t("toast.updated"));
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const createFolderInMove = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase.from("documents").insert({
        name,
        type: "folder",
        parent_id: null,
        uploaded_by: user?.id,
        entity_type: entityType,
        module: moduleName,
      }).select("id").single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["embedded-folders", entityType] });
      setMoveDestination(id);
      setNewFolderInMove("");
      toast.success(t("docs.folderCreated"));
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const navigateTo = (id: string | null, name: string) => {
    clearSelection();
    if (id === null) {
      setParentId(null);
      setPath([{ id: null, name: t("common.root") }]);
      return;
    }
    setParentId(id);
    const idx = path.findIndex((p) => p.id === id);
    if (idx >= 0) setPath(path.slice(0, idx + 1));
    else setPath([...path, { id, name }]);
  };

  const handleDownload = async (doc: any) => {
    if (!doc.storage_path) return;
    try {
      const url = await getFreshSignedUrl(doc.storage_path, 120);
      if (!url) { toast.error(t("fm.previewError")); return; }
      console.log("[FileManager] Download: fetching blob from signed URL", url.substring(0, 80));
      // Fetch as blob to bypass ERR_BLOCKED_BY_CLIENT
      const response = await fetch(url);
      if (!response.ok) {
        console.error("[FileManager] Download fetch failed:", response.status);
        // Fallback: open in new tab
        window.open(url, "_blank");
        return;
      }
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = doc.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
      console.log("[FileManager] Download complete:", doc.name);
    } catch (err) {
      console.error("[FileManager] Download error:", err);
      toast.error(t("fm.previewError"));
    }
  };

  const handlePreview = async (doc: any) => {
    if (!doc.storage_path) {
      console.warn("[FileManager] Preview skipped: no storage_path for", doc.name);
      toast.error("File not available — storage path missing.");
      return;
    }
    setPreviewLoading(true);
    try {
      const url = await getFreshSignedUrl(doc.storage_path, 600);
      console.log("[FileManager] Preview: signed URL generated", url ? url.substring(0, 80) : "null");
      if (!url) {
        toast.error("File not accessible — it may have been deleted from storage.");
        return;
      }
      const resolvedMime = getMimeType(doc.name, doc.mime_type);
      console.log("[FileManager] Preview: mime=", resolvedMime, "file=", doc.name);
      setPreviewDoc({ ...doc, url, mime_type: resolvedMime });
    } catch (err) {
      console.error("[FileManager] Preview error:", err);
      toast.error("Preview failed. Try opening the file in a new tab.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handlePrint = async (doc: any) => {
    if (!doc.storage_path) return;
    try {
      const url = await getFreshSignedUrl(doc.storage_path, 120);
      if (!url) { toast.error(t("fm.previewError")); return; }
      console.log("[FileManager] Print: signed URL generated", url.substring(0, 80));
      const resolvedMime = getMimeType(doc.name, doc.mime_type);

      // Fetch as blob and create object URL to avoid cross-origin blocks
      const response = await fetch(url);
      if (!response.ok) {
        console.error("[FileManager] Print fetch failed:", response.status);
        window.open(url, "_blank");
        return;
      }
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(new Blob([blob], { type: resolvedMime }));

      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.left = "-9999px";
      iframe.style.width = "1px";
      iframe.style.height = "1px";
      document.body.appendChild(iframe);

      if (isPdfMime(resolvedMime)) {
        iframe.src = blobUrl;
        iframe.onload = () => {
          try { iframe.contentWindow?.print(); } catch { window.open(blobUrl, "_blank"); }
          setTimeout(() => { document.body.removeChild(iframe); URL.revokeObjectURL(blobUrl); }, 10000);
        };
        iframe.onerror = () => { document.body.removeChild(iframe); URL.revokeObjectURL(blobUrl); window.open(url, "_blank"); };
      } else if (isImageMime(resolvedMime)) {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          iframeDoc.open();
          iframeDoc.write(`<!DOCTYPE html><html><head><title>Print</title><style>body{margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh}img{max-width:100%;height:auto}</style></head><body><img src="${blobUrl}" onload="window.print()"/></body></html>`);
          iframeDoc.close();
        }
        setTimeout(() => { document.body.removeChild(iframe); URL.revokeObjectURL(blobUrl); }, 15000);
      } else {
        document.body.removeChild(iframe);
        URL.revokeObjectURL(blobUrl);
        window.open(url, "_blank");
      }
    } catch (err) {
      console.error("[FileManager] Print error:", err);
      toast.error(t("fm.previewError"));
    }
  };

  const handleOpenInNewTab = async (doc: any) => {
    if (!doc.storage_path) return;
    try {
      const url = await getFreshSignedUrl(doc.storage_path, 120);
      console.log("[FileManager] Open in new tab: signed URL", url ? url.substring(0, 80) : "null");
      if (url) window.open(url, "_blank");
      else toast.error("Could not generate file URL.");
    } catch (err) {
      console.error("[FileManager] Open in new tab error:", err);
    }
  };

  const selectedArray = Array.from(selectedIds);
  const isBulkMode = selectedArray.length > 0;

  const openBulkMove = () => {
    setMoveTarget(null);
    setMoveDestination("__root__");
    setNewFolderInMove("");
    setShowMoveDialog(true);
  };

  return (
    <div className="space-y-3 rounded-lg border border-border/50 bg-card/50 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-foreground">{t("fm.title")}</span>
          <Badge variant="secondary" className="text-[10px]">
            {filteredDocs.filter((d: any) => d.type === "file").length} {t("common.file").toLowerCase()}(s)
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterMode} onValueChange={(v) => setFilterMode(v as any)}>
            <SelectTrigger className="h-7 w-[130px] text-[11px]">
              <Filter className="h-3 w-3 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("fm.allFiles")}</SelectItem>
              <SelectItem value="session">{t("fm.sessionFiles")}</SelectItem>
            </SelectContent>
          </Select>
          <Dialog open={showFolderDialog} onOpenChange={setShowFolderDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-[11px]">
                <FolderPlus className="h-3 w-3 mr-1" />{t("docs.newFolder")}
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader><DialogTitle>{t("docs.createFolder")}</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <Input
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  placeholder={t("label.name")}
                />
                <Button
                  className="w-full"
                  onClick={() => createFolder.mutate()}
                  disabled={!folderName.trim()}
                >
                  {t("action.save")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Bulk action bar */}
      {isBulkMode && (
        <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
          <CheckSquare className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium text-foreground">
            {selectedArray.length} {t("fm.selected")}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={openBulkMove}>
              <MoveRight className="h-3 w-3 mr-1" />{t("fm.move")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px] text-destructive border-destructive/30"
              onClick={() => bulkDeleteMutation.mutate(selectedArray)}
            >
              <Trash2 className="h-3 w-3 mr-1" />{t("action.delete")}
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={clearSelection}>
              {t("action.cancel")}
            </Button>
          </div>
        </div>
      )}

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
        {path.map((p, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3 w-3" />}
            <button onClick={() => navigateTo(p.id, p.name)} className="hover:text-foreground">
              {p.name}
            </button>
          </span>
        ))}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : filteredDocs.length === 0 ? (
        <div className="text-center py-6 text-xs text-muted-foreground">
          {t("docs.emptyFolder")}
        </div>
      ) : (
        <div className="rounded-md border border-border/30 overflow-auto max-h-[300px]">
          <Table>
            <TableHeader>
              <TableRow className="text-[10px]">
                <TableHead className="w-8">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleAll}
                    aria-label={t("fm.selectAll")}
                  />
                </TableHead>
                <TableHead>{t("label.name")}</TableHead>
                <TableHead>{t("label.type")}</TableHead>
                <TableHead>{t("docs.size")}</TableHead>
                <TableHead>{t("label.date")}</TableHead>
                <TableHead>{t("label.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDocs.map((d: any) => (
                <TableRow key={d.id} className={`text-[11px] ${selectedIds.has(d.id) ? "bg-primary/5" : ""}`}>
                  <TableCell className="w-8">
                    <Checkbox
                      checked={selectedIds.has(d.id)}
                      onCheckedChange={() => toggleSelect(d.id)}
                    />
                  </TableCell>
                  <TableCell
                    className="font-medium flex items-center gap-2 cursor-pointer"
                    onClick={() => renamingId !== d.id && d.type === "folder" && navigateTo(d.id, d.name)}
                  >
                    {d.type === "folder" ? (
                      <FolderOpen className="h-3.5 w-3.5 text-primary shrink-0" />
                    ) : (
                      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    )}
                    {renamingId === d.id ? (
                      <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); if (renameValue.trim()) renameMutation.mutate({ id: d.id, name: renameValue.trim() }); }}>
                        <Input
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          className="h-6 text-[11px] w-[160px]"
                          autoFocus
                          onKeyDown={(e) => { if (e.key === "Escape") setRenamingId(null); }}
                        />
                        <Button type="submit" variant="ghost" size="icon" className="h-5 w-5" disabled={!renameValue.trim()}>
                          <Check className="h-3 w-3 text-primary" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => setRenamingId(null)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </form>
                    ) : (
                      <span className="truncate max-w-[200px]">{d.name}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[9px]">
                      {d.type === "folder" ? t("common.folder") : t("common.file")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {d.size_bytes ? `${(d.size_bytes / 1024).toFixed(1)} KB` : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(d.created_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {d.type === "file" && (
                        <>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handlePreview(d)} title={t("fm.preview")} disabled={previewLoading}>
                            {previewLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDownload(d)} title={t("fm.download")}>
                            <Download className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handlePrint(d)} title={t("fm.print")}>
                            <Printer className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleOpenInNewTab(d)} title={t("fm.openInNewTab")}>
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => { setRenamingId(d.id); setRenameValue(d.name); }}
                        title={t("fm.rename")}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => {
                          setMoveTarget(d);
                          setMoveDestination("__root__");
                          setNewFolderInMove("");
                          setShowMoveDialog(true);
                        }}
                        title={t("fm.move")}
                      >
                        <MoveRight className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive"
                        onClick={() => deleteMutation.mutate(d)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Move dialog */}
      <Dialog open={showMoveDialog} onOpenChange={setShowMoveDialog}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>{t("fm.moveTo")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-xs text-muted-foreground">
              {moveTarget
                ? <>{t("fm.moveFile")}: <strong>{moveTarget.name}</strong></>
                : <>{selectedArray.length} {t("fm.selected")}</>
              }
            </p>
            <Select value={moveDestination} onValueChange={setMoveDestination}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder={t("fm.selectFolder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__root__">{t("common.root")}</SelectItem>
                {allFolders
                  .filter((f: any) => f.id !== moveTarget?.id && !selectedIds.has(f.id))
                  .map((f: any) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Input
                value={newFolderInMove}
                onChange={(e) => setNewFolderInMove(e.target.value)}
                placeholder={t("fm.newFolderName")}
                className="h-8 text-xs"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs shrink-0"
                disabled={!newFolderInMove.trim()}
                onClick={() => createFolderInMove.mutate(newFolderInMove.trim())}
              >
                <FolderPlus className="h-3 w-3 mr-1" />{t("action.add")}
              </Button>
            </div>
            <Button
              className="w-full"
              onClick={() => {
                const ids = moveTarget ? [moveTarget.id] : selectedArray;
                const dest = moveDestination === "__root__" ? null : moveDestination;
                moveMutation.mutate({ docIds: ids, newParentId: dest });
              }}
            >
              {t("fm.move")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview dialog with pinch-zoom, print, and open-in-new-tab */}
      <Dialog open={!!previewDoc} onOpenChange={() => setPreviewDoc(null)}>
        <DialogContent className="bg-card border-border max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2">
              <span className="truncate">{previewDoc?.name}</span>
              <div className="flex items-center gap-2 shrink-0">
                {previewDoc && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px]"
                    onClick={() => handlePrint(previewDoc)}
                  >
                    <Printer className="h-3 w-3 mr-1" />
                    {t("fm.print")}
                  </Button>
                )}
                {previewDoc && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px]"
                    onClick={() => handleOpenInNewTab(previewDoc)}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    {t("fm.openInNewTab")}
                  </Button>
                )}
              </div>
            </DialogTitle>
          </DialogHeader>
          <PinchZoomContainer>
            {previewDoc?.mime_type && isImageMime(previewDoc.mime_type) ? (
              <img
                src={previewDoc.url}
                alt={previewDoc.name}
                className="max-w-full rounded"
                onError={() => {
                  // Fallback: open in new tab on image load error
                  if (previewDoc?.url) {
                    window.open(previewDoc.url, "_blank");
                    setPreviewDoc(null);
                    toast.error(t("fm.previewError"));
                  }
                }}
              />
            ) : previewDoc?.mime_type && isPdfMime(previewDoc.mime_type) ? (
              <div className="relative">
                <iframe
                  src={previewDoc.url + "#toolbar=1"}
                  className="w-full h-[60vh] rounded border-0"
                  title={previewDoc.name}
                  onError={() => {
                    if (previewDoc?.url) window.open(previewDoc.url, "_blank");
                  }}
                />
              </div>
            ) : (
              <div className="text-center py-8 text-sm text-muted-foreground">
                <p className="mb-2">{t("fm.previewError")}</p>
                <a href={previewDoc?.url} target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" />
                  {t("fm.download")}
                </a>
              </div>
            )}
          </PinchZoomContainer>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Pinch-zoom container: allows touch zoom only inside document preview */
function PinchZoomContainer({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const lastDistance = useRef<number | null>(null);

  const getDistance = (touches: React.TouchList) => {
    const a = touches[0];
    const b = touches[1];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  };

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      lastDistance.current = getDistance(e.touches);
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
        setOrigin({ x: midX, y: midY });
      }
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastDistance.current !== null) {
      e.preventDefault();
      const dist = getDistance(e.touches);
      const delta = dist / lastDistance.current;
      setScale(prev => Math.min(Math.max(prev * delta, 1), 5));
      lastDistance.current = dist;
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    lastDistance.current = null;
  }, []);

  const lastTap = useRef(0);
  const onDoubleTap = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const now = Date.now();
    if (now - lastTap.current < 300) {
      setScale(1);
    }
    lastTap.current = now;
  }, []);

  return (
    <div
      ref={containerRef}
      className="overflow-auto max-h-[65vh] touch-manipulation"
      style={{ touchAction: "pan-x pan-y" }}
      onTouchStart={(e) => { onDoubleTap(e); onTouchStart(e); }}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div
        style={{
          transform: `scale(${scale})`,
          transformOrigin: `${origin.x}px ${origin.y}px`,
          transition: lastDistance.current ? "none" : "transform 0.2s ease-out",
        }}
      >
        {children}
      </div>
    </div>
  );
}


const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
];

export async function storeFileInDocuments(
  file: File,
  entityType: "service_order" | "payment_order",
  userId?: string,
  module: string = "orders"
) {
  try {
    // Validate file
    if (!file || file.size === 0) {
      console.error("[FileManager] Upload rejected: empty file", file?.name);
      return;
    }
    const resolvedMime = file.type || getMimeType(file.name);
    if (!ALLOWED_MIME_TYPES.includes(resolvedMime)) {
      console.warn("[FileManager] Upload rejected: unsupported type", resolvedMime, file.name);
      return;
    }

    const storagePath = `${entityType}/${Date.now()}_${file.name}`;
    console.log("[FileManager] Uploading:", { storagePath, size: file.size, mime: resolvedMime });

    const { error: uploadErr } = await supabase.storage
      .from("uploads")
      .upload(storagePath, file, {
        contentType: resolvedMime,
        upsert: false,
      });
    if (uploadErr) {
      console.error("[FileManager] Storage upload failed:", uploadErr.message);
      return;
    }

    // Verify upload succeeded by requesting a signed URL
    const { data: verifyData, error: verifyErr } = await supabase.storage
      .from("uploads")
      .createSignedUrl(storagePath, 60);
    if (verifyErr || !verifyData?.signedUrl) {
      console.error("[FileManager] Upload verification failed:", verifyErr?.message);
    } else {
      console.log("[FileManager] Upload verified, signed URL OK:", storagePath);
    }

    const { error } = await supabase.from("documents").insert({
      name: file.name,
      type: "file",
      parent_id: null,
      uploaded_by: userId || null,
      storage_path: storagePath,
      mime_type: resolvedMime,
      size_bytes: file.size,
      entity_type: entityType,
      module,
    });
    if (error) console.error("[FileManager] Document record insert failed:", error.message);
    else console.log("[FileManager] Document record saved:", file.name);
  } catch (err) {
    console.error("[FileManager] storeFileInDocuments error:", err);
  }
}
