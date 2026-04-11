import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { Bold, Italic, Check, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface BrandConfig {
  name?: string;
  fontFamily?: string;
  color?: string;
  fontSize?: string;
  bold?: boolean;
  italic?: boolean;
  logoSize?: "small" | "medium" | "large";
}

const FONTS = [
  { value: "system-ui", label: "System" },
  { value: "'Inter', sans-serif", label: "Inter" },
  { value: "'Space Grotesk', sans-serif", label: "Space Grotesk" },
  { value: "'DM Sans', sans-serif", label: "DM Sans" },
  { value: "'Sora', sans-serif", label: "Sora" },
  { value: "'Urbanist', sans-serif", label: "Urbanist" },
  { value: "'Outfit', sans-serif", label: "Outfit" },
  { value: "'JetBrains Mono', monospace", label: "JetBrains Mono" },
];

const COLORS = [
  { value: "hsl(var(--foreground))", label: "Padrão" },
  { value: "hsl(var(--primary))", label: "Primária" },
  { value: "hsl(43, 85%, 55%)", label: "Dourado" },
  { value: "hsl(210, 80%, 55%)", label: "Azul" },
  { value: "hsl(150, 60%, 50%)", label: "Verde" },
  { value: "hsl(280, 70%, 60%)", label: "Roxo" },
  { value: "hsl(0, 0%, 100%)", label: "Branco" },
];

const SIZES = [
  { value: "0.75rem", label: "Pequeno" },
  { value: "0.875rem", label: "Médio" },
  { value: "1rem", label: "Grande" },
  { value: "1.125rem", label: "Extra" },
];

const LOGO_SIZES = [
  { value: "small" as const, label: "Pequeno" },
  { value: "medium" as const, label: "Médio" },
  { value: "large" as const, label: "Grande" },
];

interface BrandNameEditorProps {
  config: BrandConfig;
  onSave: (config: BrandConfig) => void;
  children: React.ReactNode;
}

export function BrandNameEditor({ config, onSave, children }: BrandNameEditorProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<BrandConfig>(config);

  useEffect(() => {
    if (open) setDraft(config);
  }, [open, config]);

  const handleSave = () => {
    onSave(draft);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-72 p-4 space-y-3" side="right" align="start">
        <p className="text-xs font-semibold text-foreground">Personalizar nome</p>

        <div className="space-y-1.5">
          <Label className="text-[10px] text-muted-foreground">Nome</Label>
          <Input
            value={draft.name || ""}
            onChange={(e) => setDraft({ ...draft, name: e.target.value.slice(0, 24) })}
            placeholder="QWork Nexus"
            className="h-8 text-sm"
            maxLength={24}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-[10px] text-muted-foreground">Fonte</Label>
          <Select value={draft.fontFamily || "system-ui"} onValueChange={(v) => setDraft({ ...draft, fontFamily: v })}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONTS.map((f) => (
                <SelectItem key={f.value} value={f.value} className="text-xs">
                  <span style={{ fontFamily: f.value }}>{f.label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[10px] text-muted-foreground">Cor</Label>
          <div className="flex gap-1.5 flex-wrap">
            {COLORS.map((c) => (
              <button
                key={c.value}
                onClick={() => setDraft({ ...draft, color: c.value })}
                className={`h-6 w-6 rounded-full border-2 transition-all ${
                  (draft.color || COLORS[0].value) === c.value
                    ? "border-primary scale-110"
                    : "border-transparent hover:border-muted-foreground/30"
                }`}
                style={{ backgroundColor: c.value }}
                title={c.label}
              />
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[10px] text-muted-foreground">Tamanho</Label>
          <Select value={draft.fontSize || "1rem"} onValueChange={(v) => setDraft({ ...draft, fontSize: v })}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SIZES.map((s) => (
                <SelectItem key={s.value} value={s.value} className="text-xs">
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[10px] text-muted-foreground">Tamanho do logo</Label>
          <Select value={draft.logoSize || "medium"} onValueChange={(v) => setDraft({ ...draft, logoSize: v as "small" | "medium" | "large" })}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOGO_SIZES.map((s) => (
                <SelectItem key={s.value} value={s.value} className="text-xs">
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
          <Toggle
            pressed={draft.bold ?? false}
            onPressedChange={(v) => setDraft({ ...draft, bold: v })}
            size="sm"
            className="h-8 w-8 data-[state=on]:bg-primary/20"
          >
            <Bold className="h-3.5 w-3.5" />
          </Toggle>
          <Toggle
            pressed={draft.italic ?? false}
            onPressedChange={(v) => setDraft({ ...draft, italic: v })}
            size="sm"
            className="h-8 w-8 data-[state=on]:bg-primary/20"
          >
            <Italic className="h-3.5 w-3.5" />
          </Toggle>
        </div>

        {/* Preview */}
        <div className="rounded-md bg-muted/50 p-2 flex items-center justify-center">
          <span
            style={{
              fontFamily: draft.fontFamily || "system-ui",
              color: draft.color || "hsl(var(--foreground))",
              fontSize: draft.fontSize || "1rem",
              fontWeight: draft.bold ? 700 : 600,
              fontStyle: draft.italic ? "italic" : "normal",
            }}
          >
            {draft.name || "QWork Nexus"}
          </span>
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setOpen(false)}>
            <X className="h-3 w-3 mr-1" /> Cancelar
          </Button>
          <Button size="sm" className="h-7 text-xs" onClick={handleSave}>
            <Check className="h-3 w-3 mr-1" /> Aplicar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
