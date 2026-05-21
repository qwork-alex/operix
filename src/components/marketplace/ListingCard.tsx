import { Card } from "@/components/ui/card";
import { MapPin, ImageOff } from "lucide-react";
import {
  type MarketplaceListing,
  CATEGORY_META,
  STATUS_META,
  getPublicPhotoUrl,
} from "@/hooks/useMarketplace";

interface Props {
  listing: MarketplaceListing;
  onClick: () => void;
}

export function ListingCard({ listing, onClick }: Props) {
  const img = getPublicPhotoUrl(listing.cover_photo_path);
  const price =
    listing.price != null
      ? new Intl.NumberFormat("pt-PT", {
          style: "currency",
          currency: listing.currency || "EUR",
          maximumFractionDigits: 0,
        }).format(listing.price)
      : "—";

  return (
    <Card
      onClick={onClick}
      className="group cursor-pointer overflow-hidden border-border/50 bg-card/50 backdrop-blur transition-all hover:border-primary/40 hover:shadow-lg"
    >
      <div className="aspect-square w-full overflow-hidden bg-muted/40">
        {img ? (
          <img
            src={img}
            alt={listing.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <ImageOff className="h-8 w-8 opacity-40" />
          </div>
        )}
      </div>
      <div className="space-y-1 p-3">
        <div className="text-lg font-semibold leading-tight">{price}</div>
        <div className="line-clamp-2 text-sm text-foreground/90">{listing.title}</div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="truncate">
            {listing.location ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {listing.location}
              </span>
            ) : (
              CATEGORY_META[listing.category].label
            )}
          </span>
          <span className={STATUS_META[listing.status].tone}>
            {STATUS_META[listing.status].label}
          </span>
        </div>
      </div>
    </Card>
  );
}
