import { useState } from "react";
import { X, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";

export interface ModuleEntry {
  id: string;
  label: string;
  amount: number;
  notes?: string;
  created_at: string;
  editable: boolean;
}

interface ModulePanelProps {
  title: string;
  color: string;
  entries: ModuleEntry[];
  total: number;
  isLoading: boolean;
  isOpen: boolean;
  onClose: () => void;
  onAdd: (entry: { label: string; amount: number; notes: string }) => Promise<void>;
  onUpdate: (id: string, entry: { label: string; amount: number; notes: string }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  allowAdd?: boolean;
}

export function ModulePanel({
  title,
  color,
  entries,
  total,
  isLoading,
  isOpen,
  onClose,
  onAdd,
  onUpdate,
  onDelete,
  allowAdd = true,
}: ModulePanelProps) {
  const { formatCurrency } = useLanguage();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ label: "", amount: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setForm({ label: "", amount: "", notes: "" });
    setEditId(null);
    setShowForm(false);
  };

  const handleSave = async () => {
    if (!form.label || !form.amount) return;
    setSaving(true);
    try {
      if (editId) {
        await onUpdate(editId, { label: form.label, amount: parseFloat(form.amount), notes: form.notes });
      } else {
        await onAdd({ label: form.label, amount: parseFloat(form.amount), notes: form.notes });
      }
      resetForm();
    } catch (e) {
      console.error("Save error:", e);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (entry: ModuleEntry) => {
    setEditId(entry.id);
    setForm({ label: entry.label, amount: String(entry.amount), notes: entry.notes || "" });
    setShowForm(true);
  };

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        "fixed right-0 top-0 h-full w-[380px] z-50 border-l bg-card/95 backdrop-blur-md",
        "animate-slide-in-right flex flex-col"
      )}
      style={{ borderColor: `hsl(${color} / 0.2)` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border/50">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: `hsl(${color})` }}>
            {title}
          </h2>
          <p className="text-2xl font-bold text-foreground mt-1">
            {formatCurrency(total)}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X size={18} />
        </Button>
      </div>

      {/* Add button */}
      {allowAdd && !showForm && (
        <div className="p-3 border-b border-border/30">
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2 border-dashed"
            onClick={() => { resetForm(); setShowForm(true); }}
          >
            <Plus size={14} /> Adicionar
          </Button>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="p-3 border-b border-border/30 space-y-2">
          <Input
            placeholder="Descrição"
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
          />
          <Input
            placeholder="Valor"
            type="number"
            step="0.01"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
          />
          <Input
            placeholder="Notas (opcional)"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 size={14} className="animate-spin mr-1" />}
              {editId ? "Atualizar" : "Salvar"}
            </Button>
            <Button size="sm" variant="ghost" onClick={resetForm}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Entries list */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            Nenhum registro encontrado
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="group flex items-center justify-between p-3 rounded-lg hover:bg-muted/30 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{entry.label}</p>
                  {entry.notes && (
                    <p className="text-xs text-muted-foreground truncate">{entry.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-2">
                  <span className="text-sm font-semibold whitespace-nowrap" style={{ color: `hsl(${color})` }}>
                    {formatCurrency(entry.amount)}
                  </span>
                  {entry.editable && (
                    <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                      <button onClick={() => startEdit(entry)} className="p-1 hover:text-primary">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => onDelete(entry.id)} className="p-1 hover:text-destructive">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
