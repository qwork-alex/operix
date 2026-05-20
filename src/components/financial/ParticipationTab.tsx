import { useMemo, useState } from "react";
import { useParticipationSummary, useParticipationDetail, ParticipationSummaryRow } from "@/hooks/useParticipationLedger";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Users } from "lucide-react";

const TYPE_COLORS: Record<string, string> = {
  technician: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  partner: "bg-green-500/10 text-green-400 border-green-500/30",
  company: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  shareholder: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  collaborator: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
  other: "bg-muted text-muted-foreground border-border",
};

function fmt(n: number) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n || 0);
}

export default function ParticipationTab() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ParticipationSummaryRow | null>(null);

  const { data: rows = [], isLoading } = useParticipationSummary(year);
  const { data: detail = [] } = useParticipationDetail(selected?.participant_name ?? null, year);

  const years = useMemo(() => {
    const set = new Set<number>([currentYear]);
    rows.forEach(r => { if (r.year_reference) set.add(r.year_reference); });
    return Array.from(set).sort((a, b) => b - a);
  }, [rows, currentYear]);

  const filtered = useMemo(() => {
    return rows
      .filter(r => typeFilter === "all" || r.participant_type === typeFilter)
      .filter(r => !search.trim() || r.participant_name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.expected - a.expected);
  }, [rows, typeFilter, search]);

  const totals = useMemo(() => filtered.reduce(
    (acc, r) => ({
      expected: acc.expected + Number(r.expected || 0),
      received: acc.received + Number(r.received || 0),
      pending:  acc.pending  + Number(r.pending  || 0),
    }),
    { expected: 0, received: 0, pending: 0 }
  ), [filtered]);

  return (
    <div className="space-y-4">
      <Card className="bg-card/40 border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-primary" /> Participation
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger className="w-[110px] h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[160px] h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  <SelectItem value="partner">Sócio (Partner)</SelectItem>
                  <SelectItem value="company">Empresa</SelectItem>
                  <SelectItem value="technician">Técnico</SelectItem>
                  <SelectItem value="shareholder">Acionista</SelectItem>
                  <SelectItem value="collaborator">Colaborador</SelectItem>
                  <SelectItem value="other">Outro</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="Buscar participante..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-[200px] h-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <Card className="bg-muted/30 border-border/50">
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground">Esperado total</div>
                <div className="text-lg font-semibold">{fmt(totals.expected)}</div>
              </CardContent>
            </Card>
            <Card className="bg-muted/30 border-border/50">
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground">Recebido total</div>
                <div className="text-lg font-semibold text-emerald-400">{fmt(totals.received)}</div>
              </CardContent>
            </Card>
            <Card className="bg-muted/30 border-border/50">
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground">Pendente total</div>
                <div className="text-lg font-semibold text-amber-400">{fmt(totals.pending)}</div>
              </CardContent>
            </Card>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              Nenhum participante encontrado para os filtros selecionados.
            </div>
          ) : (
            <div className="rounded-md border border-border/50 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Participante</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Esperado</TableHead>
                    <TableHead className="text-right">Recebido</TableHead>
                    <TableHead className="text-right">Pendente</TableHead>
                    <TableHead className="text-center">Status (P/Par/Pag)</TableHead>
                    <TableHead className="text-center">OS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r, i) => (
                    <TableRow
                      key={`${r.participant_name}-${r.participant_type}-${i}`}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => setSelected(r)}
                    >
                      <TableCell className="font-medium">{r.participant_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={TYPE_COLORS[r.participant_type] ?? TYPE_COLORS.other}>
                          {r.participant_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{fmt(Number(r.expected))}</TableCell>
                      <TableCell className="text-right text-emerald-400">{fmt(Number(r.received))}</TableCell>
                      <TableCell className="text-right text-amber-400">{fmt(Number(r.pending))}</TableCell>
                      <TableCell className="text-center text-xs text-muted-foreground">
                        {r.pending_count}/{r.partial_count}/{r.paid_count}
                      </TableCell>
                      <TableCell className="text-center">{r.os_count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {selected?.participant_name}{" "}
              <Badge variant="outline" className={TYPE_COLORS[selected?.participant_type ?? "other"]}>
                {selected?.participant_type}
              </Badge>
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            <div className="text-xs text-muted-foreground">
              {detail.length} ordens de serviço · ano {year}
            </div>
            <div className="rounded-md border border-border/50">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>OS</TableHead>
                    <TableHead className="text-right">%</TableHead>
                    <TableHead className="text-right">Esperado</TableHead>
                    <TableHead className="text-right">Recebido</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-mono text-xs">
                        {d.service_order_id.slice(0, 8)}
                      </TableCell>
                      <TableCell className="text-right">{Number(d.percentage).toFixed(1)}%</TableCell>
                      <TableCell className="text-right">{fmt(Number(d.expected_amount))}</TableCell>
                      <TableCell className="text-right text-emerald-400">{fmt(Number(d.received_amount))}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className={
                          d.status === "paid" ? "text-emerald-400 border-emerald-500/30" :
                          d.status === "partial" ? "text-amber-400 border-amber-500/30" :
                          "text-muted-foreground"
                        }>
                          {d.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
