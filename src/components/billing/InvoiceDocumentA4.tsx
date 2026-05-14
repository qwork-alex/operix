/**
 * InvoiceDocumentA4
 * ─────────────────
 * Renderização ISOLADA do documento fiscal em A4 portrait (210×297 mm).
 * Independente de modal, sidebar e qualquer cromo do app.
 *
 * Inspiração visual: Tiime, Pennylane, Indy, Qonto.
 *
 * Layout (top → bottom):
 *   1. HEADER
 *      ├─ Esquerda: logo + empresa + telefone + email
 *      └─ Direita : dados do cliente (nome, endereço, VAT)
 *   2. TÍTULO
 *      └─ "N° 000032 — TÍTULO DA FATURA" (alinhado à esquerda)
 *   3. TABELA DE ITENS
 *   4. TOTAIS
 *   5. OBSERVAÇÕES / TEXTO LEGAL
 *   6. DATAS (emissão / vencimento / condições)
 *   7. RODAPÉ centralizado: empresa · SIRET · TVA · IBAN · BIC
 */

import { format, parseISO } from "date-fns";

// ── A4 dimensions (mm) — fixos, não responsivos
export const A4 = {
  width:  "210mm",
  height: "297mm",
  pad:    "16mm 14mm",
} as const;

type Item = {
  id: string;
  designation: string;
  quantity: number | string;
  unit?: string;
  unit_price: number | string;
  tax_rate: number | string;
};

type DocClient = {
  name?: string | null;
  address?: string | null;
  address_complement?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country?: string | null;
  email?: string | null;
  phone?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  tva_intracom?: string | null;
  siret?: string | null;
  siren?: string | null;
  tax_id?: string | null;
};

type DocCompany = {
  company_name?: string | null;
  address?: string | null;
  siret?: string | null;
  tva_number?: string | null;
  logo_url?: string | null;
  phone?: string | null;
  email?: string | null;
  bank_iban?: string | null;
  bank_bic?: string | null;
  bank_name?: string | null;
};

type DocOptions = {
  doc_title?: string;
  show_doc_title?: boolean;
  show_payment_terms?: boolean;
  show_tva?: boolean;
  show_siret_vat?: boolean;
  show_discount?: boolean;
  discount_type?: "percent" | "amount";
  discount_value?: number;
  show_bank_details?: boolean;
  show_notes?: boolean;
  show_client_reference?: boolean;
  client_reference?: string;
};

type DocForm = {
  invoice_number: string;
  issue_date: string;
  due_date: string;
  payment_term?: string;
  payment_term_label?: string;
  items: Item[];
  notes?: string;
  legal_text?: string;
  bank_iban?: string;
  bank_bic?: string;
  bank_name?: string;
  options: DocOptions;
};

type Totals = {
  subtotal: number;
  discount: number;
  netSubtotal: number;
  tax: number;
  total: number;
};

interface InvoiceDocumentA4Props {
  form: DocForm;
  totals: Totals;
  client: DocClient | null;
  company: DocCompany | null;
  brandName: string;
  brandLogo: string;
}

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(Number.isFinite(n) ? n : 0);

const fmtDate = (d?: string | null) => {
  if (!d) return "—";
  try { return format(parseISO(d), "dd/MM/yyyy"); } catch { return d; }
};

const joinAddr = (parts: (string | null | undefined)[]) =>
  parts.map((p) => (p ?? "").trim()).filter(Boolean).join(", ");

