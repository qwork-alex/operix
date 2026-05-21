import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Save, Trash2, Lock } from "lucide-react";
import {
  useProductionOrders, PRODUCTION_STATUSES, PRIORITY_META, isOrderLocked,
  type ProductionOrder, type ProductionStatus, type ProductionPriority,
} from "@/hooks/useProductionOrders";
import { PhotoUploader } from "./PhotoUploader";
import { OrderTimeline } from "./OrderTimeline";

interface Props {
  order: ProductionOrder | null;
  onClose: () => void;
}

export function OrderDetailDialog({ order, onClose }: Props) {
  const { update, remove, create } = useProductionOrders();
  const [form, setForm] = useState<Partial<ProductionOrder>>({});
  const [activeTab, setActiveTab] = useState("info");
  const isNew = order?.id === "__new__";
  const locked = !isNew && isOrderLocked(order?.status);

  useEffect(() => {
    setForm(order ?? {});
    setActiveTab("info");
  }, [order]);

  if (!order) return null;

  const set = <K extends keyof ProductionOrder>(k: K, v: ProductionOrder[K]) => {
    if (locked) return;
    setForm(f => ({ ...f, [k]: v }));
  };

  const save = async () => {
    try {
      if (isNew) {
        await create.mutateAsync(form);
      } else {
        await update.mutateAsync({ id: order.id, ...form });
      }
      onClose();
    } catch (err) {
      console.error("[Production] save failed", err);
    }
  };

  return (
    <Dialog open={!!order} onOpenChange={(o) => !o && onClose()}>
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
            Formulário operacional da ordem de produção com dados, fotos e histórico.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="info">Dados</TabsTrigger>
            <TabsTrigger value="photos" disabled={isNew}>Fotos</TabsTrigger>
            <TabsTrigger value="timeline" disabled={isNew}>Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="space-y-4 pt-4">
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

            <div className="flex justify-between pt-2">
              {!isNew && !locked ? (
                <Button variant="destructive" size="sm"
                  onClick={async () => {
                    if (confirm("Remover esta ordem?")) { await remove.mutateAsync(order.id); onClose(); }
                  }}>
                  <Trash2 className="h-4 w-4 mr-2" /> Excluir
                </Button>
              ) : <span />}
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>{locked ? "Fechar" : "Cancelar"}</Button>
                {!locked && (
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
