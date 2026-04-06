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
import { Upload, Eye, Download, Printer, Trash2, FileText, Loader2 } from "lucide-react";

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

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["fleet_documents"],
    queryFn: async () => {
      let q = supabase.from("documents").select("*")
        .in("entity_type", ["vehicle_document", "driver_document", "fuel_receipt", "report"])
        .order("created_at", { ascending: false });
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const filtered = typeFilter === "all" ? docs : docs.filter(d => d.entity_type === typeFilter);

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
    });
    if (error) toast.error(error.message);
    else {
      qc.invalidateQueries({ queryKey: ["fleet_documents"] });
      toast.success("Documento enviado");
      setUploadOpen(false);
    }
  };

  const remove = useMutation({
    mutationFn: async (doc: any) => {
      if (doc.storage_path) await supabase.storage.from("uploads").remove([doc.storage_path]);
      const { error } = await supabase.from("documents").delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fleet_documents"] }); toast.success("Removido"); },
  });

  const handlePreview = async (doc: any) => {
    if (doc.storage_path) {
      const { data } = await supabase.storage.from("uploads").createSignedUrl(doc.storage_path, 300);
      if (data?.signedUrl) setPreviewUrl(data.signedUrl);
    }
  };

  const handleDownload = async (doc: any) => {
    if (doc.storage_path) {
      const { data } = await supabase.storage.from("uploads").createSignedUrl(doc.storage_path, 300);
      if (data?.signedUrl) { const a = document.createElement("a"); a.href = data.signedUrl; a.download = doc.name; a.click(); }
    }
  };

  const handlePrint = async (doc: any) => {
    if (doc.storage_path) {
      const { data } = await supabase.storage.from("uploads").createSignedUrl(doc.storage_path, 300);
      if (data?.signedUrl) { const w = window.open(data.signedUrl, "_blank"); w?.addEventListener("load", () => w.print()); }
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
          <Button size="sm" onClick={() => setUploadOpen(true)}>
            <Upload className="h-4 w-4 mr-1" /> Enviar
          </Button>
        </div>
      </div>

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
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum documento</TableCell></TableRow>
              ) : filtered.map((d: any) => (
                <TableRow key={d.id}>
                  <TableCell className="flex items-center gap-2"><FileText className="h-4 w-4 text-muted-foreground" />{d.name}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">{entityTypeLabels[d.entity_type] || d.entity_type}</Badge></TableCell>
                  <TableCell className="text-xs">{formatSize(d.size_bytes)}</TableCell>
                  <TableCell className="text-xs">{new Date(d.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button variant="ghost" size="icon" onClick={() => handlePreview(d)}><Eye className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDownload(d)}><Download className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handlePrint(d)}><Printer className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => remove.mutate(d)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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

      {/* Preview Dialog */}
      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Pré-visualização</DialogTitle>
            <DialogDescription>Documento</DialogDescription>
          </DialogHeader>
          {previewUrl && <iframe src={previewUrl} className="w-full h-[70vh] rounded border" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
