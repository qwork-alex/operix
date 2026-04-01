import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { toast } from "sonner";
import {
  FolderOpen, FolderPlus, ChevronRight, Trash2, Download,
  Eye, Printer, FileText, MoveRight, Filter, CheckSquare, Pencil, Check, X,
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
  sessionFileNames?: string[];
}

export function EmbeddedFileManager({ entityType, sessionFileNames = [] }: Props) {
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
  const [filterMode, setFilterMode] = useState<"all" | "session">("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [newFolderInMove, setNewFolderInMove] = useState("");
  const [moveDestination, setMoveDestination] = useState<string>("__root__");

  const queryKey = ["embedded-docs", entityType, parentId];

  const { data: docs = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      let q = supabase
        .from("documents")
        .select("*")
        .eq("entity_type", entityType)
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

  const createFolderInMove = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase.from("documents").insert({
        name,
        type: "folder",
        parent_id: null,
        uploaded_by: user?.id,
        entity_type: entityType,
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
    const { data } = await supabase.storage.from("uploads").createSignedUrl(doc.storage_path, 300);
    if (data?.signedUrl) {
      const a = document.createElement("a");
      a.href = data.signedUrl;
      a.download = doc.name;
      a.click();
    }
  };

  const handlePreview = async (doc: any) => {
    if (!doc.storage_path) return;
    const { data } = await supabase.storage.from("uploads").createSignedUrl(doc.storage_path, 300);
    if (data?.signedUrl) {
      setPreviewDoc({ ...doc, url: data.signedUrl });
    }
  };

  const handlePrint = async (doc: any) => {
    if (!doc.storage_path) return;
    const { data } = await supabase.storage.from("uploads").createSignedUrl(doc.storage_path, 300);
    if (data?.signedUrl) {
      const w = window.open(data.signedUrl, "_blank");
      w?.addEventListener("load", () => w.print());
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
                    onClick={() => d.type === "folder" && navigateTo(d.id, d.name)}
                  >
                    {d.type === "folder" ? (
                      <FolderOpen className="h-3.5 w-3.5 text-primary" />
                    ) : (
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span className="truncate max-w-[200px]">{d.name}</span>
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
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handlePreview(d)} title={t("fm.preview")}>
                            <Eye className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDownload(d)} title={t("fm.download")}>
                            <Download className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handlePrint(d)} title={t("fm.print")}>
                            <Printer className="h-3 w-3" />
                          </Button>
                        </>
                      )}
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
            {/* Create new folder inline */}
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

      {/* Preview dialog */}
      <Dialog open={!!previewDoc} onOpenChange={() => setPreviewDoc(null)}>
        <DialogContent className="bg-card border-border max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{previewDoc?.name}</DialogTitle>
          </DialogHeader>
          <div className="overflow-auto max-h-[65vh]">
            {previewDoc?.mime_type?.startsWith("image/") ? (
              <img src={previewDoc.url} alt={previewDoc.name} className="max-w-full rounded" />
            ) : previewDoc?.mime_type === "application/pdf" ? (
              <iframe src={previewDoc.url} className="w-full h-[60vh] rounded" />
            ) : (
              <div className="text-center py-8 text-sm text-muted-foreground">
                <a href={previewDoc?.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                  {t("fm.download")}
                </a>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Utility to store a file in the document system linked to a module */
export async function storeFileInDocuments(
  file: File,
  entityType: "service_order" | "payment_order",
  userId?: string
) {
  try {
    const storagePath = `${entityType}/${Date.now()}_${file.name}`;
    const { error: uploadErr } = await supabase.storage
      .from("uploads")
      .upload(storagePath, file);
    if (uploadErr) {
      console.error("[FileManager] Storage upload failed:", uploadErr.message);
      return;
    }

    const { error } = await supabase.from("documents").insert({
      name: file.name,
      type: "file",
      parent_id: null,
      uploaded_by: userId || null,
      storage_path: storagePath,
      mime_type: file.type,
      size_bytes: file.size,
      entity_type: entityType,
    });
    if (error) console.error("[FileManager] Document record insert failed:", error.message);
  } catch (err) {
    console.error("[FileManager] storeFileInDocuments error:", err);
  }
}
