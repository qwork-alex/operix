import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Store, Loader2 } from "lucide-react";
import {
  useMarketplaceListings, CATEGORY_META,
  type MarketplaceCategory, type MarketplaceListing,
} from "@/hooks/useMarketplace";
import { ListingCard } from "@/components/marketplace/ListingCard";
import { ListingFormDialog } from "@/components/marketplace/ListingFormDialog";
import { ListingDetailDialog } from "@/components/marketplace/ListingDetailDialog";
import { PageHeader } from "@/components/shared/PageHeader";
import { useLanguage } from "@/hooks/useLanguage";

type CatFilter = MarketplaceCategory | "all";

export default function MarketplacePage() {
  const { t } = useLanguage();
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [category, setCategory] = useState<CatFilter>("all");
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [detail, setDetail] = useState<MarketplaceListing | null>(null);

  const { data: listings = [], isLoading } = useMarketplaceListings({ scope, category, search });

  const cats = useMemo(
    () => [[ "all", t("label.allCategories", "Todos") ] as const, ...Object.entries(CATEGORY_META).map(([k, m]) => [k, m.label] as const)],
    [t],
  );

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title={t("nav.marketplace", "Mercado")}
        subtitle={t("marketplace.subtitle", "Anuncie e descubra veículos, peças, serviços e equipamentos.")}
        icon={Store}
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> {t("marketplace.newListing", "Novo anúncio")}
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={scope} onValueChange={(v) => setScope(v as any)}>
          <TabsList>
            <TabsTrigger value="all">{t("marketplace.discover", "Descobrir")}</TabsTrigger>
            <TabsTrigger value="mine">{t("marketplace.mine", "Meus anúncios")}</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("action.search", "Pesquisar…")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {cats.map(([k, label]) => (
          <Button
            key={k}
            size="sm"
            variant={category === k ? "default" : "outline"}
            onClick={() => setCategory(k as CatFilter)}
          >
            {label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> {t("common.loading", "A carregar…")}
        </div>
      ) : listings.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 bg-muted/10 p-12 text-center">
          <Store className="mx-auto mb-3 h-10 w-10 text-muted-foreground/60" />
          <h3 className="text-lg font-semibold">{t("marketplace.emptyTitle", "Nenhum anúncio encontrado")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {scope === "mine"
              ? t("marketplace.emptyMine", "Publique seu primeiro anúncio.")
              : t("marketplace.emptyAll", "Tente alterar os filtros ou voltar mais tarde.")}
          </p>
          {scope === "mine" && (
            <Button className="mt-4" onClick={() => setFormOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> {t("marketplace.newListing", "Novo anúncio")}
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {listings.map((l) => (
            <ListingCard key={l.id} listing={l} onClick={() => setDetail(l)} />
          ))}
        </div>
      )}

      <ListingFormDialog open={formOpen} onOpenChange={setFormOpen} />
      <ListingDetailDialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)} listing={detail} />
    </div>
  );
}
