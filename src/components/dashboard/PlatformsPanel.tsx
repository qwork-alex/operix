import { useState } from "react";
import { usePlatforms, type Platform, type PlatformState } from "@/hooks/usePlatforms";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Activity, PauseCircle, Archive, AlertTriangle, Plus, Play, Radio } from "lucide-react";

const STATE_META: Record<PlatformState, { label: string; cls: string; icon: any }> = {
  active: { label: "Ativa", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: Activity },
  paused: { label: "Pausada", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30", icon: PauseCircle },
  archived: { label: "Arquivada", cls: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30", icon: Archive },
  degraded: { label: "Degradada", cls: "bg-rose-500/15 text-rose-400 border-rose-500/30", icon: AlertTriangle },
};

function timeAgo(ts: string | null): string {
  if (!ts) return "—";
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `há ${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

function PlatformCard({ p }: { p: Platform }) {
  const { setState } = usePlatforms();
  const meta = STATE_META[p.state];
  const Icon = meta.icon;
  const isPulsing = p.state === "active";

  return (
    <div className="glass-panel rounded-xl p-4 space-y-3 transition-all hover:border-primary/40">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`relative h-2.5 w-2.5 rounded-full ${
            p.state === "active" ? "bg-emerald-400" :
            p.state === "paused" ? "bg-amber-400" :
            p.state === "degraded" ? "bg-rose-400" : "bg-zinc-500"
          }`}>
            {isPulsing && <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75" />}
          </div>
          <h3 className="font-semibold truncate">{p.name}</h3>
        </div>
        <Badge variant="outline" className={`${meta.cls} text-[10px] uppercase tracking-wider gap-1`}>
          <Icon className="h-3 w-3" />
          {meta.label}
        </Badge>
      </div>

      <div className="text-xs text-muted-foreground flex items-center gap-2">
        <Radio className="h-3 w-3" />
        Heartbeat: {timeAgo(p.last_heartbeat_at)} · Ingest: {timeAgo(p.last_ingest_at)}
      </div>

      <div className="flex gap-1.5 pt-1">
        {p.state !== "active" && (
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
            onClick={() => setState.mutate({ id: p.id, state: "active" })}>
            <Play className="h-3 w-3" /> Ativar
          </Button>
        )}
        {p.state === "active" && (
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
            onClick={() => setState.mutate({ id: p.id, state: "paused" })}>
            <PauseCircle className="h-3 w-3" /> Pausar
          </Button>
        )}
        {p.state !== "archived" && (
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-muted-foreground"
            onClick={() => setState.mutate({ id: p.id, state: "archived" })}>
            <Archive className="h-3 w-3" /> Arquivar
          </Button>
        )}
      </div>
    </div>
  );
}

export function PlatformsPanel() {
  const { platforms, isLoading, create } = usePlatforms();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const visible = platforms.filter((p) => p.state !== "archived");

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Plataformas operacionais</h2>
          <p className="text-xs text-muted-foreground">Lifecycle e heartbeat em tempo real</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Nova
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova plataforma</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Nome (ex.: Lyon)" value={name} onChange={(e) => setName(e.target.value)} />
              <Button className="w-full" disabled={!name.trim() || create.isPending}
                onClick={() => create.mutate({ name }, { onSuccess: () => { setName(""); setOpen(false); } })}>
                Criar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">A carregar…</div>
      ) : visible.length === 0 ? (
        <div className="glass-panel rounded-xl p-6 text-center text-sm text-muted-foreground">
          Nenhuma plataforma activa. Cria a primeira.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visible.map((p) => <PlatformCard key={p.id} p={p} />)}
        </div>
      )}
    </section>
  );
}
