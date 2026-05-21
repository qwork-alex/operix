import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import {
  Brain, Sparkles, AlertTriangle, TrendingUp, Gauge, Fuel, Wallet,
  CheckCircle2, XCircle, Clock, Info, ShieldAlert, Activity, Loader2,
} from "lucide-react";
import {
  useAIInference, useAIRecommendations, useAIInsights, useAIAlerts,
  useAIScores, useAIActionLog, useAIAction, type AITask,
} from "@/hooks/useAIOrchestrator";

const TASKS: { key: AITask; label: string; icon: any; group: "ops" | "score" | "risk" | "finance" }[] = [
  { key: "interpret_os",          label: "Interpretar OS",          icon: Brain,        group: "ops" },
  { key: "suggest_assignment",    label: "Sugerir atribuição",      icon: Sparkles,     group: "ops" },
  { key: "detect_bottlenecks",    label: "Detetar gargalos",        icon: Activity,     group: "ops" },
  { key: "predict_delay",         label: "Prever atrasos",          icon: Clock,        group: "ops" },
  { key: "productivity",          label: "Análise produtividade",   icon: TrendingUp,   group: "ops" },
  { key: "costs",                 label: "Análise de custos",       icon: Wallet,       group: "finance" },
  { key: "fuel",                  label: "Análise combustível",     icon: Fuel,         group: "ops" },
  { key: "financial_behavior",    label: "Comportamento financeiro",icon: Gauge,        group: "finance" },
  { key: "fraud_score",           label: "Risco de fraude",         icon: ShieldAlert,  group: "risk" },
  { key: "score_technician",      label: "Score técnicos",          icon: Gauge,        group: "score" },
  { key: "score_fleet",           label: "Score frota",             icon: Gauge,        group: "score" },
  { key: "score_productivity",    label: "Score produtividade",     icon: Gauge,        group: "score" },
  { key: "score_financial_risk",  label: "Score risco financeiro",  icon: Gauge,        group: "score" },
];

function ConfidenceBadge({ value }: { value?: number | null }) {
  if (value == null) return null;
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const variant = pct >= 75 ? "default" : pct >= 50 ? "secondary" : "outline";
  return <Badge variant={variant as any} className="font-mono">{pct}%</Badge>;
}

function SeverityBadge({ s }: { s?: string }) {
  const map: Record<string, string> = {
    info: "bg-blue-500/10 text-blue-500 border-blue-500/30",
    warn: "bg-amber-500/10 text-amber-500 border-amber-500/30",
    critical: "bg-red-500/10 text-red-500 border-red-500/30",
  };
  return <Badge variant="outline" className={map[s ?? "info"]}>{s ?? "info"}</Badge>;
}

