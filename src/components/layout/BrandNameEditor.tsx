import { useState, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Bold, Italic } from "lucide-react";

export interface BrandConfig {
  name?: string;
  fontFamily?: string;
  color?: string;
  fontSize?: string;
  bold?: boolean;
  italic?: boolean;
  logoSize?: "small" | "medium" | "large";
  logoSizeNum?: number;
  glowIntensity?: number;
}

const FONTS = [
  "Inter", "Space Grotesk", "JetBrains Mono", "Poppins", "Montserrat",
  "Raleway", "Outfit", "Sora", "Urbanist", "DM Sans",
  "Playfair Display", "Cormorant", "Bebas Neue", "Archivo Black",
  "Orbitron", "Rajdhani", "Exo 2", "Audiowide", "Michroma", "Oxanium",
];

export function BrandNameEditor({
  config,
  onSave,
  children,
}: {
  config: BrandConfig;
  onSave: (c: BrandConfig) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<BrandConfig>(config);

  useEffect(() => {
    if (open) setDraft(config);
  }, [open, config]);

  const handleSave = () => {
    onSave(draft);
    setOpen(false);
  };

  const fontSize = parseInt(draft.fontSize || "16", 10);
  const glowIntensity = draft.glowIntensity ?? 0;
  const logoSizeNum = draft.logoSizeNum ?? 32;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-80 max-h-[80vh] overflow-y-auto bg-card border-border" side="right" align="start">
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-foreground">Personalizar marca</h4>

          {/* Name */}
          <div className="space-y-1">
            <Label className="text-xs">Nome</Label>
            <Input
              value={draft.name || ""}
              onChange={(e) => setDraft({ ...draft, name: e.target.value.slice(0, 30) })}
              maxLength={30}
              className="h-8 text-sm bg-muted/30 border-border"
            />
          </div>

          {/* Font */}
          <div className="space-y-1">
            <Label className="text-xs">Fonte</Label>
            <div className="grid grid-cols-2 gap-1 max-h-32 overflow-y-auto rounded border border-border p-1">
              {FONTS.map((f) => (
                <button
                  key={f}
                  onClick={() => setDraft({ ...draft, fontFamily: f })}
                  className={`text-[11px] px-2 py-1 rounded text-left transition-colors truncate ${
                    draft.fontFamily === f ? "bg-primary/20 text-primary" : "hover:bg-muted/50 text-muted-foreground"
                  }`}
                  style={{ fontFamily: f }}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Color picker */}
          <div className="space-y-1">
            <Label className="text-xs">Cor (HEX)</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={draft.color || "#e2dcc8"}
                onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                className="h-8 w-10 rounded border border-border cursor-pointer bg-transparent"
              />
              <Input
                value={draft.color || "#e2dcc8"}
                onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                className="h-8 text-xs flex-1 bg-muted/30 border-border font-mono"
                maxLength={7}
              />
            </div>
          </div>

          {/* Glow intensity */}
          <div className="space-y-1">
            <Label className="text-xs">Brilho (glow): {glowIntensity}px</Label>
            <Slider
              value={[glowIntensity]}
              onValueChange={([v]) => setDraft({ ...draft, glowIntensity: v })}
              min={0}
              max={30}
              step={1}
            />
          </div>

          {/* Font size */}
          <div className="space-y-1">
            <Label className="text-xs">Tamanho do texto: {fontSize}px</Label>
            <Slider
              value={[fontSize]}
              onValueChange={([v]) => setDraft({ ...draft, fontSize: `${v}px` })}
              min={12}
              max={48}
              step={1}
            />
          </div>

          {/* Bold / Italic */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant={draft.bold ? "default" : "outline"}
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setDraft({ ...draft, bold: !draft.bold })}
            >
              <Bold className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant={draft.italic ? "default" : "outline"}
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setDraft({ ...draft, italic: !draft.italic })}
            >
              <Italic className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Logo size */}
          <div className="space-y-1">
            <Label className="text-xs">Tamanho do logo: {logoSizeNum}px</Label>
            <Slider
              value={[logoSizeNum]}
              onValueChange={([v]) => setDraft({ ...draft, logoSizeNum: v })}
              min={16}
              max={80}
              step={2}
            />
          </div>

          {/* Preview */}
          <div className="rounded-lg bg-muted/30 p-3">
            <Label className="text-[10px] text-muted-foreground">Preview</Label>
            <div className="flex items-center gap-2 mt-1">
              <div
                className="shrink-0 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-xs"
                style={{ width: logoSizeNum, height: logoSizeNum }}
              >
                Q
              </div>
              <span
                style={{
                  fontFamily: draft.fontFamily || undefined,
                  color: draft.color || undefined,
                  fontSize: draft.fontSize || undefined,
                  fontWeight: draft.bold ? 700 : 400,
                  fontStyle: draft.italic ? "italic" : undefined,
                  textShadow: glowIntensity > 0 ? `0 0 ${glowIntensity}px ${draft.color || "#fff"}` : undefined,
                }}
              >
                {draft.name || "QWork Nexus"}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={handleSave}>
              Aplicar
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
