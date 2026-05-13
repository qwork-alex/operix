import { useMemo, useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import {
  Receipt, CreditCard, GitMerge, CalendarClock, Building2, BarChart3,
  Search, Plus, Filter, Download, MoreHorizontal, Eye, Pencil, Trash2,
  ChevronRight, ChevronLeft, Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import InvoicesScreen from "@/components/billing/InvoicesScreen";

// ─────────────────────────────────────────────────────────────
// Sub-nav definition
// ─────────────────────────────────────────────────────────────
const SUB_NAV = [
  { slug: "faturas",         label: "Faturas",          icon: Receipt },
  { slug: "pagamentos",      label: "Pagamentos",       icon: CreditCard },
  { slug: "conciliacao",     label: "Conciliação",      icon: GitMerge },
  { slug: "contas-a-vencer", label: "Contas a vencer",  icon: CalendarClock },
  { slug: "fornecedores",    label: "Fornecedores",     icon: Building2 },
  { slug: "relatorios",      label: "Relatórios",       icon: BarChart3 },
] as const;

type Slug = typeof SUB_NAV[number]["slug"];

// ─────────────────────────────────────────────────────────────
// Mock dataset (placeholder — substituível por dados reais)
// ─────────────────────────────────────────────────────────────
type Row = {
  id: string;
  ref: string;
  party: string;
  date: string;
  due?: string;
  amount: number;
  status: "pago" | "pendente" | "atrasado" | "conciliado" | "ativo";
};

const seed = (prefix: string, n: number, opts: Partial<Row> = {}): Row[] =>
  Array.from({ length: n }, (_, i) => {
    const idx = i + 1;
    const statuses: Row["status"][] = ["pago", "pendente", "atrasado", "conciliado", "ativo"];
    const status = opts.status ?? statuses[idx % statuses.length];
    const date = new Date(2025, (idx * 3) % 12, ((idx * 7) % 27) + 1);
    const due = new Date(date);
    due.setDate(due.getDate() + 15);
    return {
      id: `${prefix}-${idx}`,
      ref: `${prefix}-${String(2000 + idx).padStart(5, "0")}`,
      party: ["Acme S.A.", "Globex", "Initech", "Umbrella", "Stark Ind.", "Wayne Co."][idx % 6],
      date: date.toISOString().slice(0, 10),
      due: due.toISOString().slice(0, 10),
      amount: Math.round((idx * 137.42 + 250) * 100) / 100,
      status,
    };
  });

const DATASETS: Record<Slug, Row[]> = {
  "faturas":         seed("FAT", 38),
  "pagamentos":      seed("PAG", 24),
  "conciliacao":     seed("CON", 18),
  "contas-a-vencer": seed("VEN", 22),
  "fornecedores":    seed("FRN", 14, { status: "ativo" }),
  "relatorios":      seed("REL", 9),
};

const TITLES: Record<Slug, { title: string; subtitle: string; primaryLabel: string }> = {
  "faturas":         { title: "Faturas",          subtitle: "Gestão de faturas emitidas e recebidas", primaryLabel: "Nova fatura" },
  "pagamentos":      { title: "Pagamentos",       subtitle: "Histórico e processamento de pagamentos", primaryLabel: "Registrar pagamento" },
  "conciliacao":     { title: "Conciliação",      subtitle: "Cruzamento entre faturas e pagamentos",   primaryLabel: "Nova conciliação" },
  "contas-a-vencer": { title: "Contas a vencer",  subtitle: "Faturas em aberto com vencimento próximo", primaryLabel: "Adicionar conta" },
  "fornecedores":    { title: "Fornecedores",     subtitle: "Cadastro e gestão de fornecedores",         primaryLabel: "Novo fornecedor" },
  "relatorios":      { title: "Relatórios",       subtitle: "Exportação e análise de faturamento",       primaryLabel: "Gerar relatório" },
};

// ─────────────────────────────────────────────────────────────
// Status badge
// ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: Row["status"] }) {
  const map: Record<Row["status"], string> = {
    pago:       "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    conciliado: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    pendente:   "bg-amber-500/10 text-amber-400 border-amber-500/30",
    atrasado:   "bg-destructive/10 text-destructive border-destructive/30",
    ativo:      "bg-primary/10 text-primary border-primary/30",
  };
  return (
    <Badge variant="outline" className={cn("text-[10px] capitalize", map[status])}>
      {status}
    </Badge>
  );
}

// ─────────────────────────────────────────────────────────────
// Reusable sub-page
// ─────────────────────────────────────────────────────────────
function SubPage({ slug }: { slug: Slug }) {
  const meta = TITLES[slug];
  const data = DATASETS[slug];

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const pageSize = 8;

  const filtered = useMemo(() => {
    return data.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!search) return true;
      const s = search.toLowerCase();
      return [r.ref, r.party].some((v) => v.toLowerCase().includes(s));
    });
  }, [data, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = page > totalPages ? 1 : page;
  const pageData = filtered.slice((current - 1) * pageSize, current * pageSize);

  const totalAmount = filtered.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Breadcrumbs */}
      <Breadcrumb>
        <BreadcrumbList className="text-xs">
          <BreadcrumbItem>
            <BreadcrumbLink href="/billing/faturas">Faturamento</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{meta.title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground tracking-tight">{meta.title}</h1>
          <p className="text-xs text-muted-foreground mt-1">{meta.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8">
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Exportar
          </Button>
          <Button size="sm" className="h-8">
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            {meta.primaryLabel}
          </Button>
        </div>
      </div>

      {/* KPI band */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-border/50">
          <CardContent className="pt-4 pb-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</p>
            <p className="text-lg font-semibold tabular-nums">{filtered.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pt-4 pb-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Montante</p>
            <p className="text-lg font-semibold text-primary tabular-nums">€ {totalAmount.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pt-4 pb-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Pendentes</p>
            <p className="text-lg font-semibold text-amber-400 tabular-nums">
              {filtered.filter((r) => r.status === "pendente").length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pt-4 pb-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Atrasadas</p>
            <p className="text-lg font-semibold text-destructive tabular-nums">
              {filtered.filter((r) => r.status === "atrasado").length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="border-border/50">
        <CardContent className="pt-4 pb-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Pesquisar por referência ou contraparte..."
              className="h-8 pl-8 text-xs"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <Filter className="h-3 w-3 mr-1.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os estados</SelectItem>
              <SelectItem value="pago">Pago</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="atrasado">Atrasado</SelectItem>
              <SelectItem value="conciliado">Conciliado</SelectItem>
              <SelectItem value="ativo">Ativo</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border-border/50 overflow-hidden">
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="text-[10px] uppercase tracking-wider">
                <TableHead className="w-[140px]">Referência</TableHead>
                <TableHead>Contraparte</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead className="text-right">Montante</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-[60px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-xs text-muted-foreground">
                    Nenhum registro encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                pageData.map((r) => (
                  <TableRow key={r.id} className="text-xs animate-fade-in">
                    <TableCell className="font-mono text-[11px] text-primary">{r.ref}</TableCell>
                    <TableCell className="font-medium">{r.party}</TableCell>
                    <TableCell className="text-muted-foreground">{r.date}</TableCell>
                    <TableCell className="text-muted-foreground">{r.due ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">€ {r.amount.toFixed(2)}</TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="text-xs">
                          <DropdownMenuItem><Eye className="h-3.5 w-3.5 mr-2" />Ver</DropdownMenuItem>
                          <DropdownMenuItem><Pencil className="h-3.5 w-3.5 mr-2" />Editar</DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive">
                            <Trash2 className="h-3.5 w-3.5 mr-2" />Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-border/50 px-4 py-2.5 text-xs text-muted-foreground">
          <span>
            Página {current} de {totalPages} · {filtered.length} registros
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline" size="sm" className="h-7 px-2"
              disabled={current <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline" size="sm" className="h-7 px-2"
              disabled={current >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Layout with sub-nav
// ─────────────────────────────────────────────────────────────
function BillingLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 overflow-x-auto rounded-lg border border-border/50 bg-card/40 backdrop-blur-sm p-1">
        {SUB_NAV.map((item) => {
          const to = `/billing/${item.slug}`;
          const active = pathname.startsWith(to);
          const Icon = item.icon;
          return (
            <NavLink
              key={item.slug}
              to={to}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all",
                active
                  ? "bg-primary/15 text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </NavLink>
          );
        })}
      </div>
      <div>{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Public route component
// ─────────────────────────────────────────────────────────────
export default function BillingPage() {
  return (
    <BillingLayout>
      <Routes>
        <Route index element={<Navigate to="faturas" replace />} />
        {SUB_NAV.map((item) => (
          <Route
            key={item.slug}
            path={item.slug}
            element={<SubPage slug={item.slug} />}
          />
        ))}
        <Route path="*" element={<Navigate to="faturas" replace />} />
      </Routes>
    </BillingLayout>
  );
}