export function InvoiceDocumentA4({
  form, totals, client, company, brandName, brandLogo,
}: InvoiceDocumentA4Props) {
  const opt = form.options ?? {};
  const companyName  = company?.company_name || brandName;
  const companyAddr  = company?.address || "";
  const companySiret = company?.siret || "";
  const companyTva   = company?.tva_number || "";
  const companyLogo  = company?.logo_url || brandLogo;
  const companyPhone = (company as any)?.phone || "";
  const companyEmail = (company as any)?.email || "";
  const companyIban  = (company as any)?.bank_iban || form.bank_iban || "";
  const companyBic   = (company as any)?.bank_bic  || form.bank_bic  || "";

  const docTitle = (opt.show_doc_title === false ? "Fatura" : (opt.doc_title || "Fatura")).toUpperCase();
  const paymentLabel = form.payment_term_label ?? "—";

  // Group items by tax rate for the VAT summary
  const taxBuckets = new Map<number, number>();
  const ratio = totals.subtotal > 0 ? totals.netSubtotal / totals.subtotal : 1;
  form.items.forEach((it) => {
    const net = (Number(it.quantity) || 0) * (Number(it.unit_price) || 0) * ratio;
    const t = Number(it.tax_rate) || 0;
    taxBuckets.set(t, (taxBuckets.get(t) || 0) + net * (t / 100));
  });

  // Client display
  const clientLines = client ? [
    client.address,
    client.address_complement,
    [client.postal_code, client.city].filter(Boolean).join(" "),
    client.country,
  ].filter(Boolean) as string[] : [];

  return (
    <div
      className="invoice-a4-doc bg-white text-zinc-900 shadow-2xl print:shadow-none mx-auto"
      style={{
        width:    A4.width,
        minHeight: A4.height,
        padding:  A4.pad,
        paddingBottom: "28mm",
        boxSizing: "border-box",
        position: "relative",
        fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
        fontSize: "10.5px",
        lineHeight: 1.45,
        color: "#18181b",
      }}
    >
      {/* ═══════════ 1. HEADER ═══════════ */}
      <header className="flex items-start justify-between gap-10">
        {/* LEFT — empresa */}
        <div className="flex items-start gap-3 min-w-0" style={{ maxWidth: "55%" }}>
          {companyLogo && (
            <img
              src={companyLogo}
              alt={companyName}
              style={{ height: "44px", width: "44px", objectFit: "contain", flexShrink: 0 }}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          )}
          <div className="min-w-0">
            <p style={{ fontSize: "13px", fontWeight: 700, letterSpacing: "-0.01em", color: "#0a0a0a" }}>
              {companyName}
            </p>
            {companyAddr && (
              <p style={{ fontSize: "9.5px", color: "#52525b", marginTop: "2px", whiteSpace: "pre-line" }}>
                {companyAddr}
              </p>
            )}
            <div style={{ marginTop: "4px", fontSize: "9.5px", color: "#52525b" }}>
              {companyPhone && <div>Tel: {companyPhone}</div>}
              {companyEmail && <div>{companyEmail}</div>}
            </div>
          </div>
        </div>

        {/* RIGHT — cliente */}
        <div className="text-right" style={{ maxWidth: "45%" }}>
          <p style={{ fontSize: "8px", letterSpacing: "0.18em", color: "#a1a1aa", fontWeight: 600, textTransform: "uppercase" }}>
            Faturado a
          </p>
          {client ? (
            <div style={{ marginTop: "4px" }}>
              <p style={{ fontSize: "11.5px", fontWeight: 600, color: "#0a0a0a" }}>{client.name || "—"}</p>
              {clientLines.length > 0 && (
                <p style={{ fontSize: "9.5px", color: "#52525b", marginTop: "2px", lineHeight: 1.4 }}>
                  {clientLines.join(", ")}
                </p>
              )}
              <div style={{ fontSize: "9px", color: "#71717a", marginTop: "3px" }}>
                {(client.email || client.contact_email) && <div>{client.email ?? client.contact_email}</div>}
                {(client.phone || client.contact_phone) && <div>{client.phone ?? client.contact_phone}</div>}
              </div>
              <div style={{ fontSize: "9px", color: "#52525b", marginTop: "4px" }}>
                {opt.show_tva !== false && client.tva_intracom && (
                  <div>TVA: <span style={{ color: "#27272a" }}>{client.tva_intracom}</span></div>
                )}
                {opt.show_siret_vat !== false && (client.siret || client.siren || client.tax_id) && (
                  <div>SIRET / VAT: <span style={{ color: "#27272a" }}>{client.siret || client.siren || client.tax_id}</span></div>
                )}
              </div>
            </div>
          ) : (
            <p style={{ fontSize: "10px", color: "#a1a1aa", fontStyle: "italic", marginTop: "4px" }}>
              Cliente não selecionado
            </p>
          )}
        </div>
      </header>

      {/* ═══════════ 2. TÍTULO + NÚMERO ═══════════ */}
      <section style={{ marginTop: "22px", paddingBottom: "10px", borderBottom: "1px solid #e4e4e7" }}>
        <p style={{ fontSize: "9px", letterSpacing: "0.22em", color: "#a1a1aa", fontWeight: 600, textTransform: "uppercase" }}>
          {docTitle}
        </p>
        <p style={{
          fontSize: "22px", fontWeight: 700, color: "#0a0a0a",
          fontFamily: "'JetBrains Mono', 'Menlo', monospace",
          letterSpacing: "0.02em", marginTop: "2px", lineHeight: 1.1,
        }}>
          N° {form.invoice_number || "—"}
        </p>
      </section>

      {/* ═══════════ 3. ITEMS TABLE ═══════════ */}
      <section style={{ marginTop: "16px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
          <thead>
            <tr style={{ borderBottom: "1.5px solid #18181b" }}>
              <th style={cellTh("left")}>Designação</th>
              <th style={{ ...cellTh("right"), width: "55px" }}>Qtd</th>
              <th style={{ ...cellTh("right"), width: "85px" }}>Preço unit.</th>
              <th style={{ ...cellTh("right"), width: "55px" }}>TVA</th>
              <th style={{ ...cellTh("right"), width: "95px" }}>Total HT</th>
            </tr>
          </thead>
          <tbody>
            {form.items.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: "16px 8px", textAlign: "center", color: "#a1a1aa", fontStyle: "italic" }}>
                  Sem itens
                </td>
              </tr>
            ) : form.items.map((it) => {
              const lineNet = (Number(it.quantity) || 0) * (Number(it.unit_price) || 0);
              return (
                <tr key={it.id} style={{ borderBottom: "1px solid #f4f4f5", pageBreakInside: "avoid", breakInside: "avoid" }}>
                  <td style={cellTd("left", "#27272a")}>
                    {it.designation || <span style={{ color: "#a1a1aa", fontStyle: "italic" }}>Sem descrição</span>}
                  </td>
                  <td style={cellTd("right", "#52525b")}>
                    {Number(it.quantity) || 0}
                    {it.unit && <span style={{ color: "#a1a1aa", fontSize: "8.5px", marginLeft: "3px" }}>{it.unit}</span>}
                  </td>
                  <td style={cellTd("right", "#52525b")}>{fmtMoney(Number(it.unit_price) || 0)}</td>
                  <td style={cellTd("right", "#71717a")}>{Number(it.tax_rate) || 0}%</td>
                  <td style={{ ...cellTd("right", "#0a0a0a"), fontWeight: 500 }}>{fmtMoney(lineNet)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* ═══════════ 4. TOTALS ═══════════ */}
      <section style={{ marginTop: "14px", display: "flex", justifyContent: "flex-end", pageBreakInside: "avoid", breakInside: "avoid" }}>
        <div style={{ width: "260px" }}>
          <Row label="Subtotal" value={fmtMoney(totals.subtotal)} />
          {opt.show_discount && totals.discount > 0 && (
            <Row
              label={`Desconto${opt.discount_type === "percent" ? ` (${opt.discount_value || 0}%)` : ""}`}
              value={`- ${fmtMoney(totals.discount)}`}
              tone="rose"
            />
          )}
          <Row label="Total HT" value={fmtMoney(totals.netSubtotal)} divider />
          {Array.from(taxBuckets.entries()).filter(([, v]) => v > 0).map(([rate, val]) => (
            <Row key={rate} label={`TVA (${rate}%)`} value={fmtMoney(val)} muted />
          ))}
          <Row label="Total TVA" value={fmtMoney(totals.tax)} divider />
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "baseline",
            marginTop: "8px", padding: "10px 12px", background: "#0a0a0a", color: "#fff",
          }}>
            <span style={{ fontSize: "9.5px", letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 600 }}>Total TTC</span>
            <span style={{ fontSize: "14px", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
              {fmtMoney(totals.total)}
            </span>
          </div>
        </div>
      </section>

      {/* ═══════════ 5. OBSERVAÇÕES / TEXTO LEGAL ═══════════ */}
      {((opt.show_notes !== false && form.notes) || form.legal_text) && (
        <section style={{ marginTop: "22px", pageBreakInside: "avoid", breakInside: "avoid" }}>
          {opt.show_notes !== false && form.notes && (
            <>
              <p style={{ fontSize: "8.5px", letterSpacing: "0.18em", color: "#a1a1aa", fontWeight: 600, textTransform: "uppercase" }}>
                Observações
              </p>
              <p style={{ fontSize: "10px", color: "#3f3f46", whiteSpace: "pre-wrap", marginTop: "4px", lineHeight: 1.55 }}>
                {form.notes}
              </p>
            </>
          )}
          {form.legal_text && (
            <p style={{ fontSize: "9px", color: "#71717a", fontStyle: "italic", marginTop: form.notes ? "8px" : "0", lineHeight: 1.5 }}>
              {form.legal_text}
            </p>
          )}
        </section>
      )}

      {/* ═══════════ 6. DATAS — abaixo da tabela ═══════════ */}
      <section style={{
        marginTop: "18px", paddingTop: "10px", borderTop: "1px solid #e4e4e7",
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px",
        pageBreakInside: "avoid", breakInside: "avoid",
      }}>
        <DateBlock label="Data de emissão" value={fmtDate(form.issue_date)} />
        <DateBlock label="Data de vencimento" value={fmtDate(form.due_date)} />
        {opt.show_payment_terms !== false && (
          <DateBlock label="Condições de pagamento" value={paymentLabel} />
        )}
        {opt.show_client_reference && opt.client_reference && (
          <DateBlock label="Referência cliente" value={opt.client_reference} />
        )}
      </section>

      {/* ═══════════ 7. RODAPÉ ═══════════ */}
      <footer style={{
        position: "absolute", left: 0, right: 0, bottom: "10mm",
        textAlign: "center", fontSize: "8.5px", color: "#71717a", lineHeight: 1.55,
        padding: "0 14mm",
      }} className="invoice-a4-footer">
        <div style={{ borderTop: "1px solid #e4e4e7", paddingTop: "8px" }}>
          <span style={{ color: "#27272a", fontWeight: 600 }}>{companyName}</span>
          {companySiret && <span> · SIRET {companySiret}</span>}
          {companyTva && <span> · TVA {companyTva}</span>}
          {companyIban && <span> · IBAN {companyIban}</span>}
          {companyBic && <span> · BIC {companyBic}</span>}
          <div style={{ color: "#a1a1aa", marginTop: "2px" }}>
            Documento gerado eletronicamente — válido sem assinatura.
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ───────── helpers ───────── */
function cellTh(align: "left" | "right"): React.CSSProperties {
  return {
    textAlign: align,
    padding: "8px 6px",
    fontSize: "8.5px",
    fontWeight: 600,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#52525b",
  };
}
function cellTd(align: "left" | "right", color: string): React.CSSProperties {
  return {
    textAlign: align,
    padding: "7px 6px",
    color,
    verticalAlign: "top",
    fontVariantNumeric: align === "right" ? "tabular-nums" : "normal",
  };
}

function Row({ label, value, divider, muted, tone }: {
  label: string; value: string; divider?: boolean; muted?: boolean; tone?: "rose";
}) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", padding: "5px 0",
      borderTop: divider ? "1px solid #e4e4e7" : "none",
      fontSize: "10px",
      color: tone === "rose" ? "#e11d48" : (muted ? "#71717a" : "#27272a"),
    }}>
      <span style={{ color: tone === "rose" ? "#e11d48" : "#71717a" }}>{label}</span>
      <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: tone === "rose" ? 500 : 400 }}>{value}</span>
    </div>
  );
}

function DateBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ fontSize: "8px", letterSpacing: "0.18em", color: "#a1a1aa", fontWeight: 600, textTransform: "uppercase" }}>
        {label}
      </p>
      <p style={{ fontSize: "10.5px", color: "#27272a", marginTop: "3px", fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>
        {value}
      </p>
    </div>
  );
}
