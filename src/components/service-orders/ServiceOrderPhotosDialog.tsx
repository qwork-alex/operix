import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileUploadZone } from "@/components/service-orders/FileUploadZone";
import { useLanguage } from "@/hooks/useLanguage";
import { useServiceOrderPhotos, type ServiceOrderPhotoCategory } from "@/hooks/useServiceOrderPhotos";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

type Props = {
  open: boolean;
  serviceOrderId: string | null;
  onOpenChange: (open: boolean) => void;
};

const CATEGORY_LABEL: Record<ServiceOrderPhotoCategory, string> = {
  before: "ANTES DO REPARO",
  during: "DURANTE",
  after: "DEPOIS DO REPARO",
};

function categoryFromPhoto(photo: any): ServiceOrderPhotoCategory | null {
  const raw = photo?.visual_state?.category;
  if (raw === "before" || raw === "during" || raw === "after") return raw;
  return null;
}

export function ServiceOrderPhotosDialog({ open, serviceOrderId, onOpenChange }: Props) {
  const { t } = useLanguage();
  const { data: photos = [], isLoading, upload, remove } = useServiceOrderPhotos(serviceOrderId);

  const uploadFor = (category: ServiceOrderPhotoCategory) => (files: File[]) => {
    if (!serviceOrderId) return;
    void (async () => {
      for (const f of files) {
        try {
          await upload.mutateAsync({ file: f, category });
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Falha no upload.");
          throw e;
        }
      }
      toast.success("Fotos enviadas");
    })();
  };

  const renderCategory = (category: ServiceOrderPhotoCategory) => {
    const list = photos.filter((p) => categoryFromPhoto(p) === category);
    return (
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h4 className="text-sm font-semibold truncate">{CATEGORY_LABEL[category]}</h4>
            <p className="text-xs text-muted-foreground">
              {t("upload.dropOrClick", "Solte arquivos aqui ou clique para enviar")}
            </p>
          </div>
          <Badge variant="outline" className="shrink-0">
            {list.length}
          </Badge>
        </div>

        <FileUploadZone onFilesSelected={uploadFor(category)} isProcessing={upload.isPending} compact />

        {isLoading ? (
          <div className="text-xs text-muted-foreground">A carregar…</div>
        ) : list.length === 0 ? (
          <div className="text-xs text-muted-foreground">Sem fotos</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {list.map((p) => (
              <div key={p.id} className="rounded-lg border border-border/50 overflow-hidden bg-card">
                <div className="aspect-video bg-muted flex items-center justify-center">
                  {p.signed_url ? (
                    <img src={p.signed_url} alt={p.display_name ?? p.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs text-muted-foreground">Sem preview</span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 p-2">
                  <div className="min-w-0">
                    <div className="text-[11px] truncate">{p.display_name ?? p.name}</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => remove.mutate(p as any)}
                    disabled={remove.isPending}
                    aria-label="Remover foto"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Fotos da Ordem de Serviço</DialogTitle>
        </DialogHeader>

        {!serviceOrderId ? (
          <div className="text-sm text-muted-foreground">Selecione uma ordem para gerir fotos.</div>
        ) : (
          <div className="space-y-6">
            {renderCategory("before")}
            <div className="h-px bg-border/60" />
            {renderCategory("during")}
            <div className="h-px bg-border/60" />
            {renderCategory("after")}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

