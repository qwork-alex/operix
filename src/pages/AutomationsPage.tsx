import { useMemo, useState } from "react";
import {
  useAutomationRules, useAutomationExecutions, useAutomationStats,
  useAutomationDeadLetter, runAutomationEngineNow, type AutomationRule,
} from "@/hooks/useAutomationEngine";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Zap, Plus, Copy, Trash2, Download, Upload, Play, Loader2, AlertTriangle,
  CheckCircle2, XCircle, FlaskConical, Pencil, ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const TRIGGER_TYPES = [
  { value: "service_order.created", label: "OS criada" },
  { value: "service_order.status_changed", label: "OS — status alterado" },
  { value: "service_order.updated", label: "OS atualizada" },
  { value: "payment_order.created", label: "OP criada" },
  { value: "payment_order.status_changed", label: "OP — status alterado" },
  { value: "payment_order.updated", label: "OP atualizada" },
  { value: "fleet.fuel_logged", label: "Frota — abastecimento" },
];

const CONDITION_OPS = [
  { value: "eq", label: "=" }, { value: "neq", label: "≠" },
  { value: "gt", label: ">" }, { value: "gte", label: "≥" },
  { value: "lt", label: "<" }, { value: "lte", label: "≤" },
  { value: "contains", label: "contém" }, { value: "in", label: "está em" },
  { value: "exists", label: "existe" }, { value: "truthy", label: "verdadeiro" },
];

const ACTION_TYPES = [
  { value: "notify", label: "Notificar utilizador" },
  { value: "audit", label: "Registar em auditoria" },
  { value: "update_status", label: "Atualizar status" },
  { value: "assign_user", label: "Atribuir utilizador" },
  { value: "webhook", label: "Enviar webhook" },
];

const STATUS_STYLE: Record<string, string> = {
  success: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  failed: "bg-red-500/15 text-red-300 border-red-500/40",
  dry_run: "bg-sky-500/10 text-sky-300 border-sky-500/30",
  skipped: "bg-zinc-500/10 text-zinc-300 border-zinc-500/30",
};

