import { Folder, BarChart3 } from "lucide-react";

interface Props {
  icon: "folder" | "chart";
  title: string;
  subtitle?: string;
  hint?: string;
}

/**
 * Phase B placeholder — rendered when the tree's active section is
 * "documentos" or "relatorios". No editor, no preview, no workflow yet.
 * Pure visual scaffolding so the canvas reacts to the lateral tree.
 */
export function SectionPlaceholder({ icon, title, subtitle, hint }: Props) {
  const Icon = icon === "folder" ? Folder : BarChart3;
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <Icon className="h-10 w-10 text-muted-foreground/50" />
      <h2 className="text-base font-medium text-foreground">{title}</h2>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      {hint && (
        <p className="max-w-sm text-xs text-muted-foreground/80">{hint}</p>
      )}
      <span className="mt-1 rounded-sm bg-muted/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        Em breve
      </span>
    </div>
  );
}
