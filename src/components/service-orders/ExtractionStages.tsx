import { Upload, Pencil, CheckCircle2, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";

export type Stage = "upload" | "review" | "validate" | "save";

const stages: { key: Stage; icon: typeof Upload }[] = [
  { key: "upload", icon: Upload },
  { key: "review", icon: Pencil },
  { key: "validate", icon: CheckCircle2 },
  { key: "save", icon: Save },
];

const stageIndex = (s: Stage) => stages.findIndex((x) => x.key === s);

export function ExtractionStages({ current }: { current: Stage }) {
  const { t } = useLanguage();
  const ci = stageIndex(current);

  return (
    <div className="flex items-center gap-1 sm:gap-2">
      {stages.map((s, i) => {
        const Icon = s.icon;
        const done = i < ci;
        const active = i === ci;
        return (
          <div key={s.key} className="flex items-center gap-1 sm:gap-2">
            {i > 0 && (
              <div
                className={cn(
                  "h-px w-4 sm:w-8 transition-colors",
                  done ? "bg-primary" : "bg-border"
                )}
              />
            )}
            <div
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all",
                active && "bg-primary text-primary-foreground shadow-sm",
                done && "bg-primary/10 text-primary",
                !active && !done && "bg-secondary/50 text-muted-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">
                {t(`stage.${s.key}`)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
