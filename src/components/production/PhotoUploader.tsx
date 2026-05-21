import { useState } from "react";
import { Upload, Camera, X, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProductionPhotos, PHOTO_CATEGORIES, type PhotoCategory } from "@/hooks/useProductionPhotos";

interface Props { orderId: string; fixedCategory?: PhotoCategory; hideOthers?: boolean; }

export function PhotoUploader({ orderId, fixedCategory, hideOthers }: Props) {
  const { data: allPhotos = [], upload, remove } = useProductionPhotos(orderId);
  const [category, setCategory] = useState<PhotoCategory>(fixedCategory ?? "before");
  const photos = hideOthers && fixedCategory ? allPhotos.filter(p => p.category === fixedCategory) : allPhotos;
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      await upload.mutateAsync({ file, category });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Select value={category} onValueChange={(v) => setCategory(v as PhotoCategory)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PHOTO_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <label className="flex-1">
          <input type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)} />
          <Button asChild variant="outline" className="w-full cursor-pointer">
            <span><Upload className="h-4 w-4 mr-2" /> Selecionar</span>
          </Button>
        </label>
        <label>
          <input type="file" accept="image/*" capture="environment" className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)} />
          <Button asChild variant="outline" className="cursor-pointer">
            <span><Camera className="h-4 w-4" /></span>
          </Button>
        </label>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        className={`rounded-lg border-2 border-dashed p-6 text-center text-sm text-muted-foreground transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-border"}`}
      >
        <ImageIcon className="h-6 w-6 mx-auto mb-2 opacity-50" />
        Arraste fotos aqui ou use os botões acima
      </div>

      {photos.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {photos.map(p => (
            <div key={p.id} className="group relative aspect-square rounded-lg overflow-hidden bg-muted">
              {p.signed_url ? (
                <img src={p.signed_url} alt={p.caption ?? ""} className="w-full h-full object-cover" loading="lazy" />
              ) : <div className="w-full h-full animate-pulse bg-muted" />}
              <div className="absolute top-1 left-1 text-[10px] px-1.5 py-0.5 rounded bg-background/80 backdrop-blur">
                {PHOTO_CATEGORIES.find(c => c.value === p.category)?.label}
              </div>
              <button
                onClick={() => remove.mutate(p)}
                className="absolute top-1 right-1 p-1 rounded bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
