import { useMemo, useState } from "react";
import { FileCheck2, Plus, Loader2, Trash2, GripVertical } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCountryDocumentRequirements, useConfiguredCountries } from "@/hooks/useCountryDocumentRequirements";

export default function CountryDocumentRequirementsPage() {
  const { data: countries = [] } = useConfiguredCountries();
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [newCountryName, setNewCountryName] = useState("");
  const [newDocumentName, setNewDocumentName] = useState("");

  const effectiveCountry = selectedCountry ?? countries[0] ?? null;

  const { requirements, isLoading, create, update } = useCountryDocumentRequirements(effectiveCountry ?? undefined, true);

  const activeRequirements = useMemo(() => requirements.filter((r) => r.active), [requirements]);

  async function handleAddDocument() {
    const country = effectiveCountry ?? newCountryName.trim();
    if (!country || !newDocumentName.trim()) return;
    await create.mutateAsync({ country, document_name: newDocumentName.trim(), sort_order: activeRequirements.length + 1 });
    setNewDocumentName("");
    if (!effectiveCountry) {
      setSelectedCountry(country);
      setNewCountryName("");
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <FileCheck2 className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold">Documentos por País</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Configure aqui a lista de documentos exigidos de Técnicos e Prestadores de Serviços Operacionais, por país.
        Os nomes dos documentos podem variar conforme o país — edite livremente.
      </p>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5 min-w-[220px]">
              <label className="text-xs uppercase tracking-wide text-muted-foreground">País</label>
              <Select value={effectiveCountry ?? ""} onValueChange={setSelectedCountry}>
                <SelectTrigger><SelectValue placeholder="Selecione um país" /></SelectTrigger>
                <SelectContent>
                  {countries.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!effectiveCountry && (
              <div className="space-y-1.5 min-w-[220px]">
                <label className="text-xs uppercase tracking-wide text-muted-foreground">Ou criar novo país</label>
                <Input value={newCountryName} onChange={(e) => setNewCountryName(e.target.value)} placeholder="Bélgica" />
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-2">
              {activeRequirements.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhum documento configurado {effectiveCountry ? `para ${effectiveCountry}` : "ainda"}.
                </p>
              ) : (
                activeRequirements
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((req) => (
                    <div key={req.id} className="flex items-center justify-between rounded-md border p-2.5">
                      <div className="flex items-center gap-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{req.document_name}</span>
                        <Badge variant="outline" className="text-[10px]">{req.country}</Badge>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => update.mutate({ id: req.id, active: false })}
                        title="Remover (mantém documentos já anexados por Pessoas cadastradas)"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  ))
              )}

              <div className="flex items-end gap-2 pt-2">
                <div className="flex-1 space-y-1.5">
                  <label className="text-xs uppercase tracking-wide text-muted-foreground">Novo documento</label>
                  <Input
                    value={newDocumentName}
                    onChange={(e) => setNewDocumentName(e.target.value)}
                    placeholder="Ex.: Certificado de seguro profissional"
                  />
                </div>
                <Button onClick={handleAddDocument} disabled={create.isPending || (!effectiveCountry && !newCountryName.trim())}>
                  {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  Adicionar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
