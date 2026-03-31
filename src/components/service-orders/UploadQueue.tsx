import { CheckCircle2, Loader2, AlertCircle, Clock, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";
import type { QueueItem, QueueItemStatus } from "@/hooks/useFileQueue";

const statusConfig: Record<QueueItemStatus, { icon: typeof Loader2; color: string; labelKey: string }> = {
  pending: { icon: Clock, color: "text-muted-foreground", labelKey: "queue.pending" },
  uploading: { icon: Upload, color: "text-blue-400", labelKey: "queue.uploading" },
  processing: { icon: Loader2, color: "text-amber-400", labelKey: "queue.processing" },
  completed: { icon: CheckCircle2, color: "text-emerald-400", labelKey: "queue.completed" },
  error: { icon: AlertCircle, color: "text-destructive", labelKey: "queue.error" },
};

interface Props {
  queue: QueueItem[];
  onClearCompleted: () => void;
}

export function UploadQueue({ queue, onClearCompleted }: Props) {
  const { t } = useLanguage();

  if (queue.length === 0) return null;

  const completedCount = queue.filter(q => q.status === "completed").length;
  const totalCount = queue.length;

  return (
    <div className="rounded-lg border border-border/50 bg-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">
          {t("queue.title")} ({completedCount}/{totalCount})
        </span>
        {completedCount > 0 && (
          <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={onClearCompleted}>
            {t("queue.clearDone")}
          </Button>
        )}
      </div>
      <div className="space-y-1">
        {queue.map(item => {
          const cfg = statusConfig[item.status];
          const Icon = cfg.icon;
          const spinning = item.status === "processing" || item.status === "uploading";
          return (
            <div key={item.id} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-secondary/30">
              <Icon className={cn("h-3.5 w-3.5 shrink-0", cfg.color, spinning && "animate-spin")} />
              <span className="truncate flex-1 text-foreground">{item.file.name}</span>
              <span className={cn("text-[10px] shrink-0", cfg.color)}>{t(cfg.labelKey)}</span>
              {item.error && (
                <span className="text-[10px] text-destructive truncate max-w-[120px]" title={item.error}>
                  {item.error}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
