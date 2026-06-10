import { useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api";
import { isStripeConfigured } from "@/lib/stripe";
import { useWorkspace } from "@/hooks/useWorkspace";
import { toast } from "sonner";

interface Props {
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
  label?: string;
}

export function StripePortalButton({ variant = "outline", size = "sm", label = "Gerir subscrição" }: Props) {
  const { workspaceId } = useWorkspace();
  const [loading, setLoading] = useState(false);

  if (!isStripeConfigured() || !workspaceId) return null;

  async function open() {
    setLoading(true);
    try {
      const data = await apiRequest<{ requires_checkout?: boolean; message?: string | null; url?: string | null }>(
        `/billing/workspaces/${workspaceId}/portal-session`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            return_url: `${window.location.origin}/subscription`,
          }),
        },
      );
      if (data?.requires_checkout || !data?.url) {
        toast.info(data?.message || "Sem subscrição ativa para gerir.");
        return;
      }
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast.error(e.message ?? "Não foi possível abrir o portal");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant={variant} size={size} onClick={open} disabled={loading}>
      {loading ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5 mr-2" />}
      {label}
    </Button>
  );
}
