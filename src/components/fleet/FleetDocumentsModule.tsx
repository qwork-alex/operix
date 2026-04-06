import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Upload, Eye, Download, Printer, Trash2, FileText, Loader2,
  FolderPlus, Folder, Pencil, Check, X, ArrowLeft, Share2, FolderOpen, MoreHorizontal
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

const entityTypeLabels: Record<string, string> = {
  vehicle_document: "Documento Veículo",
  driver_document: "Documento Condutor",
  fuel_receipt: "Comprovante Combustível",
  report: "Relatório",
};

export default function FleetDocumentsModule() {
  const qc = useQueryClient();
  const [typeFilter, setTypeFilter] = useState("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadType, setUploadType] = useState("vehicle_document");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState("");

  // Folder navigation
  const [parentId, setParentId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<{ id: string | null; name: string }[]>([{ id: null, name: "Raiz" }]);

  // Folder creation
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  // Rename
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Edit type
  const [editTypeId, setEditTypeId] = useState<string | null>(null);
  const [editTypeValue, setEditTypeValue] = useState("");

  // Move
  const [moveDoc, setMoveDoc] = useState<any>(null);
  const [moveFolders, setMoveFolders] = useState<any[]>([]);

  const fleetEntityTypes = ["vehicle_document", "driver_document", "fuel_receipt", "report"];

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["fleet_documents", parentId],
    queryFn: async () => {
      let q = supabase.from("documents").select("*")
        .order("type", { ascending: true })
        .order("created_at", { ascending: false });

      if (parentId) {
        q = q.eq("parent_id", parentId);
      } else {
        q = q.is("parent_id", null);
      }

      // Include folders + fleet files
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).filter((d: any) =>
        d.type === "folder" || fleetEntityTypes.includes(d.entity_type)
      );
    },
  });

  const folders = docs.filter((d: any) => d.type === "folder");
  const files = docs.filter((d: any) => d.type !== "folder");
  const filtered = typeFilter === "all" ? files : files.filter((d: any) => d.entity_type === typeFilter);

  // Create folder
  const createFolder = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("documents").insert({
        name,
        type: "folder",
        parent_id: parentId,
        entity_type: "vehicle_document",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fleet_documents"] });
      setShowFolderDialog(false);
      setNewFolderName("");
      toast.success("Pasta criada");
    },
  });

  // Upload
  const uploadDoc = async (file: File) => {
    const path = `fleet/docs/${Date.now()}_${file.name}`;
    const { error: upErr } = await supabase.storage.from("uploads").upload(path, file);
    if (upErr) { toast.error(upErr.message); return; }

    const { error } = await supabase.from("documents").insert({
      name: file.name,
      type: "file",
      entity_type: uploadType,
      storage_path: path,
      mime_type: file.type,
      size_bytes: file.size,
      parent_id: parentId,
    });
    if (error) toast.error(error.message);
    else {
      qc.invalidateQueries({ queryKey: ["fleet_documents"] });
      toast.success("Documento enviado");
      setUploadOpen(false);
    }
  };

  // Delete
  const remove = useMutation({
    mutationFn: async (doc: any) => {
      if (doc.storage_path) await supabase.storage.from("uploads").remove([doc.storage_path]);
      const { error } = await supabase.from("documents").delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fleet_documents"] }); toast.success("Removido"); },
  });

  // Rename
  const renameMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("documents").update({ name }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fleet_documents"] });
      setRenamingId(null);
      toast.success("Renomeado");
    },
  });

  // Edit type
  const editTypeMutation = useMutation({
    mutationFn: async ({ id, entity_type }: { id: string; entity_type: string }) => {
      const { error } = await supabase.from("documents").update({ entity_type }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fleet_documents"] });
      setEditTypeId(null);
      toast.success("Tipo atualizado");
    },
  });

  // Move
  const moveMutation = useMutation({
    mutationFn: async ({ id, targetParentId }: { id: string; targetParentId: string | null }) => {
      const { error } = await supabase.from("documents").update({ parent_id: targetParentId }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fleet_documents"] });
      setMoveDoc(null);
      toast.success("Movido");
    },
  });

  // Load folders for move dialog
  const loadMoveFolders = async () => {
    const { data } = await supabase.from("documents")
      .select("id, name, parent_id")
      .eq("type", "folder")
      .order("name");
    setMoveFolders(data || []);
  };

  // Navigation
  const navigateTo = (doc: any) => {
    setParentId(doc.id);
    setFolderPath(prev => [...prev, { id: doc.id, name: doc.name }]);
  };

  const navigateToPath = (index: number) => {
    const target = folderPath[index];
    setParentId(target.id);
    setFolderPath(prev => prev.slice(0, index + 1));
  };

  // File actions
  const handlePreview = async (doc: any) => {
    if (doc.storage_path) {
      const { data } = await supabase.storage.from("uploads").createSignedUrl(doc.storage_path, 600);
      if (data?.signedUrl) {
        setPreviewUrl(data.signedUrl);
        setPreviewName(doc.name);
      }
    }
  };

  const handleDownload = async (doc: any) => {
    if (doc.storage_path) {
      const { data } = await supabase.storage.from("uploads").createSignedUrl(doc.storage_path, 300);
      if (data?.signedUrl) {
        const a = document.createElement("a");
        a.href = data.signedUrl;
        a.download = doc.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    }
  };

  const handlePrint = async (doc: any) => {
    if (doc.storage_path) {
      const { data } = await supabase.storage.from("uploads").createSignedUrl(doc.storage_path, 300);
      if (data?.signedUrl) {
        const w = window.open(data.signedUrl, "_blank");
        if (w) setTimeout(() => w.print(), 1500);
      }
    }
  };

  const handleShare = async (doc: any) => {
    if (doc.storage_path) {
      const { data } = await supabase.storage.from("uploads").createSignedUrl(doc.storage_path, 86400);
      if (data?.signedUrl) {
        await navigator.clipboard.writeText(data.signedUrl);
        toast.success("Link copiado (válido 24h)");
      }
    }
  };

  const formatSize = (bytes: number | null) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-base font-semibold">Documentos</h2>
          <p className="text-xs text-muted-foreground">Centro de documentos da frota</p>
        </div>
        <div className="flex gap-2">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {Object.entries(entityTypeLabels).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => setShowFolderDialog(true)}>
            <FolderPlus className="h-4 w-4 mr-1" /> Nova Pasta
          </Button>
          <Button size="sm" onClick={() => setUploadOpen(true)}>
            <Upload className="h-4 w-4 mr-1" /> Enviar
          </Button>
        </div>
      </div>

      {/* Breadcrumb */}
      {folderPath.length > 1 && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {folderPath.map((p, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span>/</span>}
              <button
                onClick={() => navigateToPath(i)}
                className={`hover:text-foreground transition-colors ${i === folderPath.length - 1 ? "text-foreground font-medium" : ""}`}
              >
                {i === 0 ? <Folder className="h-3 w-3 inline mr-0.5" /> : null}
                {p.name}
              </button>
            </span>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Tamanho</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Back button */}
              {parentId && (
                <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => navigateToPath(folderPath.length - 2)}>
                  <TableCell className="flex items-center gap-2" colSpan={5}>
                    <ArrowLeft className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Voltar</span>
                  </TableCell>
                </TableRow>
              )}

              {/* Folders */}
              {folders.map((d: any) => (
                <TableRow key={d.id} className="cursor-pointer hover:bg-muted/50">
                  <TableCell className="flex items-center gap-2" onClick={() => navigateTo(d)}>
                    <FolderOpen className="h-4 w-4 text-amber-500" />
                    {renamingId === d.id ? (
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <Input value={renameValue} onChange={e => setRenameValue(e.target.value)}
                          className="h-6 text-xs w-40" autoFocus onKeyDown={e => { if (e.key === "Enter") renameMutation.mutate({ id: d.id, name: renameValue }); }} />
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => renameMutation.mutate({ id: d.id, name: renameValue })}><Check className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setRenamingId(null)}><X className="h-3 w-3" /></Button>
                      </div>
                    ) : (
                      <span className="font-medium text-sm">{d.name}</span>
                    )}
                  </TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">Pasta</Badge></TableCell>
                  <TableCell className="text-xs">—</TableCell>
                  <TableCell className="text-xs">{new Date(d.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreHorizontal className="h-3.5 w-3.5" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setRenamingId(d.id); setRenameValue(d.name); }}>
                          <Pencil className="h-3.5 w-3.5 mr-2" /> Renomear
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => remove.mutate(d)}>
                          <Trash2 className="h-3.5 w-3.5 mr-2" /> Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}

              {/* Files */}
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : filtered.length === 0 && folders.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum documento</TableCell></TableRow>
              ) : filtered.map((d: any) => (
                <TableRow key={d.id}>
                  <TableCell className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    {renamingId === d.id ? (
                      <div className="flex items-center gap-1">
                        <Input value={renameValue} onChange={e => setRenameValue(e.target.value)}
                          className="h-6 text-xs w-40" autoFocus onKeyDown={e => { if (e.key === "Enter") renameMutation.mutate({ id: d.id, name: renameValue }); }} />
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => renameMutation.mutate({ id: d.id, name: renameValue })}><Check className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setRenamingId(null)}><X className="h-3 w-3" /></Button>
                      </div>
                    ) : (
                      <span className="text-sm">{d.name}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {editTypeId === d.id ? (
                      <div className="flex items-center gap-1">
                        <Select value={editTypeValue} onValueChange={v => { setEditTypeValue(v); editTypeMutation.mutate({ id: d.id, entity_type: v }); }}>
                          <SelectTrigger className="h-6 text-[10px] w-36"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(entityTypeLabels).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditTypeId(null)}><X className="h-3 w-3" /></Button>
                      </div>
                    ) : (
                      <Badge variant="outline" className="text-[10px] cursor-pointer hover:bg-muted"
                        onClick={() => { setEditTypeId(d.id); setEditTypeValue(d.entity_type || "vehicle_document"); }}>
                        {entityTypeLabels[d.entity_type] || d.entity_type}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{formatSize(d.size_bytes)}</TableCell>
                  <TableCell className="text-xs">{new Date(d.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreHorizontal className="h-3.5 w-3.5" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handlePreview(d)}>
                          <Eye className="h-3.5 w-3.5 mr-2" /> Visualizar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDownload(d)}>
                          <Download className="h-3.5 w-3.5 mr-2" /> Descarregar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handlePrint(d)}>
                          <Printer className="h-3.5 w-3.5 mr-2" /> Imprimir
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleShare(d)}>
                          <Share2 className="h-3.5 w-3.5 mr-2" /> Partilhar Link
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setRenamingId(d.id); setRenameValue(d.name); }}>
                          <Pencil className="h-3.5 w-3.5 mr-2" /> Renomear
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={async () => { setMoveDoc(d); await loadMoveFolders(); }}>
                          <Folder className="h-3.5 w-3.5 mr-2" /> Mover
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => remove.mutate(d)}>
                          <Trash2 className="h-3.5 w-3.5 mr-2" /> Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Folder Dialog */}
      <Dialog open={showFolderDialog} onOpenChange={setShowFolderDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Pasta</DialogTitle>
            <DialogDescription>Criar uma pasta para organizar documentos.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome da pasta</Label><Input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="Ex: Seguros 2025"
              onKeyDown={e => { if (e.key === "Enter" && newFolderName.trim()) createFolder.mutate(newFolderName.trim()); }} /></div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowFolderDialog(false)}>Cancelar</Button>
            <Button onClick={() => createFolder.mutate(newFolderName.trim())} disabled={!newFolderName.trim()}>Criar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Upload Dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar Documento</DialogTitle>
            <DialogDescription>Selecione o tipo e o ficheiro.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Tipo</Label>
              <Select value={uploadType} onValueChange={setUploadType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(entityTypeLabels).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Ficheiro</Label>
              <Input type="file" onChange={e => { if (e.target.files?.[0]) uploadDoc(e.target.files[0]); }} />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Move Dialog */}
      <Dialog open={!!moveDoc} onOpenChange={() => setMoveDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mover "{moveDoc?.name}"</DialogTitle>
            <DialogDescription>Selecione a pasta de destino.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            <Button variant="outline" className="w-full justify-start" onClick={() => moveMutation.mutate({ id: moveDoc?.id, targetParentId: null })}>
              <Folder className="h-4 w-4 mr-2" /> Raiz
            </Button>
            {moveFolders.filter(f => f.id !== moveDoc?.id).map(f => (
              <Button key={f.id} variant="outline" className="w-full justify-start" onClick={() => moveMutation.mutate({ id: moveDoc?.id, targetParentId: f.id })}>
                <FolderOpen className="h-4 w-4 mr-2 text-amber-500" /> {f.name}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Pré-visualização</DialogTitle>
            <DialogDescription>{previewName}</DialogDescription>
          </DialogHeader>
          {previewUrl && <iframe src={previewUrl} className="w-full h-[70vh] rounded border" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
