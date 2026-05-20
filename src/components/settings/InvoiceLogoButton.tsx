import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { useCompanyLogo } from "@/hooks/useCompanyLogo";
import { ImageIcon, Loader2, Upload, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

const ACCEPT = "image/png,image/jpeg,image/jpg,image/webp,image/svg+xml";
const MAX_BYTES = 5 * 1024 * 1024;

/** Compact logo upload control intended for the invoice editor header. */
export function InvoiceLogoButton() {
  const { logoUrl, isLoading, uploadLogo, isUploading, removeLogo, isRemoving } = useCompanyLogo();
  const inputRef = useRef<HTMLInputElement>(null);

  const onPick = async (file: File | null | undefined) => {
    if (!file) return;
    if (!ACCEPT.split(",").includes(file.type)) {
      toast.error("Formato não suportado");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Ficheiro demasiado grande (máx. 5MB)");
      return;
    }
    try {
      await uploadLogo(file);
      toast.success("Logótipo da fatura atualizado");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao enviar");
    }
  };

  const busy = isUploading || isRemoving || isLoading;

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = ""; }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 px-2" title="Logótipo da fatura">
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : logoUrl ? (
              <img src={logoUrl} alt="logo" className="h-4 w-4 object-contain" />
            ) : (
              <ImageIcon className="h-3.5 w-3.5" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-card border-border w-52">
          <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            Logótipo da fatura
          </div>
          <DropdownMenuItem onClick={() => inputRef.current?.click()} className="text-xs cursor-pointer">
            <Upload className="h-3.5 w-3.5 mr-2" />
            {logoUrl ? "Substituir logótipo" : "Carregar logótipo"}
          </DropdownMenuItem>
          {logoUrl && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => removeLogo().then(() => toast.success("Logótipo removido")).catch((e) => toast.error(e?.message || "Erro"))}
                className="text-xs cursor-pointer text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Remover
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
