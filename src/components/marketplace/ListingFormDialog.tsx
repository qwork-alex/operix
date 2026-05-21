import { useEffect, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Camera, ImagePlus, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  CATEGORY_META, CONDITION_META, VISIBILITY_META, STATUS_META,
  type MarketplaceListing, type MarketplaceCategory, type MarketplaceCondition,
  type MarketplaceVisibility, type MarketplaceStatus,
  useMarketplaceMutations, useMarketplacePhotos, getPublicPhotoUrl,
} from "@/hooks/useMarketplace";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  listing?: MarketplaceListing | null;
}

type Draft = {
  title: string;
  description: string;
  price: string;
  category: MarketplaceCategory;
  condition: MarketplaceCondition | "";
  location: string;
  manufacturer: string;
  model: string;
  year: string;
  visibility: MarketplaceVisibility;
  status: MarketplaceStatus;
};

const EMPTY: Draft = {
  title: "", description: "", price: "",
  category: "other", condition: "",
  location: "", manufacturer: "", model: "", year: "",
  visibility: "workspace", status: "draft",
};

export function ListingFormDialog({ open, onOpenChange, listing }: Props) {
  const { upsertListing, uploadPhoto, deletePhoto } = useMarketplaceMutations();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [currentId, setCurrentId] = useState<string | null>(listing?.id ?? null);
  const { data: photos = [] } = useMarketplacePhotos(currentId);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setCurrentId(listing?.id ?? null);
      setDraft(listing
        ? {
            title: listing.title ?? "",
            description: listing.description ?? "",
            price: listing.price != null ? String(listing.price) : "",
            category: listing.category,
            condition: (listing.condition ?? "") as any,
            location: listing.location ?? "",
            manufacturer: listing.manufacturer ?? "",
            model: listing.model ?? "",
            year: listing.year != null ? String(listing.year) : "",
            visibility: listing.visibility,
            status: listing.status,
          }
        : EMPTY);
    }
  }, [open, listing]);

  const update = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const save = async (publish = false) => {
    if (!draft.title.trim()) { toast.error("Título obrigatório"); return; }
    const payload: any = {
      id: currentId ?? undefined,
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      price: draft.price ? Number(draft.price) : null,
      category: draft.category,
      condition: draft.condition || null,
      location: draft.location.trim() || null,
      manufacturer: draft.manufacturer.trim() || null,
      model: draft.model.trim() || null,
      year: draft.year ? Number(draft.year) : null,
      visibility: draft.visibility,
      status: publish ? "active" : draft.status,
      published_at: publish && draft.status !== "active" ? new Date().toISOString() : undefined,
    };
    try {
      const saved = await upsertListing.mutateAsync(payload);
      setCurrentId(saved.id);
      toast.success(publish ? "Anúncio publicado" : "Rascunho salvo");
      if (publish) onOpenChange(false);
    } catch (e) {
      // toast handled in hook
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    let id = currentId;
    if (!id) {
      // Auto-create draft to attach photos
      try {
        const saved = await upsertListing.mutateAsync({
          title: draft.title.trim() || "Sem título",
          category: draft.category,
          visibility: draft.visibility,
          status: "draft",
        } as any);
        id = saved.id;
        setCurrentId(id);
      } catch { return; }
    }
    const startIdx = photos.length;
    for (let i = 0; i < files.length; i++) {
      await uploadPhoto.mutateAsync({ listingId: id!, file: files[i], orderIndex: startIdx + i });
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{currentId ? "Editar anúncio" : "Novo anúncio"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          {/* Photos */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            className="rounded-lg border border-dashed border-border/60 bg-muted/20 p-3"
          >
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Fotos ({photos.length})
              </Label>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm"
                  onClick={() => cameraRef.current?.click()}>
                  <Camera className="mr-1 h-4 w-4" /> Câmera
                </Button>
                <Button type="button" variant="outline" size="sm"
                  onClick={() => galleryRef.current?.click()}>
                  <ImagePlus className="mr-1 h-4 w-4" /> Galeria
                </Button>
              </div>
            </div>
            <input ref={galleryRef} type="file" accept="image/*" multiple hidden
              onChange={(e) => handleFiles(e.target.files)} />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden
              onChange={(e) => handleFiles(e.target.files)} />

            {photos.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                Arraste fotos aqui ou use os botões acima.
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {photos.map((p) => {
                  const url = getPublicPhotoUrl(p.storage_path);
                  return (
                    <div key={p.id} className="relative aspect-square overflow-hidden rounded-md border border-border/40 bg-muted">
                      {url && <img src={url} className="h-full w-full object-cover" alt="" />}
                      <button
                        type="button"
                        onClick={() => deletePhoto.mutate(p)}
                        className="absolute right-1 top-1 rounded-full bg-background/90 p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground"
                        aria-label="Remover"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            {uploadPhoto.isPending && (
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Enviando…
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Título *</Label>
              <Input value={draft.title} onChange={(e) => update("title", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label>Descrição</Label>
              <Textarea rows={3} value={draft.description} onChange={(e) => update("description", e.target.value)} />
            </div>
            <div>
              <Label>Preço (€)</Label>
              <Input type="number" inputMode="decimal" value={draft.price}
                onChange={(e) => update("price", e.target.value)} />
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={draft.category} onValueChange={(v) => update("category", v as MarketplaceCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_META).map(([k, m]) =>
                    <SelectItem key={k} value={k}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Condição</Label>
              <Select value={draft.condition || "none"}
                onValueChange={(v) => update("condition", (v === "none" ? "" : v) as any)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {Object.entries(CONDITION_META).map(([k, m]) =>
                    <SelectItem key={k} value={k}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Localização</Label>
              <Input value={draft.location} onChange={(e) => update("location", e.target.value)} />
            </div>
            <div>
              <Label>Fabricante</Label>
              <Input value={draft.manufacturer} onChange={(e) => update("manufacturer", e.target.value)} />
            </div>
            <div>
              <Label>Modelo</Label>
              <Input value={draft.model} onChange={(e) => update("model", e.target.value)} />
            </div>
            <div>
              <Label>Ano</Label>
              <Input type="number" value={draft.year} onChange={(e) => update("year", e.target.value)} />
            </div>
            <div>
              <Label>Visibilidade</Label>
              <Select value={draft.visibility} onValueChange={(v) => update("visibility", v as MarketplaceVisibility)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(VISIBILITY_META).map(([k, m]) =>
                    <SelectItem key={k} value={k}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Estado</Label>
              <Select value={draft.status} onValueChange={(v) => update("status", v as MarketplaceStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_META).map(([k, m]) =>
                    <SelectItem key={k} value={k}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button variant="outline" onClick={() => save(false)} disabled={upsertListing.isPending}>
            {upsertListing.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Salvar rascunho
          </Button>
          <Button onClick={() => save(true)} disabled={upsertListing.isPending}>
            Publicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