function ReasoningTip({ reasoning }: { reasoning?: any }) {
  if (!reasoning) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size="icon" variant="ghost" className="h-6 w-6"><Info className="h-3.5 w-3.5" /></Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm">
        <div className="space-y-1 text-xs">
          {reasoning.why && <div><span className="font-semibold">Porquê:</span> {reasoning.why}</div>}
          {reasoning.contexto && <div><span className="font-semibold">Contexto:</span> {reasoning.contexto}</div>}
          {Array.isArray(reasoning.origem) && reasoning.origem.length > 0 && (
            <div><span className="font-semibold">Origem:</span> {reasoning.origem.join(", ")}</div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export default function AIPage() {
  const inference = useAIInference();
  const action = useAIAction();
  const reco = useAIRecommendations();
  const insights = useAIInsights();
  const alerts = useAIAlerts();
  const scores = useAIScores();
  const log = useAIActionLog();
  const [lastTask, setLastTask] = useState<AITask | null>(null);

  const runningTask = inference.isPending ? lastTask : null;

  const grouped = useMemo(() => {
    const g = { ops: [] as typeof TASKS, finance: [] as typeof TASKS, risk: [] as typeof TASKS, score: [] as typeof TASKS };
    TASKS.forEach((t) => g[t.group].push(t));
    return g;
  }, []);

  const run = (task: AITask) => {
    setLastTask(task);
    inference.mutate({ task });
  };

  const timeline = useMemo(() => {
    const all = [
      ...(reco.data ?? []).map((r) => ({ ...r, _type: "recommendation" as const })),
      ...(insights.data ?? []).map((r) => ({ ...r, _type: "insight" as const })),
      ...(alerts.data ?? []).map((r) => ({ ...r, _type: "alert" as const })),
      ...(scores.data ?? []).map((r) => ({ ...r, _type: "score" as const })),
    ];
    return all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 80);
  }, [reco.data, insights.data, alerts.data, scores.data]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl tracking-tight flex items-center gap-2">
            <Brain className="h-7 w-7 text-primary" />
            QWork AI
          </h1>
          <p className="text-sm text-muted-foreground">
            Camada de inferência operacional. Toda recomendação é explicável (porquê, origem, contexto, confiança) e isolada por workspace.
          </p>
        </div>
        {inference.isPending && (
          <Badge variant="outline" className="gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Inferindo…</Badge>
        )}
      </div>

      {/* Action grid */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Orquestrador IA</CardTitle>
          <CardDescription>Executa inferência sob demanda. Resultado é cacheado por 1h por workspace+contexto.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(["ops", "finance", "risk", "score"] as const).map((grp) => (
            <div key={grp}>
              <div className="text-xs uppercase text-muted-foreground mb-2">
                {grp === "ops" ? "Operacional" : grp === "finance" ? "Financeiro" : grp === "risk" ? "Risco" : "Scoring"}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {grouped[grp].map((t) => {
                  const Icon = t.icon;
                  const isRunning = runningTask === t.key;
                  return (
                    <Button key={t.key} variant="outline" size="sm" className="justify-start" disabled={inference.isPending} onClick={() => run(t.key)}>
                      {isRunning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Icon className="h-4 w-4 mr-2" />}
                      {t.label}
                    </Button>
                  );
                })}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Tabs defaultValue="recommendations">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="recommendations">Recomendações</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
          <TabsTrigger value="alerts">Alertas</TabsTrigger>
          <TabsTrigger value="scores">Scoring</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="recommendations">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4" /> Recomendações IA</CardTitle>
              <CardDescription>Ações sugeridas pela IA. Aplicação requer autorização explícita do utilizador.</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[480px] pr-3">
                {(reco.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhuma recomendação ainda. Execute uma inferência acima.</p>}
                <div className="space-y-2">
                  {(reco.data ?? []).map((r: any) => (
                    <div key={r.id} className="border rounded-lg p-3 flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge variant="outline">{r.category}</Badge>
                          <ConfidenceBadge value={r.confidence} />
                          {r.status === "applied" && <Badge className="bg-green-500/10 text-green-600 border-green-500/30" variant="outline">Aplicada</Badge>}
                          {r.status === "dismissed" && <Badge variant="outline">Descartada</Badge>}
                          <ReasoningTip reasoning={r.reasoning} />
                        </div>
                        <div className="font-medium text-sm">{r.title}</div>
                        {r.body && <div className="text-xs text-muted-foreground mt-1">{r.body}</div>}
                      </div>
                      {r.status === "pending" && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="default" onClick={() => action.mutate({ action: "apply_recommendation", recommendation_id: r.id })}>
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => action.mutate({ action: "dismiss_recommendation", recommendation_id: r.id })}>
                            <XCircle className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="insights">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" /> Insights Operacionais</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[480px] pr-3">
                {(insights.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Sem insights.</p>}
                <div className="space-y-2">
                  {(insights.data ?? []).map((r: any) => (
                    <div key={r.id} className="border rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant="outline">{r.kind}</Badge>
                        <SeverityBadge s={r.severity} />
                        <ConfidenceBadge value={r.confidence} />
                        <ReasoningTip reasoning={r.reasoning} />
                      </div>
                      <div className="font-medium text-sm">{r.title}</div>
                      {r.summary && <div className="text-xs text-muted-foreground mt-1">{r.summary}</div>}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Alertas IA</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[480px] pr-3">
                {(alerts.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Sem alertas.</p>}
                <div className="space-y-2">
                  {(alerts.data ?? []).map((r: any) => (
                    <div key={r.id} className="border rounded-lg p-3 flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge variant="outline">{r.alert_type}</Badge>
                          <SeverityBadge s={r.severity} />
                          <ConfidenceBadge value={r.confidence} />
                          {r.status === "acknowledged" && <Badge variant="outline" className="bg-green-500/10 text-green-600">Reconhecido</Badge>}
                          {r.status === "dismissed" && <Badge variant="outline">Descartado</Badge>}
                          <ReasoningTip reasoning={r.reasoning} />
                        </div>
                        <div className="font-medium text-sm">{r.title}</div>
                        {r.message && <div className="text-xs text-muted-foreground mt-1">{r.message}</div>}
                      </div>
                      {r.status === "open" && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="default" onClick={() => action.mutate({ action: "acknowledge_alert", alert_id: r.id })}>
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => action.mutate({ action: "dismiss_alert", alert_id: r.id })}>
                            <XCircle className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scores">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Gauge className="h-4 w-4" /> AI Scoring</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[480px] pr-3">
                {(scores.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Sem scores.</p>}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {(scores.data ?? []).map((r: any) => (
                    <div key={r.id} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{r.metric}</Badge>
                          <span className="text-xs text-muted-foreground">{r.subject_type}</span>
                          <ReasoningTip reasoning={r.reasoning} />
                        </div>
                        <ConfidenceBadge value={r.confidence} />
                      </div>
                      <div className="flex items-baseline justify-between">
                        <div className="font-medium text-sm truncate">{r.subject_label ?? "—"}</div>
                        <div className="font-mono text-xl font-bold">{Number(r.score).toFixed(0)}</div>
                      </div>
                      {r.band && <div className="text-xs text-muted-foreground mt-1">Banda: {r.band}</div>}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeline">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4" /> Timeline Contextual</CardTitle>
              <CardDescription>Unificação cronológica de todas as inferências IA do workspace.</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[480px] pr-3">
                <div className="space-y-2">
                  {timeline.length === 0 && <p className="text-sm text-muted-foreground">Sem eventos.</p>}
                  {timeline.map((e: any) => (
                    <div key={`${e._type}-${e.id}`} className="flex items-start gap-3 border-l-2 border-border pl-3 py-1">
                      <Badge variant="outline" className="capitalize">{e._type}</Badge>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{e.title}</div>
                        <div className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString("pt-PT")}</div>
                      </div>
                      <ConfidenceBadge value={e.confidence} />
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <Separator className="my-4" />
              <div className="text-xs text-muted-foreground">
                <span className="font-semibold">Log de ações:</span> {(log.data ?? []).length} entradas registadas (auditoria completa).
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
