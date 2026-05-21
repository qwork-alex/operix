import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Pencil, Trash2, ImageOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  type MarketplaceListing, CATEGORY_META, CONDITION_META, STATUS_META, VISIBILITY_META,
  useMarketplacePhotos, useMarketplaceMutations, getPublicPhotoUrl,
} from "@/hooks/useMarketplace";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { ListingFormDialog } from "./ListingFormDialog";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  listing: MarketplaceListing | null;
}

export function ListingDetailDialog({ open, onOpenChange, listing }: Props) {
  const { user } = useAuth();
  const { data: photos = [] } = useMarketplacePhotos(listing?.id);
  const { deleteListing } = useMarketplaceMutations();
  const [active, setActive] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  if (!listing) return null;
  const canEdit = user?.id === listing.created_by;
  const price = listing.price != null
    ? new Intl.NumberFormat("pt-PT", { style: "currency", currency: listing.currency || "EUR" }).format(listing.price)
    : "Sob consulta";

  const photo = photos[active];
  const photoUrl = photo ? getPublicPhotoUrl(photo.storage_path) : getPublicPhotoUrl(listing.cover_photo_path);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="pr-8">{listing.title}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="aspect-video w-full overflow-hidden rounded-lg bg-muted/40">
              {photoUrl ? (
                <img src={photoUrl} alt={listing.title} className="h-full w-full object-contain" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <ImageOff className="h-10 w-10 opacity-40" />
                </div>
              )}
            </div>
            {photos.length > 1 && (
              <div className="flex gap-2 overflow-x-auto">
                {photos.map((p, i) => (
                  <button key={p.id} onClick={() => setActive(i)}
                    className={`h-16 w-16 shrink-0 overflow-hidden rounded border-2 ${i === active ? "border-primary" : "border-transparent"}`}>
                    <img src={getPublicPhotoUrl(p.storage_path)!} className="h-full w-full object-cover" alt="" />
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <div className="text-2xl font-bold">{price}</div>
              <Badge variant="outline">{CATEGORY_META[listing.category].label}</Badge>
              {listing.condition && <Badge variant="secondary">{CONDITION_META[listing.condition].label}</Badge>}
              <Badge variant="outline">{VISIBILITY_META[listing.visibility].label}</Badge>
              <span className={`text-xs ${STATUS_META[listing.status].tone}`}>
                {STATUS_META[listing.status].label}
              </span>
            </div>

            {listing.location && (
              <div className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" /> {listing.location}
              </div>
            )}

            {listing.description && (
              <p className="whitespace-pre-wrap text-sm text-foreground/90">{listing.description}</p>
            )}

            <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              {listing.manufacturer && <div><dt className="text-xs text-muted-foreground">Fabricante</dt><dd>{listing.manufacturer}</dd></div>}
              {listing.model && <div><dt className="text-xs text-muted-foreground">Modelo</dt><dd>{listing.model}</dd></div>}
              {listing.year && <div><dt className="text-xs text-muted-foreground">Ano</dt><dd>{listing.year}</dd></div>}
            </dl>
          </div>

          <DialogFooter className="gap-2">
            {canEdit && (
              <>
                <Button variant="outline" onClick={() => setConfirmDel(true)}>
                  <Trash2 className="mr-1 h-4 w-4" /> Remover
                </Button>
                <Button variant="outline" onClick={() => setEditOpen(true)}>
                  <Pencil className="mr-1 h-4 w-4" /> Editar
                </Button>
              </>
            )}
            <Button onClick={() => onOpenChange(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ListingFormDialog open={editOpen} onOpenChange={setEditOpen} listing={listing} />
      <ConfirmDialog
        open={confirmDel}
        onOpenChange={setConfirmDel}
        title="Remover anúncio?"
        description="Esta ação não pode ser desfeita."
        confirmLabel="Remover"
        variant="destructive"
        onConfirm={async () => {
          await deleteListing.mutateAsync(listing.id);
          setConfirmDel(false);
          onOpenChange(false);
        }}
      />
    </>
  );
}
