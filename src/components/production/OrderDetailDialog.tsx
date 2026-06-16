import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Save, Trash2, Lock, Minimize2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "@/lib/authUser";
import {
  useProductionOrders, PRODUCTION_STATUSES, PRIORITY_META, isOrderLocked,
  type ProductionOrder, type ProductionStatus, type ProductionPriority,
} from "@/hooks/useProductionOrders";
import { useAutosave } from "@/hooks/useAutosave";
import { PhotoUploader } from "./PhotoUploader";
import { OrderTimeline } from "./OrderTimeline";
import { FileUploadZone } from "@/components/service-orders/FileUploadZone";
import { useExtractProductionOrder } from "@/hooks/useExtractProductionOrder";

interface Props {
  order: ProductionOrder | null;
  onClose: () => void;
}

/**
 * Lifecycle persistente:
 * - Rascunhos de "Nova Ordem" sobrevivem a refresh/remount via localStorage (useAutosave).
 * - Ordens existentes são persistidas no banco e nunca encerradas ao minimizar.
 * - "Minimizar" apenas fecha o diálogo, mantendo a OS viva até status = finished.
 */
export function OrderDetailDialog({ order, onClose }: Props) {
  const { update, remove, create } = useProductionOrders();
  const [form, setForm] = useState<Partial<ProductionOrder>>({});
  const [activeTab, setActiveTab] = useState("info");
  const isNew = order?.id === "__new__";
  const locked = !isNew && isOrderLocked(order?.status);
  const { extract, isExtracting } = useExtractProductionOrder();

  const draftKey = useMemo(
    () => isNew ? "production-draft-new" : `production-draft-${order?.id ?? "noop"}`,
    [isNew, order?.id],
  );

  // Restore + autosave draft (only meaningful for new orders; existing OS already lives in DB)
  const { clear: clearDraft } = useAutosave<Partial<ProductionOrder>>(
    draftKey,
    form,
    setForm,
    600,
  );

  useEffect(() => {
    setForm(order ?? {});
    setActiveTab("info");
    // Lifecycle: if this existing order had a saved draft (was minimized), log resume
    if (order && order.id !== "__new__") {
      try {
        const had = localStorage.getItem(`production-draft-${order.id}`);
        if (had) {
          (async () => {
            try {
              const actorUserId = await getCurrentUserId().catch(() => null);
              await (supabase as any).from("production_events").insert({
                production_order_id: order.id,
                workspace_id: order.workspace_id,
                event_type: "field_updated",
                from_value: null,
                to_value: "resumed",
                actor_user_id: actorUserId,
              });
            } catch (err) { void err; }
          })();
        }
      } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id]);

  if (!order) return null;

  const set = <K extends keyof ProductionOrder>(k: K, v: ProductionOrder[K]) => {
    if (locked) return;
    setForm(f => ({ ...f, [k]: v }));
  };

  const logLifecycle = async (type: "minimized" | "resumed") => {
    if (isNew || !order?.id) return;
    try {
      const actorUserId = await getCurrentUserId().catch(() => null);
      await (supabase as any).from("production_events").insert({
        production_order_id: order.id,
        workspace_id: order.workspace_id,
        event_type: "field_updated",
        from_value: null,
        to_value: type,
        actor_user_id: actorUserId,
      });
    } catch {
    }
  };

  const save = async () => {
    try {
      if (isNew) {
        await create.mutateAsync(form);
      } else {
        await update.mutateAsync({ id: order.id, ...form });
      }
      clearDraft();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar.");
    }
  };

  const applyOcr = async (files: File[]) => {
    if (!files.length) return;
    try {
      const res = await extract(files[0]);
      const next: Partial<ProductionOrder> = {};
      const o = res.order;
      if (o.client && !form.client_name) next.client_name = o.client;
      if (o.platform && !form.platform) next.platform = o.platform;
      if (o.license_plate && !form.license_plate) next.license_plate = o.license_plate.toUpperCase();
      if (o.vin && !form.vin) next.vin = o.vin;
      if (o.brand && !form.brand) next.brand = o.brand;
      if (o.model && !form.model) next.model = o.model;
      if (o.color && !form.color) next.color = o.color;
      if (o.insurer && !form.insurer) next.insurer = o.insurer;
      if (o.vehicle_notes && !form.notes) next.notes = o.vehicle_notes;
      setForm((f) => ({ ...f, ...next }));
      if (res.confidence === "low") toast.warning("OCR com baixa confiança. Revise os campos.");
      else toast.success("Dados extraídos. Revise antes de salvar.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no OCR.");
    }
  };

  const minimize = async () => {
    // Draft is already persisted by useAutosave. For existing orders, log the pause-to-bg event.
    if (!isNew) await logLifecycle("minimized");
    toast.success(isNew ? "Rascunho guardado · continua disponível" : "Ordem minimizada · continua ativa");
    onClose();
  };

  const discardDraft = () => {
    clearDraft();
    setForm({});
    toast.message("Rascunho descartado");
    onClose();
  };

  return (
    <Dialog open={!!order} onOpenChange={(o) => { if (!o) minimize(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span>{isNew ? "Nova Ordem" : order.code}</span>
            {!isNew && (
              <Badge variant="outline" className={PRIORITY_META[order.priority].tone}>
                {PRIORITY_META[order.priority].label}
              </Badge>
            )}
            {locked && (
              <Badge variant="outline" className="gap-1 text-emerald-500 border-emerald-500/30">
                <Lock className="h-3 w-3" /> Finalizado · somente leitura
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Formulário operacional da ordem de produção com dados, fotos e histórico. Pode ser minimizado sem encerrar o workflow.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="info">Dados</TabsTrigger>
            <TabsTrigger value="photos" disabled={isNew}>Fotos</TabsTrigger>
            <TabsTrigger value="timeline" disabled={isNew}>Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="space-y-4 pt-4">
            {isNew && !locked && (
              <div className="rounded-lg border border-border/50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">OCR: importar ordem</div>
                    <div className="text-xs text-muted-foreground">
                      Envie uma foto/PDF de uma ordem existente para pré-preencher os campos.
                    </div>
                  </div>
                </div>
                <div className="mt-3">
                  <FileUploadZone onFilesSelected={applyOcr} isProcessing={isExtracting} compact />
                </div>
              </div>
            )}
            <fieldset disabled={locked} className="space-y-4 disabled:opacity-80">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cliente"><Input value={form.client_name ?? ""} onChange={e => set("client_name", e.target.value)} /></Field>
              <Field label="Plataforma"><Input value={form.platform ?? ""} onChange={e => set("platform", e.target.value)} /></Field>
              <Field label="Placa"><Input value={form.license_plate ?? ""} onChange={e => set("license_plate", e.target.value.toUpperCase())} /></Field>
              <Field label="VIN"><Input value={form.vin ?? ""} onChange={e => set("vin", e.target.value)} /></Field>
              <Field label="Marca"><Input value={form.brand ?? ""} onChange={e => set("brand", e.target.value)} /></Field>
              <Field label="Modelo"><Input value={form.model ?? ""} onChange={e => set("model", e.target.value)} /></Field>
              <Field label="Cor"><Input value={form.color ?? ""} onChange={e => set("color", e.target.value)} /></Field>
              <Field label="Seguradora"><Input value={form.insurer ?? ""} onChange={e => set("insurer", e.target.value)} /></Field>

              <Field label="Status">
                <Select value={form.status ?? "new_vehicle"} onValueChange={(v) => set("status", v as ProductionStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRODUCTION_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Prioridade">
                <Select value={form.priority ?? "normal"} onValueChange={(v) => set("priority", v as ProductionPriority)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRIORITY_META).map(([k, m]) => <SelectItem key={k} value={k}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Técnico Responsável">
                <Input
                  value={form.technician_name ?? ""}
                  placeholder="Digite o nome do técnico"
                  onChange={(e) => {
                    set("technician_name", e.target.value || null);
                    if (form.technician_user_id) set("technician_user_id", null);
                  }}
                />
              </Field>
              <Field label="Prazo">
                <Input type="datetime-local"
                  value={form.due_at ? new Date(form.due_at).toISOString().slice(0,16) : ""}
                  onChange={e => set("due_at", e.target.value ? new Date(e.target.value).toISOString() : null)} />
              </Field>
            </div>
            <Field label="Observações">
              <Textarea value={form.notes ?? ""} onChange={e => set("notes", e.target.value)} rows={3} />
            </Field>
            </fieldset>

            <div className="flex flex-wrap justify-between gap-2 pt-2">
              <div className="flex gap-2">
                {!isNew && !locked && (
                  <Button variant="destructive" size="sm"
                    onClick={async () => {
                      if (confirm("Remover esta ordem?")) { await remove.mutateAsync(order.id); clearDraft(); onClose(); }
                    }}>
                    <Trash2 className="h-4 w-4 mr-2" /> Excluir
                  </Button>
                )}
                {isNew && (
                  <Button variant="ghost" size="sm" onClick={discardDraft}>
                    Descartar rascunho
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                {!locked && (
                  <Button variant="outline" onClick={minimize}>
                    <Minimize2 className="h-4 w-4 mr-2" /> Minimizar
                  </Button>
                )}
                {locked ? (
                  <Button variant="outline" onClick={onClose}>Fechar</Button>
                ) : (
                  <Button onClick={save} disabled={update.isPending || create.isPending}>
                    <Save className="h-4 w-4 mr-2" /> Salvar
                  </Button>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="photos" className="pt-4 space-y-6">
            <section className="space-y-2">
              <h4 className="text-sm font-semibold text-foreground">Veículo na entrada</h4>
              <p className="text-xs text-muted-foreground">Fotos obrigatórias do estado inicial.</p>
              <PhotoUploader orderId={order.id} fixedCategory="before" hideOthers readOnly={locked} />
            </section>
            <div className="h-px bg-border/60" />
            <section className="space-y-2">
              <h4 className="text-sm font-semibold text-foreground">Durante o serviço</h4>
              <p className="text-xs text-muted-foreground">Registo do andamento e etapas intermediárias.</p>
              <PhotoUploader orderId={order.id} fixedCategory="during" hideOthers readOnly={locked} />
            </section>
            <div className="h-px bg-border/60" />
            <section className="space-y-2">
              <h4 className="text-sm font-semibold text-foreground">Veículo finalizado</h4>
              <p className="text-xs text-muted-foreground">Registro do resultado final após o serviço.</p>
              <PhotoUploader orderId={order.id} fixedCategory="after" hideOthers readOnly={locked} />
            </section>
          </TabsContent>
          <TabsContent value="timeline" className="pt-4">
            <OrderTimeline orderId={order.id} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