export default function AutomationsPage() {
  const rules = useAutomationRules();
  const execs = useAutomationExecutions(200);
  const dead = useAutomationDeadLetter();
  const stats = useAutomationStats();
  const [editing, setEditing] = useState<Partial<AutomationRule> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AutomationRule | null>(null);
  const [running, setRunning] = useState(false);

  const handleRunNow = async () => {
    setRunning(true);
    try {
      const r = await runAutomationEngineNow();
      toast.success(`Motor executado · ${r?.processed ?? 0} processados`);
      execs.refetch(); stats.refetch();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao executar motor");
    } finally { setRunning(false); }
  };

  const handleExport = (rule: AutomationRule) => {
    const { id, workspace_id, created_at, updated_at, ...exportable } = rule;
    const blob = new Blob([JSON.stringify(exportable, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `automation-${rule.name.replace(/[^a-z0-9]+/gi, "-")}.json`;
    a.click(); URL.revokeObjectURL(url);
  };

  const handleImportFile = async (file: File) => {
    try {
      const txt = await file.text();
      const parsed = JSON.parse(txt);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      await rules.importJson.mutateAsync(arr);
    } catch (e: any) {
      toast.error(`JSON inválido: ${e?.message ?? e}`);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Zap size={20} className="text-primary" />
        <h1 className="text-xl font-semibold text-foreground">Motor de Automações</h1>
        <span className="text-xs text-muted-foreground ml-2">
          Gatilhos → condições → ações · fila assíncrona, retentativas e dead-letter
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleRunNow} disabled={running}>
            {running ? <Loader2 className="animate-spin mr-1" size={12} /> : <Play size={12} className="mr-1" />}
            Executar agora
          </Button>
          <Button size="sm" onClick={() => setEditing({})}>
            <Plus size={12} className="mr-1" /> Nova regra
          </Button>
        </div>
      </div>

      {/* Monitor */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <KPI label="24h total" value={stats.data?.total24h ?? "—"} />
        <KPI label="Sucessos" value={stats.data?.success24h ?? "—"} tone="success" />
        <KPI label="Falhas" value={stats.data?.failed24h ?? "—"} tone={(stats.data?.failed24h ?? 0) ? "critical" : "info"} />
        <KPI label="Modo seguro" value={stats.data?.dryRun24h ?? "—"} tone="warn" />
        <KPI label="Pendentes" value={stats.data?.pending ?? "—"} />
        <KPI label="Dead-letter" value={stats.data?.dead ?? "—"} tone={(stats.data?.dead ?? 0) ? "critical" : "info"} />
      </div>

      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">Regras</TabsTrigger>
          <TabsTrigger value="executions">Execuções</TabsTrigger>
          <TabsTrigger value="dead">Dead-letter</TabsTrigger>
        </TabsList>

        {/* RULES */}
        <TabsContent value="rules" className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground inline-flex items-center gap-1 cursor-pointer hover:text-foreground">
              <Upload size={12} />
              Importar JSON
              <input
                type="file" accept="application/json" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.currentTarget.value = ""; }}
              />
            </label>
          </div>

          <Card className="divide-y divide-border/40">
            {rules.isLoading ? (
              <div className="py-12 text-center text-sm text-muted-foreground">A carregar…</div>
            ) : (rules.data?.length ?? 0) === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Sem automações configuradas</div>
            ) : (
              rules.data!.map((r) => (
                <div key={r.id} className="p-3 flex flex-wrap items-center gap-2">
                  <Switch
                    checked={r.enabled}
                    onCheckedChange={(v) => rules.toggle.mutate({ id: r.id, enabled: v })}
                  />
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{r.name}</span>
                      {r.safe_mode && (
                        <Badge variant="outline" className="text-[10px] bg-sky-500/10 text-sky-300 border-sky-500/30">
                          <FlaskConical size={10} className="mr-1" /> Modo seguro
                        </Badge>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground font-mono">
                      {r.trigger_type} · {(r.actions?.length ?? 0)} ação(ões) · {(r.conditions?.length ?? 0)} condição(ões)
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(r)}>
                    <Pencil size={12} className="mr-1" /> Editar
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => rules.duplicate.mutate(r)}>
                    <Copy size={12} className="mr-1" /> Duplicar
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleExport(r)}>
                    <Download size={12} className="mr-1" /> Export
                  </Button>
                  <Button variant="ghost" size="sm"
                    className="text-red-300 hover:text-red-200"
                    onClick={() => setConfirmDelete(r)}>
                    <Trash2 size={12} />
                  </Button>
                </div>
              ))
            )}
          </Card>
        </TabsContent>

        {/* EXECUTIONS */}
        <TabsContent value="executions" className="mt-3">
          <ExecutionsFeed data={execs.data ?? []} loading={execs.isLoading} rules={rules.data ?? []} />
        </TabsContent>

        {/* DEAD-LETTER */}
        <TabsContent value="dead" className="mt-3">
          <Card className="divide-y divide-border/40">
            {dead.isLoading ? (
              <div className="py-12 text-center text-sm text-muted-foreground">A carregar…</div>
            ) : (dead.data?.length ?? 0) === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Dead-letter vazia</div>
            ) : (
              dead.data!.map((d) => (
                <div key={d.id} className="p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-[10px] bg-red-500/15 text-red-300 border-red-500/40">
                      <AlertTriangle size={10} className="mr-1" /> {d.attempts} tentativas
                    </Badge>
                    <span className="font-mono text-xs text-foreground">{d.event_type}</span>
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      {new Date(d.created_at).toLocaleString("pt-PT")}
                    </span>
                  </div>
                  {d.last_error && (
                    <p className="mt-1 text-[11px] text-red-300/80 font-mono">{d.last_error}</p>
                  )}
                </div>
              ))
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {editing !== null && (
        <RuleEditorDialog
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (r) => { await rules.save.mutateAsync(r); setEditing(null); }}
          saving={rules.save.isPending}
        />
      )}

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar automação?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Execuções históricas permanecem registadas em auditoria.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => { if (confirmDelete) rules.remove.mutate(confirmDelete.id); setConfirmDelete(null); }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function KPI({ label, value, tone = "info" }: {
  label: string; value: number | string; tone?: "info" | "success" | "warn" | "critical";
}) {
  return (
    <Card className={cn(
      "p-3 border",
      tone === "critical" && "border-red-500/40 bg-red-500/[0.04]",
      tone === "warn" && "border-amber-500/40 bg-amber-500/[0.04]",
      tone === "success" && "border-emerald-500/40 bg-emerald-500/[0.04]",
      tone === "info" && "border-border/40",
    )}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-base font-semibold text-foreground">{value}</div>
    </Card>
  );
}

function ExecutionsFeed({ data, loading, rules }: {
  data: any[]; loading: boolean; rules: AutomationRule[];
}) {
  const [open, setOpen] = useState<string | null>(null);
  const ruleName = useMemo(() => {
    const m = new Map<string, string>(); rules.forEach((r) => m.set(r.id, r.name)); return m;
  }, [rules]);
  if (loading) return <Card className="py-12 text-center text-sm text-muted-foreground">A carregar…</Card>;
  if (!data.length) return <Card className="py-12 text-center text-sm text-muted-foreground">Sem execuções</Card>;
  return (
    <Card className="divide-y divide-border/40">
      {data.map((e) => {
        const isOpen = open === e.id;
        return (
          <div key={e.id} className="p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2 cursor-pointer"
              onClick={() => setOpen(isOpen ? null : e.id)}>
              <Badge variant="outline" className={cn("text-[10px]", STATUS_STYLE[e.status])}>
                {e.status === "success" && <CheckCircle2 size={10} className="mr-1" />}
                {e.status === "failed" && <XCircle size={10} className="mr-1" />}
                {e.status === "dry_run" && <FlaskConical size={10} className="mr-1" />}
                {e.status.toUpperCase()}
              </Badge>
              <span className="text-sm text-foreground">{ruleName.get(e.rule_id ?? "") ?? "—"}</span>
              <span className="text-[10px] font-mono text-muted-foreground">tentativa #{e.attempt}</span>
              <span className="ml-auto text-[11px] text-muted-foreground">
                {new Date(e.created_at).toLocaleString("pt-PT")}
              </span>
              <ChevronDown size={14} className={cn("text-muted-foreground transition-transform", isOpen && "rotate-180")} />
            </div>
            {isOpen && (
              <div className="mt-2 text-[11px]">
                {e.error && <p className="text-red-300/80 font-mono mb-2">{e.error}</p>}
                <pre className="bg-muted/30 rounded p-2 overflow-auto max-h-72 border border-border/40">
                  {JSON.stringify(e.actions_log, null, 2)}
                </pre>
              </div>
            )}
          </div>
        );
      })}
    </Card>
  );
}

function RuleEditorDialog({ initial, onClose, onSave, saving }: {
  initial: Partial<AutomationRule>;
  onClose: () => void;
  onSave: (r: Partial<AutomationRule>) => Promise<void>;
  saving: boolean;
}) {
  const [r, setR] = useState<Partial<AutomationRule>>({
    name: "", description: "",
    trigger_type: "service_order.created",
    conditions: [], actions: [],
    delay_seconds: 0, max_retries: 3, retry_backoff_seconds: 30,
    enabled: true, safe_mode: false,
    ...initial,
  });

  const updateCondition = (i: number, patch: any) => {
    const next = [...(r.conditions ?? [])]; next[i] = { ...next[i], ...patch };
    setR({ ...r, conditions: next });
  };
  const updateAction = (i: number, patch: any) => {
    const next = [...(r.actions ?? [])]; next[i] = { ...next[i], ...patch };
    setR({ ...r, actions: next });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial.id ? "Editar automação" : "Nova automação"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid md:grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Nome</label>
              <Input value={r.name ?? ""} onChange={(e) => setR({ ...r, name: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Gatilho</label>
              <Select value={r.trigger_type} onValueChange={(v) => setR({ ...r, trigger_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TRIGGER_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Descrição</label>
            <Textarea rows={2} value={r.description ?? ""} onChange={(e) => setR({ ...r, description: e.target.value })} />
          </div>

          {/* Conditions */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">Condições (todas devem ser verdadeiras)</span>
              <Button size="sm" variant="ghost" onClick={() => setR({ ...r, conditions: [...(r.conditions ?? []), { path: "new.status", op: "eq", value: "" }] })}>
                <Plus size={12} className="mr-1" /> Adicionar
              </Button>
            </div>
            <div className="space-y-2">
              {(r.conditions ?? []).map((c: any, i: number) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input className="flex-1" placeholder="caminho (ex: new.status)" value={c.path ?? ""}
                    onChange={(e) => updateCondition(i, { path: e.target.value })} />
                  <Select value={c.op} onValueChange={(v) => updateCondition(i, { op: v })}>
                    <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CONDITION_OPS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input className="flex-1" placeholder="valor" value={c.value ?? ""}
                    onChange={(e) => updateCondition(i, { value: e.target.value })} />
                  <Button size="sm" variant="ghost" onClick={() => setR({ ...r, conditions: r.conditions!.filter((_: any, x: number) => x !== i) })}>
                    <Trash2 size={12} />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">Ações (executadas em sequência)</span>
              <Button size="sm" variant="ghost" onClick={() => setR({ ...r, actions: [...(r.actions ?? []), { type: "notify", title: "", message: "" }] })}>
                <Plus size={12} className="mr-1" /> Adicionar
              </Button>
            </div>
            <div className="space-y-2">
              {(r.actions ?? []).map((a: any, i: number) => (
                <Card key={i} className="p-2 space-y-1">
                  <div className="flex gap-2 items-center">
                    <Select value={a.type} onValueChange={(v) => updateAction(i, { type: v })}>
                      <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ACTION_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="ghost" className="ml-auto"
                      onClick={() => setR({ ...r, actions: r.actions!.filter((_: any, x: number) => x !== i) })}>
                      <Trash2 size={12} />
                    </Button>
                  </div>
                  <ActionFields action={a} update={(p) => updateAction(i, p)} />
                </Card>
              ))}
            </div>
          </div>

          <div className="grid md:grid-cols-4 gap-2">
            <NumField label="Atraso (s)" value={r.delay_seconds ?? 0} set={(v) => setR({ ...r, delay_seconds: v })} />
            <NumField label="Máx. retentativas" value={r.max_retries ?? 3} set={(v) => setR({ ...r, max_retries: v })} />
            <NumField label="Backoff base (s)" value={r.retry_backoff_seconds ?? 30} set={(v) => setR({ ...r, retry_backoff_seconds: v })} />
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Modo seguro (dry-run)</span>
              <Switch checked={!!r.safe_mode} onCheckedChange={(v) => setR({ ...r, safe_mode: v })} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => onSave(r)} disabled={saving || !(r.name ?? "").trim()}>
            {saving && <Loader2 className="animate-spin mr-1" size={12} />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NumField({ label, value, set }: { label: string; value: number; set: (n: number) => void }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <Input type="number" value={value} onChange={(e) => set(Number(e.target.value) || 0)} />
    </div>
  );
}

function ActionFields({ action, update }: { action: any; update: (p: any) => void }) {
  switch (action.type) {
    case "notify":
      return (
        <div className="grid md:grid-cols-2 gap-2">
          <Input placeholder="Título" value={action.title ?? ""} onChange={(e) => update({ title: e.target.value })} />
          <Input placeholder="user_id (opcional, default: assigned)" value={action.user_id ?? ""} onChange={(e) => update({ user_id: e.target.value })} />
          <Input className="md:col-span-2" placeholder="Mensagem" value={action.message ?? ""} onChange={(e) => update({ message: e.target.value })} />
        </div>
      );
    case "update_status":
      return (
        <div className="grid md:grid-cols-2 gap-2">
          <Input placeholder="status" value={action.status ?? ""} onChange={(e) => update({ status: e.target.value })} />
          <Input placeholder="priority" value={action.priority ?? ""} onChange={(e) => update({ priority: e.target.value })} />
          <Input className="md:col-span-2" placeholder="notes" value={action.notes ?? ""} onChange={(e) => update({ notes: e.target.value })} />
        </div>
      );
    case "assign_user":
      return <Input placeholder="user_id a atribuir" value={action.user_id ?? ""} onChange={(e) => update({ user_id: e.target.value })} />;
    case "webhook":
      return <Input placeholder="https://… (POST JSON)" value={action.url ?? ""} onChange={(e) => update({ url: e.target.value })} />;
    case "audit":
      return <Input placeholder="motivo (opcional)" value={action.reason ?? ""} onChange={(e) => update({ reason: e.target.value })} />;
    default:
      return null;
  }
}
