/**
 * IncidentGenerator — opens, updates, and resolves incidents based on
 * SystemHealth transitions + signature/realtime triggers.
 *
 * Each incident captures:
 *   - the health snapshot at open time
 *   - last 40 operational events as timeline / evidence
 *   - runtime monitor snapshot
 *   - plain-text post-mortem (`asText`) ready to copy
 *
 * The generator also pushes a high/critical alert into agentBus so
 * downstream layers (VirtualEngineer → ConversationOrchestrator →
 * Phase 10 conversational bubble) surface it to the operator.
 *
 * Strict anti-spam: per-correlation cooldown, no duplicate opens.
 */
import { SystemHealthEngine } from "./SystemHealthEngine";
import { RealtimeInspector } from "./RealtimeInspector";
import { ErrorCorrelation } from "./ErrorCorrelation";
import { RuntimeHealthMonitor } from "@/lib/observability";
import { OperationalEventBus } from "@/lib/operationalBus";
import { agentBus } from "@/lib/agentEventBus";
import type { Incident, IncidentKind, SystemHealth } from "./types";

const COOLDOWN_MS = 5 * 60_000;
const MAX_OPEN = 6;
const MAX_HISTORY = 20;

type Listener = (incidents: Incident[]) => void;

function urgencyFor(kind: IncidentKind, health: SystemHealth): Incident["urgency"] {
  if (health.grade === "red") return "critical";
  if (kind === "error_burst" || kind === "realtime_stall") return "high";
  if (health.grade === "orange") return "high";
  return "normal";
}

function asText(inc: Incident): string {
  const lines: string[] = [];
  lines.push(`# Incident ${inc.id}`);
  lines.push(`Kind: ${inc.kind}`);
  lines.push(`Status: ${inc.status} · Urgency: ${inc.urgency}`);
  lines.push(`Opened: ${new Date(inc.openedAt).toISOString()}`);
  lines.push(`Health at open: ${inc.healthAtOpen.score}/100 (${inc.healthAtOpen.grade})`);
  if (inc.healthAtOpen.reasons.length) {
    lines.push("Reasons:");
    inc.healthAtOpen.reasons.forEach((r) => lines.push(`  - ${r}`));
  }
  lines.push("");
  lines.push(inc.detail ?? inc.title);
  lines.push("");
  lines.push("Timeline:");
  inc.timeline.slice(-15).forEach((t) =>
    lines.push(`  ${new Date(t.at).toISOString()} [${t.severity}] ${t.source}: ${t.text}`),
  );
  return lines.join("\n");
}

class Generator {
  private started = false;
  private open = new Map<string, Incident>();
  private history: Incident[] = [];
  private lastOpenAt = new Map<string, number>();
  private listeners = new Set<Listener>();
  private prevGrade: SystemHealth["grade"] = "green";

  start() {
    if (this.started || typeof window === "undefined") return;
    this.started = true;
    SystemHealthEngine.start();

    SystemHealthEngine.subscribe((h) => this.evaluate(h));

    // Direct triggers from underlying monitors (don't wait for health math)
    ErrorCorrelation.subscribe((sigs) => {
      const burst = sigs.find((s) => s.burst);
      if (burst) {
        this.openIfFresh({
          kind: "error_burst",
          correlationKey: `errburst:${burst.signature}`,
          title: `Burst de erros: ${burst.message.slice(0, 80)}`,
          detail: `${burst.count} ocorrências, fontes: ${burst.sources.join(", ")}`,
        });
      }
    });

    RealtimeInspector.subscribe((rt) => {
      if (rt.suspectStall) {
        this.openIfFresh({
          kind: "realtime_stall",
          correlationKey: "realtime:stall",
          title: "Realtime sem eventos",
          detail: `Sem atividade há ${Math.round(rt.silenceMs / 1000)}s com ${rt.channelsOpen} canais abertos.`,
        });
      } else {
        this.tryResolve("realtime:stall");
      }
    });
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn([...this.open.values()]);
    return () => this.listeners.delete(fn);
  }

  getOpen(): Incident[] { return [...this.open.values()]; }
  getHistory(): Incident[] { return [...this.history]; }

  private evaluate(h: SystemHealth) {
    // System-wide unhealthy → open umbrella incident on grade drop
    if (
      (h.grade === "red" || h.grade === "orange") &&
      this.prevGrade !== h.grade
    ) {
      this.openIfFresh({
        kind: "system_unhealthy",
        correlationKey: `system:${h.grade}`,
        title: `Sistema ${h.grade === "red" ? "crítico" : "instável"} (${h.score}/100)`,
        detail: h.reasons.join(" · "),
      });
    } else if (h.grade === "green" || h.grade === "yellow") {
      // recovery — close any system_unhealthy umbrella
      this.tryResolve("system:red");
      this.tryResolve("system:orange");
    }
    this.prevGrade = h.grade;
  }

  private openIfFresh(seed: { kind: IncidentKind; correlationKey: string; title: string; detail?: string }) {
    if (this.open.has(seed.correlationKey)) return;
    const last = this.lastOpenAt.get(seed.correlationKey) ?? 0;
    if (Date.now() - last < COOLDOWN_MS) return;
    if (this.open.size >= MAX_OPEN) return;

    const health = SystemHealthEngine.current();
    const buffer = OperationalEventBus.getBuffer().slice(-40);
    const inc: Incident = {
      id: `inc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      kind: seed.kind,
      status: "open",
      urgency: urgencyFor(seed.kind, health),
      title: seed.title,
      detail: seed.detail,
      openedAt: Date.now(),
      correlationKey: seed.correlationKey,
      timeline: buffer.map((e) => ({
        at: e.occurredAt, severity: e.severity, source: e.source, text: e.title,
      })),
      healthAtOpen: health,
      evidence: buffer,
      runtime: RuntimeHealthMonitor.getSnapshot(),
      asText: "",
    };
    inc.asText = asText(inc);
    this.open.set(seed.correlationKey, inc);
    this.lastOpenAt.set(seed.correlationKey, inc.openedAt);
    this.notify();

    // Push into agentBus so the conversational layer can surface it.
    agentBus.emit({
      kind: "operational_alert",
      level: inc.urgency === "critical" ? "error" : "warn",
      title: inc.title,
      detail: inc.detail,
    });
  }

  private tryResolve(correlationKey: string) {
    const inc = this.open.get(correlationKey);
    if (!inc) return;
    inc.status = "resolved";
    inc.closedAt = Date.now();
    this.open.delete(correlationKey);
    this.history.push(inc);
    if (this.history.length > MAX_HISTORY) this.history.splice(0, this.history.length - MAX_HISTORY);
    this.notify();
  }

  /** External resolve (e.g. user marks as handled). */
  resolve(id: string) {
    for (const [k, inc] of this.open) if (inc.id === id) return this.tryResolve(k);
  }

  private notify() {
    const open = [...this.open.values()];
    this.listeners.forEach((fn) => { try { fn(open); } catch { /* noop */ } });
  }
}

export const IncidentGenerator = new Generator();
