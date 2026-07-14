/**
 * InvoiceDocumentA4
 * ─────────────────
 * Redesign premium — layout inspirado nas referências fatura-premium-ref-01/02.
 * Cabeçalho: logo centrado + two-column (emitente esquerda, cliente direita).
 * Tabela: cabeçalho azul com texto branco, linhas zebradas, totais alinhados.
 * Rodapé institucional + selos de estado.
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

// Brand/design constants
const BLUE_DARK  = "#1e3a5f";
const BLUE_MED   = "#2563eb";
const BLUE_LIGHT = "#dbeafe";
const BLUE_HEADER_BG = "#1e40af";

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

export type BillingMode = "quick" | "complete" | "electronic";
export type ElectronicFormat = "none" | "ubl" | "facturx" | "peppol";

interface InvoiceDocumentA4Props {
  form: DocForm;
  totals: Totals;
  client: DocClient | null;
  company: DocCompany | null;
  brandName: string;
  brandLogo: string;
  lang?: InvoiceLang | string | null;
  docType?: string | null;
  mode?: BillingMode;
  electronicFormat?: ElectronicFormat;
  status?: string;
}

// Localized labels for mode-specific blocks
const MODE_LABELS: Record<string, {
  electronicBlock: string;
  electronicFormat: string;
  documentId: string;
  issuedAt: string;
  schema: string;
  buyerRef: string;
  techNotice: string;
  formatBadge: string;
}> = {
  pt: {
    electronicBlock: "Bloco eletrónico",
    electronicFormat: "Formato",
    documentId: "ID documento",
    issuedAt: "Emitido em",
    schema: "Esquema",
    buyerRef: "Referência comprador",
    techNotice: "Documento conforme EN 16931 — preparado para transmissão eletrónica.",
    formatBadge: "Formato eletrónico",
  },
  fr: {
    electronicBlock: "Bloc électronique",
    electronicFormat: "Format",
    documentId: "ID document",
    issuedAt: "Émis le",
    schema: "Schéma",
    buyerRef: "Référence acheteur",
    techNotice: "Document conforme EN 16931 — préparé pour la transmission électronique.",
    formatBadge: "Format électronique",
  },
  en: {
    electronicBlock: "Electronic block",
    electronicFormat: "Format",
    documentId: "Document ID",
    issuedAt: "Issued at",
    schema: "Schema",
    buyerRef: "Buyer reference",
    techNotice: "Document compliant with EN 16931 — ready for electronic transmission.",
    formatBadge: "Electronic format",
  },
  es: {
    electronicBlock: "Bloque electrónico",
    electronicFormat: "Formato",
    documentId: "ID documento",
    issuedAt: "Emitido el",
    schema: "Esquema",
    buyerRef: "Referencia comprador",
    techNotice: "Documento conforme a EN 16931 — preparado para transmisión electrónica.",
    formatBadge: "Formato electrónico",
  },
  it: {
    electronicBlock: "Blocco elettronico",
    electronicFormat: "Formato",
    documentId: "ID documento",
    issuedAt: "Emesso il",
    schema: "Schema",
    buyerRef: "Riferimento acquirente",
    techNotice: "Documento conforme a EN 16931 — pronto per la trasmissione elettronica.",
    formatBadge: "Formato elettronico",
  },
  de: {
    electronicBlock: "Elektronischer Block",
    electronicFormat: "Format",
    documentId: "Dokument-ID",
    issuedAt: "Ausgestellt am",
    schema: "Schema",
    buyerRef: "Käuferreferenz",
    techNotice: "Dokument konform mit EN 16931 — bereit für elektronische Übertragung.",
    formatBadge: "Elektronisches Format",
  },
};

const FORMAT_META: Record<ElectronicFormat, { label: string; schema: string }> = {
  none:    { label: "—",                      schema: "—" },
  ubl:     { label: "UBL 2.1",                schema: "UBL Invoice 2.1 (OASIS)" },
  facturx: { label: "Factur-X 1.0.7",         schema: "Factur-X / ZUGFeRD (CII)" },
  peppol:  { label: "PEPPOL BIS Billing 3.0", schema: "PEPPOL BIS 3.0 (UBL)" },
};

export function InvoiceDocumentA4({
  form, totals, client, company, brandName, brandLogo, lang, docType,
  mode = "complete", electronicFormat = "none", status,
}: InvoiceDocumentA4Props) {
  const langKey = (typeof lang === "string" ? lang : "pt").toLowerCase();
  const mt = MODE_LABELS[langKey] ?? MODE_LABELS.pt;
  const isQuick = mode === "quick";
  const isElectronic = mode === "electronic";
  const t = getInvoiceDict(lang);
  const fmtMoney = (n: number) => fmtMoneyI18n(n, lang);
  const fmtDate = (d?: string | null) => fmtDateI18n(d, lang);
  const opt = form.options ?? {};
  const companyName  = company?.company_name || brandName;
  const companyAddr  = company?.address || "";
  const companySiret = company?.siret || "";
  const companyTva   = company?.tva_number || "";
  const companyPhone = (company as any)?.company_phone || (company as any)?.phone || "";
  const companyEmail = (company as any)?.company_email || (company as any)?.email || "";
  const companyIban  = (company as any)?.iban || (company as any)?.bank_iban || form.bank_iban || "";
  const companyBic   = (company as any)?.swift_bic || (company as any)?.bank_bic || form.bank_bic || "";
  const companyBankName = (company as any)?.bank_name || form.bank_name || "";
  const legalForm    = (company as any)?.legal_form || "";
  const shareCapital = (company as any)?.share_capital || "";
  const apeCode      = (company as any)?.ape_code || "";
  const rcs          = (company as any)?.rcs || "";

  const baseTitle = opt.show_doc_title === false
    ? getDocTitle(docType, lang)
    : (opt.doc_title || getDocTitle(docType, lang));
  const docTitle = baseTitle.toUpperCase();
  const paymentLabel = form.payment_term_label ?? "—";
  const isPaid = status === "paid";

  // Group items by tax rate for VAT summary
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

  // Build institutional footer
  const institutionalParts: string[] = [];
  if (legalForm) institutionalParts.push(legalForm);
  if (shareCapital) institutionalParts.push(`${t.capital} ${shareCapital}`);
  if (companySiret) institutionalParts.push(`SIRET ${companySiret}`);
  if (rcs) institutionalParts.push(`${t.rcs} ${rcs}`);
  if (apeCode) institutionalParts.push(`APE ${apeCode}`);
  if (companyTva) institutionalParts.push(`TVA ${companyTva}`);

  // Logo initials
  const initials = (companyName || "Q")
    .split(" ")
    .slice(0, 2)
    .map((w: string) => w.charAt(0).toUpperCase())
    .join("");

  return (
    <div
      className="invoice-a4-doc invoice-print-page bg-white text-zinc-900 shadow-2xl print:shadow-none mx-auto"
      data-billing-mode={mode}
      style={{
        width:     A4.width,
        minHeight: A4.height,
        padding:   A4.pad,
        paddingBottom: isQuick ? "18mm" : "34mm",
        boxSizing: "border-box",
        position:  "relative",
        fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
        fontSize:   "10.5px",
        lineHeight: 1.45,
        color:      "#18181b",
      }}
    >
      {/* ═══════════ PAID STAMP ═══════════ */}
      {isPaid && (
        <div
          aria-label="Pago"
          style={{
            position: "absolute",
            top: "28mm",
            right: "16mm",
            transform: "rotate(-18deg)",
            border: "3px solid #16a34a",
            color: "#16a34a",
            padding: "4px 14px",
            fontSize: "18px",
            fontWeight: 800,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            borderRadius: "4px",
            opacity: 0.72,
            pointerEvents: "none",
            zIndex: 10,
          }}
        >
          {langKey === "fr" ? "PAYÉE" : langKey === "en" ? "PAID" : "PAGO"}
        </div>
      )}

      {/* ═══════════ 1. LOGO BLOCK (centered) ═══════════ */}
      <header style={{ textAlign: "center", marginBottom: "18px" }}>
        {brandLogo ? (
          <div
            dangerouslySetInnerHTML={{ __html: brandLogo }}
            style={{ display: "inline-block", height: "48px", width: "auto" }}
          />
        ) : (
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            height: "52px",
            width: "52px",
            borderRadius: "10px",
            background: `linear-gradient(135deg, ${BLUE_DARK}, ${BLUE_MED})`,
            color: "#fff",
            fontSize: "20px",
            fontWeight: 800,
            letterSpacing: "-0.03em",
            boxShadow: "0 2px 8px rgba(30,58,95,0.25)",
          }}>
            {initials}
          </div>
        )}
        <div style={{
          marginTop: "6px",
          fontSize: "9px",
          fontWeight: 700,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: BLUE_DARK,
        }}>
          {companyName}
        </div>
      </header>

      {/* ═══════════ 2. TWO-COLUMN: ISSUER (left) + CLIENT (right) ═══════════ */}
      <section
        className="avoid-break"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "16px",
          marginBottom: "20px",
          padding: "12px 14px",
          background: "#f8fafc",
          borderRadius: "6px",
          border: "1px solid #e2e8f0",
        }}
      >
        {/* LEFT — Issuer / Company */}
        <div>
          <p style={{
            fontSize: "7.5px", fontWeight: 700, letterSpacing: "0.18em",
            textTransform: "uppercase", color: BLUE_MED, marginBottom: "5px",
          }}>
            {(t as any).issuer ?? "Emitente"}
          </p>
          <p style={{ fontSize: "11px", fontWeight: 700, color: "#0f172a", marginBottom: "3px" }}>
            {companyName}
          </p>
          {companyAddr && (
            <p style={{ fontSize: "9px", color: "#475569", lineHeight: 1.5, whiteSpace: "pre-line" }}>
              {companyAddr}
            </p>
          )}
          {companyEmail && (
            <p style={{ fontSize: "9px", color: "#475569", marginTop: "2px" }}>{companyEmail}</p>
          )}
          {companyPhone && (
            <p style={{ fontSize: "9px", color: "#475569" }}>{companyPhone}</p>
          )}
          {!isQuick && companySiret && (
            <p style={{ fontSize: "8.5px", color: "#64748b", marginTop: "4px" }}>
              SIRET: {companySiret}
            </p>
          )}
          {!isQuick && companyTva && (
            <p style={{ fontSize: "8.5px", color: "#64748b" }}>
              {t.vat}: {companyTva}
            </p>
          )}
        </div>

        {/* RIGHT — Client */}
        <div style={{ textAlign: "right" }}>
          <p style={{
            fontSize: "7.5px", fontWeight: 700, letterSpacing: "0.18em",
            textTransform: "uppercase", color: BLUE_MED, marginBottom: "5px",
          }}>
            {(t as any).billTo ?? t.clientNotSelected?.split(" ")[0] ?? "Faturado a"}
          </p>
          {client ? (
            <>
              <p style={{ fontSize: "11px", fontWeight: 700, color: "#0f172a", marginBottom: "3px" }}>
                {client.name || "—"}
              </p>
              {clientLines.length > 0 && (
                <p style={{ fontSize: "9px", color: "#475569", lineHeight: 1.5 }}>
                  {clientLines.join(", ")}
                </p>
              )}
              {(client.email || client.contact_email) && (
                <p style={{ fontSize: "9px", color: "#475569", marginTop: "2px" }}>
                  {client.email ?? client.contact_email}
                </p>
              )}
              {!isQuick && (
                <>
                  {opt.show_tva !== false && client.tva_intracom && (
                    <p style={{ fontSize: "8.5px", color: "#64748b", marginTop: "4px" }}>
                      {t.vat}: {client.tva_intracom}
                    </p>
                  )}
                  {opt.show_siret_vat !== false && (client.siret || client.siren || client.tax_id) && (
                    <p style={{ fontSize: "8.5px", color: "#64748b" }}>
                      {t.taxId}: {client.siret || client.siren || client.tax_id}
                    </p>
                  )}
                </>
              )}
            </>
          ) : (
            <p style={{ fontSize: "10px", color: "#94a3b8", fontStyle: "italic" }}>
              {t.clientNotSelected}
            </p>
          )}
        </div>
      </section>

      {/* ═══════════ 3. INVOICE META BLOCK ═══════════ */}
      <section
        className="avoid-break"
        style={{ marginBottom: "16px" }}
      >
        {/* Title + Number */}
        <div style={{ marginBottom: "8px" }}>
          <h1 style={{
            fontSize: "16px",
            fontWeight: 700,
            color: "#0f172a",
            letterSpacing: "0.01em",
            margin: 0,
            lineHeight: 1.2,
          }}>
            {docTitle} {form.invoice_number || "—"}
          </h1>
          {isElectronic && electronicFormat !== "none" && (
            <span style={{
              display: "inline-block",
              marginTop: "4px",
              fontSize: "8px",
              fontWeight: 600,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: BLUE_MED,
              border: `1px solid ${BLUE_MED}`,
              padding: "2px 7px",
              borderRadius: "3px",
            }}>
              {FORMAT_META[electronicFormat].label}
            </span>
          )}
        </div>

        {/* Date + Terms row */}
        <div style={{
          display: "flex",
          gap: "24px",
          flexWrap: "wrap",
          padding: "8px 0",
          borderTop: `1.5px solid ${BLUE_HEADER_BG}`,
          borderBottom: "1px solid #e2e8f0",
        }}>
          <MetaBlock label={t.issueDate} value={fmtDate(form.issue_date)} />
          <MetaBlock label={t.dueDate} value={fmtDate(form.due_date)} />
          {!isQuick && opt.show_payment_terms !== false && (
            <MetaBlock label={t.paymentTerms} value={paymentLabel} />
          )}
          {!isQuick && opt.show_client_reference && opt.client_reference && (
            <MetaBlock label={t.clientReference} value={opt.client_reference} />
          )}
        </div>
      </section>

      {/* ═══════════ 4. ITEMS TABLE ═══════════ */}
      <section className="invoice-items-section" style={{ marginBottom: "18px" }}>
        <table style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "10px",
          tableLayout: "fixed",
        }}>
          <colgroup>
            <col />
            <col style={{ width: "52px" }} />
            <col style={{ width: "88px" }} />
            {!isQuick && <col style={{ width: "52px" }} />}
            <col style={{ width: "96px" }} />
          </colgroup>
          <thead>
            <tr style={{ background: BLUE_HEADER_BG }}>
              <th style={cellTh("left")}>{t.designation}</th>
              <th style={cellTh("right")}>{t.quantity}</th>
              <th style={cellTh("right")}>{t.unitPrice}</th>
              {!isQuick && <th style={cellTh("right")}>{t.taxRate}</th>}
              <th style={cellTh("right")}>{t.totalHt}</th>
            </tr>
          </thead>
          <tbody>
            {form.items.length === 0 ? (
              <tr>
                <td
                  colSpan={isQuick ? 4 : 5}
                  style={{ padding: "16px 8px", textAlign: "center", color: "#94a3b8", fontStyle: "italic" }}
                >
                  {t.noItems}
                </td>
              </tr>
            ) : form.items.map((it, idx) => {
              const lineNet = (Number(it.quantity) || 0) * (Number(it.unit_price) || 0);
              const isEven = idx % 2 === 0;
              return (
                <tr
                  key={it.id}
                  style={{
                    background: isEven ? "#ffffff" : "#f0f4ff",
                    borderBottom: "1px solid #e2e8f0",
                    pageBreakInside: "avoid",
                    breakInside: "avoid",
                  }}
                >
                  <td style={cellTd("left", "#1e293b")}>
                    {it.designation || (
                      <span style={{ color: "#94a3b8", fontStyle: "italic" }}>{t.noDescription}</span>
                    )}
                  </td>
                  <td style={cellTd("right", "#475569")}>{Number(it.quantity) || 0}</td>
                  <td style={cellTd("right", "#475569")}>{fmtMoney(Number(it.unit_price) || 0)}</td>
                  {!isQuick && (
                    <td style={cellTd("right", "#64748b")}>{Number(it.tax_rate) || 0}%</td>
                  )}
                  <td style={{ ...cellTd("right", "#0f172a"), fontWeight: 600 }}>
                    {fmtMoney(lineNet)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* ═══════════ 5. TOTALS ═══════════ */}
      <section
        className="avoid-break"
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: "20px",
          pageBreakInside: "avoid",
          breakInside: "avoid",
        }}
      >
        <div style={{ width: "260px" }}>
          <TotalRow label={t.subtotal} value={fmtMoney(totals.subtotal)} />
          {opt.show_discount && totals.discount > 0 && (
            <TotalRow
              label={`${t.discount}${opt.discount_type === "percent" ? ` (${opt.discount_value || 0}%)` : ""}`}
              value={`- ${fmtMoney(totals.discount)}`}
              tone="rose"
            />
          )}
          {!isQuick && <TotalRow label={t.totalNet} value={fmtMoney(totals.netSubtotal)} divider />}
          {!isQuick && Array.from(taxBuckets.entries()).filter(([, v]) => v > 0).map(([rate, val]) => (
            <TotalRow key={rate} label={t.taxRow(rate)} value={fmtMoney(val)} muted />
          ))}
          {!isQuick && <TotalRow label={t.totalTax} value={fmtMoney(totals.tax)} divider />}
          {/* TTC total — highlighted blue */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "10px",
            padding: "11px 14px",
            background: BLUE_HEADER_BG,
            color: "#fff",
            borderRadius: "4px",
          }}>
            <span style={{
              fontSize: "9px",
              fontWeight: 700,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
            }}>
              {t.totalGross}
            </span>
            <span style={{
              fontSize: "15px",
              fontWeight: 800,
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.01em",
            }}>
              {fmtMoney(totals.total)}
            </span>
          </div>
        </div>
      </section>

      {/* ═══════════ 6. BANK DETAILS ═══════════ */}
      {!isQuick && opt.show_bank_details && (companyIban || companyBic || companyBankName) && (
        <section
          className="avoid-break"
          style={{
            marginBottom: "16px",
            padding: "10px 12px",
            background: BLUE_LIGHT,
            borderRadius: "4px",
            border: `1px solid ${BLUE_MED}33`,
            pageBreakInside: "avoid",
            breakInside: "avoid",
          }}
        >
          <p style={{
            fontSize: "7.5px", fontWeight: 700, letterSpacing: "0.18em",
            textTransform: "uppercase", color: BLUE_MED, marginBottom: "5px",
          }}>
            {(t as any).bankDetails ?? "Dados bancários"}
          </p>
          <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", fontSize: "9.5px", color: "#1e293b" }}>
            {companyBankName && (
              <div>
                <span style={{ color: "#64748b", fontSize: "8.5px" }}>Banco: </span>
                <span style={{ fontWeight: 600 }}>{companyBankName}</span>
              </div>
            )}
            {companyIban && (
              <div>
                <span style={{ color: "#64748b", fontSize: "8.5px" }}>{t.iban}: </span>
                <span style={{ fontWeight: 600, fontFamily: "monospace", letterSpacing: "0.05em" }}>{companyIban}</span>
              </div>
            )}
            {companyBic && (
              <div>
                <span style={{ color: "#64748b", fontSize: "8.5px" }}>{t.bic}: </span>
                <span style={{ fontWeight: 600, fontFamily: "monospace" }}>{companyBic}</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ═══════════ 7. NOTES / LEGAL TEXT ═══════════ */}
      {((opt.show_notes !== false && form.notes) || (!isQuick && form.legal_text)) && (
        <section style={{ marginBottom: "16px", pageBreakInside: "avoid", breakInside: "avoid" }}>
          {opt.show_notes !== false && form.notes && (
            <p style={{ fontSize: "9.5px", color: "#334155", whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
              {form.notes}
            </p>
          )}
          {!isQuick && form.legal_text && (
            <p style={{
              fontSize: "8.5px", color: "#64748b", fontStyle: "italic",
              marginTop: form.notes ? "8px" : "0", lineHeight: 1.5,
            }}>
              {form.legal_text}
            </p>
          )}
        </section>
      )}

      {/* ═══════════ 7.5 ELECTRONIC BLOCK ═══════════ */}
      {isElectronic && (
        <section
          className="avoid-break"
          aria-label={mt.electronicBlock}
          style={{
            marginBottom: "16px",
            padding: "10px 12px",
            border: "1px solid #cbd5e1",
            background: "#f8fafc",
            borderRadius: "4px",
            pageBreakInside: "avoid",
            breakInside: "avoid",
            fontFamily: "'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace",
          }}
        >
          <div style={{
            fontSize: "8px", letterSpacing: "0.18em", textTransform: "uppercase",
            color: BLUE_MED, fontWeight: 700, marginBottom: "6px",
          }}>
            {mt.electronicBlock}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "4px 24px", fontSize: "8.5px", color: "#334155" }}>
            <ElecRow k={mt.electronicFormat} v={FORMAT_META[electronicFormat].label} />
            <ElecRow k={mt.schema} v={FORMAT_META[electronicFormat].schema} />
            <ElecRow k={mt.documentId} v={form.invoice_number || "—"} />
            <ElecRow k={mt.issuedAt} v={form.issue_date ? new Date(form.issue_date).toISOString() : "—"} />
            {opt.show_client_reference && opt.client_reference && (
              <ElecRow k={mt.buyerRef} v={opt.client_reference} />
            )}
            {(client?.tva_intracom || client?.tax_id) && (
              <ElecRow k={`${t.vat} (${t.taxId})`} v={(client.tva_intracom || client.tax_id) as string} />
            )}
          </div>
        </section>
      )}

      {/* ═══════════ 8. FOOTER ═══════════ */}
      <footer
        className="invoice-a4-footer"
        style={{
          position: isQuick ? "static" : "absolute",
          left: 0, right: 0,
          bottom: isQuick ? undefined : "10mm",
          marginTop: isQuick ? "24px" : 0,
          textAlign: "center",
          fontSize: "7.5px",
          color: "#64748b",
          lineHeight: 1.55,
          padding: isQuick ? "8px 0 0" : "0 14mm",
        }}
      >
        <div style={{ borderTop: `2px solid ${BLUE_HEADER_BG}`, paddingTop: "8px" }}>
          <div style={{ fontWeight: 700, fontSize: "8.5px", color: BLUE_DARK, marginBottom: "2px" }}>
            {companyName}
          </div>
          {isQuick ? (
            (companyEmail || companyPhone) && (
              <div>
                {companyEmail && <span>{companyEmail}</span>}
                {companyEmail && companyPhone && <span> · </span>}
                {companyPhone && <span>{companyPhone}</span>}
              </div>
            )
          ) : (
            <>
              {institutionalParts.length > 0 && (
                <div style={{ marginBottom: "1px" }}>
                  {institutionalParts.join(" · ")}
                </div>
              )}
              {(companyIban || companyBic) && (
                <div>
                  {companyIban && <span>IBAN {companyIban}</span>}
                  {companyIban && companyBic && <span> · </span>}
                  {companyBic && <span>BIC {companyBic}</span>}
                </div>
              )}
              {isElectronic && (
                <div style={{
                  marginTop: "4px", fontSize: "7px", letterSpacing: "0.08em",
                  textTransform: "uppercase", fontWeight: 600, color: BLUE_MED,
                }}>
                  {mt.techNotice}
                </div>
              )}
            </>
          )}
          <div style={{ marginTop: "3px", fontSize: "7px", color: "#94a3b8" }}>
            1 / 1
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
    padding: "7px 8px",
    fontSize: "8px",
    fontWeight: 700,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "#ffffff",
  };
}

function cellTd(align: "left" | "right", color: string): React.CSSProperties {
  return {
    textAlign: align,
    padding: "7px 8px",
    color,
    verticalAlign: "middle",
    fontVariantNumeric: align === "right" ? "tabular-nums" : "normal",
  };
}

function TotalRow({ label, value, divider, muted, tone }: {
  label: string; value: string; divider?: boolean; muted?: boolean; tone?: "rose";
}) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      padding: "4px 2px",
      borderTop: divider ? "1px solid #e2e8f0" : "none",
      fontSize: "9.5px",
      color: tone === "rose" ? "#dc2626" : (muted ? "#64748b" : "#334155"),
    }}>
      <span style={{ color: tone === "rose" ? "#dc2626" : "#64748b" }}>{label}</span>
      <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: tone === "rose" ? 600 : 400 }}>{value}</span>
    </div>
  );
}

function ElecRow({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", gap: "8px", justifyContent: "space-between" }}>
      <span style={{ color: "#64748b" }}>{k}</span>
      <span style={{ color: "#0f172a", fontWeight: 700 }}>{v}</span>
    </div>
  );
}

function MetaBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{
        fontSize: "7.5px", letterSpacing: "0.18em", color: "#94a3b8",
        fontWeight: 700, textTransform: "uppercase", margin: 0,
      }}>
        {label}
      </p>
      <p style={{
        fontSize: "10px", color: "#1e293b", marginTop: "2px",
        marginBottom: 0, fontVariantNumeric: "tabular-nums", fontWeight: 600,
      }}>
        {value}
      </p>
    </div>
  );
}

// Keep React import satisfied (JSX needs it in scope for older setups)
import React from "react";
