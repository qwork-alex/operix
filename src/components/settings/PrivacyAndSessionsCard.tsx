/**
 * Phase 5.5 — Per-user privacy preferences, sessions/devices, GDPR actions.
 * Drop-in card for the profile / settings page.
 */
import { useState } from "react";
import { ShieldCheck, Smartphone, Download, Trash2, Loader2, LogOut } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  usePrivacySettings, useUpdatePrivacySettings,
  useUserDevices, useRevokeDevice, useRevokeAllDevices,
  useRequestDataExport, useDataExports,
} from "@/hooks/useCompliance";

const SWITCHES = [
  { key: "marketing_emails", label: "E-mails de marketing", desc: "Novidades, dicas e atualizações comerciais." },
  { key: "analytics_tracking", label: "Análise de uso", desc: "Métricas anónimas para melhorar o produto." },
  { key: "ai_training_optin", label: "Treino de IA", desc: "Permitir que dados anonimizados ajudem a treinar modelos." },
  { key: "share_usage_data", label: "Partilha de uso agregado", desc: "Dados estatísticos partilhados com parceiros confiáveis." },
];

export function PrivacyAndSessionsCard() {
  const { data: privacy } = usePrivacySettings();
  const updatePrivacy = useUpdatePrivacySettings();
  const { data: devices = [], isLoading: devicesLoading } = useUserDevices();
  const revoke = useRevokeDevice();
  const revokeAll = useRevokeAllDevices();
  const requestExport = useRequestDataExport();
  const { data: exports = [] } = useDataExports();
  const [pending, setPending] = useState<string | null>(null);

  const handleSwitch = async (key: string, value: boolean) => {
    setPending(key);
    try { await updatePrivacy.mutateAsync({ [key]: value }); } finally { setPending(null); }
  };

  return (
    <div className="space-y-6">
      {/* Privacy preferences */}
      <Card className="surface-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Preferências de privacidade (RGPD)</h3>
          <Badge variant="outline" className="ml-auto text-[10px]">GDPR · Art. 7</Badge>
        </div>
        <div className="space-y-4">
          {SWITCHES.map((s) => (
            <div key={s.key} className="flex items-start justify-between gap-4 py-2 border-b border-border/30 last:border-0">
              <div className="flex-1 min-w-0">
                <Label className="text-sm">{s.label}</Label>
                <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
              </div>
              <Switch
                checked={!!privacy?.[s.key]}
                disabled={pending === s.key}
                onCheckedChange={(v) => handleSwitch(s.key, v)}
              />
            </div>
          ))}
        </div>
      </Card>

      {/* Sessions / Devices */}
      <Card className="surface-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border/40 flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Sessões e dispositivos</h3>
          <Badge variant="outline" className="ml-2 text-[10px]">{devices.filter((d: any) => !d.revoked_at).length} activos</Badge>
          <div className="ml-auto">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs"><LogOut className="h-3 w-3 mr-1.5" />Terminar todos</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Revogar todos os dispositivos?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Todos os dispositivos serão marcados como revogados. Terá de iniciar sessão novamente no próximo acesso.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => revokeAll.mutate()}>Revogar tudo</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
        {devicesLoading ? (
          <div className="p-8 text-center text-xs text-muted-foreground">A carregar dispositivos…</div>
        ) : devices.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">Nenhum dispositivo registado.</div>
        ) : (
          <div className="divide-y divide-border/30">
            {devices.map((d: any) => (
              <div key={d.id} className="px-6 py-3 flex items-center gap-4 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{d.browser ?? "Browser"} · {d.os ?? "OS"} · {d.device_type ?? "device"}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {d.ip_address ?? "IP desconhecido"} {d.country ? `· ${d.country}` : ""} · visto {new Date(d.last_seen_at).toLocaleString()}
                  </div>
                </div>
                {d.revoked_at ? (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">revogado</Badge>
                ) : (
                  <Button
                    variant="ghost" size="sm" className="h-7 text-xs text-red-500 hover:text-red-600"
                    onClick={() => revoke.mutate(d.id)}
                  >
                    Revogar
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* GDPR data export */}
      <Card className="surface-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Download className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-semibold">Exportar os meus dados</h3>
          <Badge variant="outline" className="ml-auto text-[10px]">GDPR · Art. 20</Badge>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Solicite uma cópia portátil dos seus dados (perfil, faturas, documentos, logs).
          Receberá um aviso quando estiver pronto.
        </p>
        <div className="flex flex-wrap gap-2 mb-4">
          {(["json", "csv", "pdf"] as const).map((fmt) => (
            <Button
              key={fmt} variant="outline" size="sm" className="h-8 text-xs uppercase tracking-wider"
              disabled={requestExport.isPending}
              onClick={() => requestExport.mutate({ scope: "full", format: fmt })}
            >
              {requestExport.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
              {fmt}
            </Button>
          ))}
        </div>
        {exports.length > 0 && (
          <div className="space-y-1 max-h-40 overflow-y-auto pr-2">
            {exports.map((e: any) => (
              <div key={e.id} className="flex items-center gap-3 text-xs px-3 py-2 rounded bg-muted/30">
                <Badge variant="outline" className="text-[10px]">{e.format}</Badge>
                <span className="text-muted-foreground">{e.scope}</span>
                <span className="ml-auto text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
                <Badge variant="outline" className="text-[10px]">{e.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Right-to-be-forgotten */}
      <Card className="surface-card p-6 border-red-500/20">
        <div className="flex items-center gap-2 mb-2">
          <Trash2 className="h-4 w-4 text-red-500" />
          <h3 className="text-sm font-semibold text-red-500">Direito ao esquecimento</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          O pedido de eliminação definitiva é processado pelo proprietário do workspace ou por um administrador.
          Após confirmação, os dados ficam em retenção segura por 30 dias antes da anonimização irreversível.
        </p>
        <p className="text-[11px] text-muted-foreground italic">
          Contacte o administrador do seu workspace para iniciar este processo.
        </p>
      </Card>
    </div>
  );
}
