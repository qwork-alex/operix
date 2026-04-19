import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Wallet, Plus, Loader2 } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useExpensesByCategory } from "@/hooks/useExpensesByCategory";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

/**
 * Aggregated expense breakdown.
 * - Pulls totals per category from financial_records (filled by Accounting modules).
 * - Allows manual financial entries (source='manual_financial') kept in their own bucket.
 * - Does NOT modify the global Expenses total used elsewhere.
 */
export default function ExpensesByCategoryCard() {
  const { formatCurrency } = useLanguage();
  const { data, isLoading } = useExpensesByCategory();
  const queryClient = useQueryClient();
  const [openManual, setOpenManual] = useState(false);
  const [form, setForm] = useState({ label: "", amount: "", notes: "" });

  const addManual = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const amount = Number(form.amount.replace(",", "."));
      if (!form.label.trim() || !Number.isFinite(amount) || amount <= 0) {
        throw new Error("Preencha descrição e valor válidos");
      }
      const { error } = await supabase.from("financial_records").insert({
        type: "expense",
        source: "manual_financial",
        category: "other",
        amount,
        label: form.label.trim(),
        notes: form.notes.trim() || null,
        status: "confirmed",
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses-by-category"] });
      queryClient.invalidateQueries({ queryKey: ["reconciliation-summary"] });
      setOpenManual(false);
      setForm({ label: "", amount: "", notes: "" });
      toast.success("Despesa manual adicionada");
    },
    onError: (e: any) => toast.error(e.message || "Erro ao adicionar"),
  });

  const buckets = data?.buckets ?? [];
  const grandTotal = data?.total ?? 0;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Wallet className="h-4 w-4 text-muted-foreground" />
          Despesas por categoria
          <span className="text-xs text-muted-foreground font-normal ml-2">
            Total: <span className="text-foreground tabular-nums">{formatCurrency(grandTotal)}</span>
          </span>
        </CardTitle>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={() => setOpenManual(true)}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Manual
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground text-xs">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            A carregar…
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
            {buckets.map((b) => (
              <div
                key={b.key}
                className="rounded-lg border p-3 transition-colors"
                style={{
                  borderColor: `hsl(${b.color} / 0.35)`,
                  background: `hsl(${b.color} / 0.06)`,
                }}
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: `hsl(${b.color})` }}
                  />
                  <span className="text-[11px] font-medium text-muted-foreground truncate">
                    {b.label}
                  </span>
                </div>
                <p className="text-base font-semibold tabular-nums text-foreground">
                  {formatCurrency(b.total)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {b.count} {b.count === 1 ? "lançamento" : "lançamentos"}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={openManual} onOpenChange={setOpenManual}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova despesa manual</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="man-label" className="text-xs">Descrição</Label>
              <Input
                id="man-label"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="Ex.: Despesa avulsa"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="man-amount" className="text-xs">Valor</Label>
              <Input
                id="man-amount"
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="man-notes" className="text-xs">Notas (opcional)</Label>
              <Textarea
                id="man-notes"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpenManual(false)}>
              Cancelar
            </Button>
            <Button onClick={() => addManual.mutate()} disabled={addManual.isPending}>
              {addManual.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
