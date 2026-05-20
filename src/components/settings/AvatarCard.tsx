import { useCallback, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Camera, ImageIcon, Loader2, Trash2, Upload, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { useUserAvatar } from "@/hooks/useUserAvatar";
import { useUserProfile } from "@/hooks/useUserProfile";

const ACCEPT = "image/png,image/jpeg,image/jpg,image/webp";
const MAX_BYTES = 5 * 1024 * 1024;

export function AvatarCard() {
  const { profile } = useUserProfile();
  const { upload, remove } = useUserAvatar();
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const handleFile = useCallback(async (file?: File | null) => {
    if (!file) return;
    if (!ACCEPT.split(",").includes(file.type)) {
      toast.error("Formato não suportado. Use PNG, JPG ou WEBP.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Ficheiro demasiado grande (máx. 5MB).");
      return;
    }
    const local = URL.createObjectURL(file);
    setPreview(local);
    try {
      await upload.mutateAsync(file);
      toast.success("Foto de perfil atualizada");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao enviar foto");
    } finally {
      setTimeout(() => URL.revokeObjectURL(local), 2000);
      setPreview(null);
    }
  }, [upload]);

  const url = preview || profile?.avatar_url || "";

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-primary" />
          Foto de perfil
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-[160px_1fr] gap-6 items-start">
          <div className="flex flex-col items-center gap-2">
            <div className="h-[140px] w-[140px] rounded-full border border-border/60 bg-muted/30 flex items-center justify-center overflow-hidden shadow-sm">
              {url ? (
                <img src={url} alt="Avatar" className="h-full w-full object-cover" />
              ) : (
                <UserIcon className="h-12 w-12 text-muted-foreground/40" />
              )}
            </div>
            <p className="text-[10px] text-muted-foreground text-center">PNG, JPG ou WEBP · até 5MB</p>
          </div>

          <div className="space-y-3">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }}
              onClick={() => fileRef.current?.click()}
              className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
                dragOver ? "border-primary bg-primary/5" : "border-border/60 hover:border-primary/50 hover:bg-muted/30"
              }`}
            >
              <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm font-medium">Arraste uma imagem ou clique para enviar</p>
              <p className="text-xs text-muted-foreground mt-1">Esta imagem será o seu avatar pessoal</p>
            </div>

            <input ref={fileRef} type="file" accept={ACCEPT} className="hidden"
              onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }} />
            <input ref={camRef} type="file" accept="image/*" capture="user" className="hidden"
              onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }} />

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={upload.isPending || remove.isPending}>
                <ImageIcon className="h-4 w-4 mr-1.5" /> Galeria
              </Button>
              <Button size="sm" variant="outline" onClick={() => camRef.current?.click()} disabled={upload.isPending || remove.isPending}>
                <Camera className="h-4 w-4 mr-1.5" /> Câmara
              </Button>
              {profile?.avatar_url && (
                <Button size="sm" variant="outline" className="text-destructive hover:text-destructive"
                  onClick={() => remove.mutateAsync().then(() => toast.success("Foto removida")).catch((e) => toast.error(e?.message || "Erro"))}
                  disabled={upload.isPending || remove.isPending}>
                  {remove.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1.5" />}
                  Remover
                </Button>
              )}
              {upload.isPending && (
                <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" /> A enviar…
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
