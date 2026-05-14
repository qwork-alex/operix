/**
 * InvoiceDocumentA4
 * ─────────────────
 * Renderização ISOLADA do documento fiscal em A4 portrait (210×297 mm).
 * Independente de modal, sidebar e qualquer cromo do app.
 *
 * Inspiração visual: Pennylane, Qonto, Indy, Axonaut.
 */

import {
  getInvoiceDict,
  fmtMoney as fmtMoneyI18n,
  fmtDate as fmtDateI18n,
  getDocTitle,
  type InvoiceLang,
} from "@/i18n/invoices";

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
  legal_form?: string | null;
  share_capital?: string | null;
  ape_code?: string | null;
  rcs?: string | null;
};

type DocOptions = {
  doc_title?: string;
  show_doc_title?: boolean;
  show_payment_terms?: boolean;
  show_tva?: boolean;
  show_siret_vat?: boolean;
  show_discount?: boolean;
  discount_type?: string;
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
  lang?: InvoiceLang | string | null;
  docType?: string | null;
}

export function InvoiceDocumentA4({
  form, totals, client, company, brandName, brandLogo, lang, docType,
}: InvoiceDocumentA4Props) {
  const t = getInvoiceDict(lang);
  const fmtMoney = (n: number) => fmtMoneyI18n(n, lang);
  const fmtDate = (d?: string | null) => fmtDateI18n(d, lang);
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
  const legalForm    = (company as any)?.legal_form || "";
  const shareCapital = (company as any)?.share_capital || "";
  const apeCode      = (company as any)?.ape_code || "";
  const rcs          = (company as any)?.rcs || "";

  const baseTitle = opt.show_doc_title === false
    ? getDocTitle(docType, lang)
    : (opt.doc_title || getDocTitle(docType, lang));
  const docTitle = baseTitle.toUpperCase();
  const paymentLabel = form.payment_term_label ?? "—";

  // Group items by tax rate for the VAT summary
  const taxBuckets = new Map<number, number>();
  const ratio = totals.subtotal > 0 ? totals.netSubtotal / totals.subtotal : 1;
  form.items.forEach((it) => {
    const net = (Number(it.quantity) || 0) * (Number(it.unit_price) || 0) * ratio;
    const rate = Number(it.tax_rate) || 0;
    taxBuckets.set(rate, (taxBuckets.get(rate) || 0) + net * (rate / 100));
  });

  // Client display lines
  const clientLines = client ? [
    client.address,
    client.address_complement,
    [client.postal_code, client.city].filter(Boolean).join(" "),
    client.country,
  ].filter(Boolean) as string[] : [];

  // Build institutional footer (SIRET, TVA, juridical form, capital, APE)
  const institutionalParts: string[] = [];
  if (legalForm) institutionalParts.push(legalForm);
  if (shareCapital) institutionalParts.push(`${t.capital} ${shareCapital}`);
  if (companySiret) institutionalParts.push(`${t.siret} ${companySiret}`);
  if (rcs) institutionalParts.push(`${t.rcs} ${rcs}`);
  if (apeCode) institutionalParts.push(`${t.ape} ${apeCode}`);
  if (companyTva) institutionalParts.push(`${t.vat} ${companyTva}`);

  return (
    <div
      className="invoice-a4-doc invoice-print-page bg-white text-zinc-900 shadow-2xl print:shadow-none mx-auto"
      style={{
        width:    A4.width,
        minHeight: A4.height,
        padding:  A4.pad,
        paddingBottom: "32mm",
        boxSizing: "border-box",
        position: "relative",
        fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
        fontSize: "10.5px",
        lineHeight: 1.45,
        color: "#18181b",
      }}
    >
      {/* ═══════════ 1. HEADER ═══════════ */}
      <header className="avoid-break flex items-start justify-between gap-10">
        {/* LEFT — empresa */}
        <div className="flex items-start gap-3 min-w-0" style={{ maxWidth: "55%" }}>
          {companyLogo ? (
            <img
              src={companyLogo}
              alt={companyName}
              style={{ height: "44px", width: "44px", objectFit: "contain", flexShrink: 0 }}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <div
              aria-hidden
              style={{
                height: "44px",
                width: "44px",
                flexShrink: 0,
                borderRadius: "8px",
                border: "1px solid #e4e4e7",
                background: "linear-gradient(135deg,#fafafa,#f1f1f1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "14px",
                fontWeight: 700,
                color: "#71717a",
                letterSpacing: "0.04em",
              }}
            >
              {(companyName || "·").trim().charAt(0).toUpperCase()}
            </div>
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

        {/* RIGHT — cliente (sem label "Faturado a") */}
        <div className="text-right" style={{ maxWidth: "45%" }}>
          {client ? (
            <div>
              <p style={{ fontSize: "12px", fontWeight: 600, color: "#0a0a0a" }}>{client.name || "—"}</p>
              {clientLines.length > 0 && (
                <p style={{ fontSize: "9.5px", color: "#52525b", marginTop: "3px", lineHeight: 1.45 }}>
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
            <p style={{ fontSize: "10px", color: "#a1a1aa", fontStyle: "italic" }}>
              Cliente não selecionado
            </p>
          )}
        </div>
      </header>

      {/* ═══════════ 2. TÍTULO + NÚMERO (mesmo peso visual) ═══════════ */}
      <section className="avoid-break" style={{ marginTop: "24px", paddingBottom: "8px", borderBottom: "1px solid #e4e4e7" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap" }}>
          <h1 style={{
            fontSize: "18px",
            fontWeight: 600,
            color: "#0a0a0a",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            margin: 0,
            lineHeight: 1.1,
          }}>
            {docTitle}
          </h1>
          <span style={{
            fontSize: "18px",
            fontWeight: 600,
            color: "#0a0a0a",
            letterSpacing: "0.02em",
            lineHeight: 1.1,
          }}>
            Nº {form.invoice_number || "—"}
          </span>
        </div>
      </section>

      {/* ═══════════ 3. ITEMS TABLE (sem coluna unidade) ═══════════ */}
      <section className="invoice-items-section" style={{ marginTop: "12px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px", tableLayout: "fixed" }}>
          <colgroup>
            <col />
            <col style={{ width: "60px" }} />
            <col style={{ width: "90px" }} />
            <col style={{ width: "55px" }} />
            <col style={{ width: "100px" }} />
          </colgroup>
          <thead>
            <tr style={{ borderBottom: "1.5px solid #18181b" }}>
              <th style={cellTh("left")}>Designação</th>
              <th style={cellTh("right")}>Quantidade</th>
              <th style={cellTh("right")}>Preço unit.</th>
              <th style={cellTh("right")}>TVA</th>
              <th style={cellTh("right")}>Total HT</th>
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
                  <td style={cellTd("right", "#52525b")}>{Number(it.quantity) || 0}</td>
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
      <section className="avoid-break" style={{ marginTop: "18px", display: "flex", justifyContent: "flex-end", pageBreakInside: "avoid", breakInside: "avoid" }}>
        <div style={{ width: "270px" }}>
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
            marginTop: "16px", padding: "12px 14px", background: "#0a0a0a", color: "#fff",
          }}>
            <span style={{ fontSize: "9.5px", letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 600 }}>Total TTC</span>
            <span style={{ fontSize: "14px", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
              {fmtMoney(totals.total)}
            </span>
          </div>
        </div>
      </section>

      {/* ═══════════ 5. DATAS + CONDIÇÕES (centralizado) ═══════════ */}
      <section className="avoid-break" style={{
        marginTop: "22px", paddingTop: "12px", borderTop: "1px solid #e4e4e7",
        display: "flex", justifyContent: "center", gap: "48px", flexWrap: "wrap",
        textAlign: "center",
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

      {/* ═══════════ 6. OBSERVAÇÕES / TEXTO LEGAL (centralizado) ═══════════ */}
      {((opt.show_notes !== false && form.notes) || form.legal_text) && (
        <section style={{ marginTop: "18px", textAlign: "center", pageBreakInside: "avoid", breakInside: "avoid" }}>
          {opt.show_notes !== false && form.notes && (
            <p style={{ fontSize: "10px", color: "#3f3f46", whiteSpace: "pre-wrap", lineHeight: 1.55, maxWidth: "150mm", margin: "0 auto" }}>
              {form.notes}
            </p>
          )}
          {form.legal_text && (
            <p style={{
              fontSize: "9px", color: "#71717a", fontStyle: "italic",
              marginTop: form.notes ? "8px" : "0", lineHeight: 1.5,
              maxWidth: "150mm", margin: form.notes ? "8px auto 0" : "0 auto",
            }}>
              {form.legal_text}
            </p>
          )}
        </section>
      )}

      {/* ═══════════ 7. RODAPÉ INSTITUCIONAL FIXO ═══════════ */}
      <footer style={{
        position: "absolute", left: 0, right: 0, bottom: "10mm",
        textAlign: "center", fontSize: "8px", color: "#71717a", lineHeight: 1.55,
        padding: "0 14mm",
      }} className="invoice-a4-footer">
        <div style={{ borderTop: "1px solid #e4e4e7", paddingTop: "8px" }}>
          <div style={{ color: "#27272a", fontWeight: 600, fontSize: "8.5px" }}>{companyName}</div>
          {institutionalParts.length > 0 && (
            <div style={{ color: "#71717a", marginTop: "2px" }}>
              {institutionalParts.join(" · ")}
            </div>
          )}
          {(companyIban || companyBic) && (
            <div style={{ color: "#71717a", marginTop: "1px" }}>
              {companyIban && <span>IBAN {companyIban}</span>}
              {companyIban && companyBic && <span> · </span>}
              {companyBic && <span>BIC {companyBic}</span>}
            </div>
          )}
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
    padding: "8px 6px",
    color,
    verticalAlign: "middle",
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
      <p style={{ fontSize: "8px", letterSpacing: "0.18em", color: "#a1a1aa", fontWeight: 600, textTransform: "uppercase", margin: 0 }}>
        {label}
      </p>
      <p style={{ fontSize: "10.5px", color: "#27272a", marginTop: "3px", marginBottom: 0, fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>
        {value}
      </p>
    </div>
  );
}
