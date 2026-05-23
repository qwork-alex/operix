import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, UserPlus, Send, X, Mail } from "lucide-react";
import {
  useCreateInviteByCode,
  useOutgoingInvites,
  useCancelInvite,
} from "@/hooks/useWorkspaceInvites";
import type { MembershipRole } from "@/hooks/useWorkspace";

const ROLE_OPTIONS: { value: MembershipRole; label: string }[] = [
  { value: "tecnico", label: "Técnico" },
  { value: "socio", label: "Sócio" },
  { value: "cliente", label: "Cliente" },
  { value: "admin", label: "Admin" },
];

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-500 border-amber-500/30",
  accepted: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
  rejected: "bg-red-500/10 text-red-500 border-red-500/30",
  cancelled: "bg-muted text-muted-foreground border-border",
};

export function AddExistingUserPanel() {
  const [code, setCode] = useState("");
  const [role, setRole] = useState<MembershipRole>("tecnico");
  const create = useCreateInviteByCode();
  const cancel = useCancelInvite();
  const { data: invites = [], isLoading } = useOutgoingInvites();

  const handleSend = async () => {
    if (!code.trim()) return;
    try {
      await create.mutateAsync({ displayCode: code.trim().toUpperCase(), role });
      setCode("");
    } catch {
      /* toast handled in hook */
    }
  };

  return (
    <div className="space-y-6">
      <Card className="glass-panel border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="h-4 w-4 text-primary" />
            Adicionar usuário existente
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Digite o ID do usuário (ex.: <code className="text-foreground">T00001</code>,{" "}
            <code className="text-foreground">S00001</code>,{" "}
            <code className="text-foreground">C00001</code>). Um convite será enviado para a conta.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
            <div className="space-y-1.5">
              <Label htmlFor="invite-code" className="text-xs">ID do usuário</Label>
              <Input
                id="invite-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="T00001"
                className="font-mono tracking-wider h-10"
                maxLength={20}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Função no workspace</Label>
              <Select value={role} onValueChange={(v) => setRole(v as MembershipRole)}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                onClick={handleSend}
                disabled={!code.trim() || create.isPending}
                className="h-10 w-full md:w-auto"
              >
                {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
                Enviar convite
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-panel border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4 text-primary" />
            Convites enviados
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : invites.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum convite enviado.</p>
          ) : (
            <div className="divide-y divide-border/50">
              {invites.map((inv) => (
                <div key={inv.id} className="flex flex-col sm:flex-row sm:items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="text-xs font-mono px-1.5 py-0.5 rounded bg-muted/50 text-foreground">
                        {inv.target_display_code || inv.target_profile_id.slice(0, 8)}
                      </code>
                      <span className="text-sm font-medium text-foreground truncate">
                        {inv.target_full_name || inv.target_email || "—"}
                      </span>
                      <Badge variant="outline" className="text-[10px] uppercase">{inv.role}</Badge>
                    </div>
                    {inv.target_email && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{inv.target_email}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`text-[10px] ${STATUS_BADGE[inv.status]}`}>
                      {inv.status}
                    </Badge>
                    {inv.status === "pending" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-xs text-destructive hover:text-destructive"
                        onClick={() => cancel.mutate(inv.id)}
                        disabled={cancel.isPending}
                      >
                        <X className="h-3.5 w-3.5 mr-1" />
                        Cancelar
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
