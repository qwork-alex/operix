/**
 * Invoice i18n
 * ────────────
 * Single source of truth for every user-visible string in the invoice
 * document, preview, PDF, print and email flows.
 *
 * Usage:
 *   import { invoiceT, getPaymentTermLabel, fmtMoney, fmtDate } from "@/i18n/invoices";
 *   const t = invoiceT("fr");
 *   t("totalTtc")  // "Total TTC"
 */

export type InvoiceLang = "pt" | "fr" | "en" | "es" | "it" | "de";

export const INVOICE_LANG_OPTIONS: { value: InvoiceLang; label: string }[] = [
  { value: "pt", label: "Português" },
  { value: "fr", label: "Français" },
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "it", label: "Italiano" },
  { value: "de", label: "Deutsch" },
];

export type InvoiceDict = {
  // Header / doc
  docTitleInvoice: string;
  docTitleQuote: string;
  docTitleCredit: string;
  docTitleProforma: string;
  number: string;             // "Nº"
  // Client block
  clientNotSelected: string;
  vat: string;                // "TVA"
  taxId: string;              // "SIRET / VAT"
  // Items table
  designation: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
  totalHt: string;
  noItems: string;
  noDescription: string;
  // Totals
  subtotal: string;
  discount: string;
  totalNet: string;           // Total HT
  totalTax: string;           // Total TVA
  taxRow: (rate: number) => string;  // "TVA (20%)"
  totalGross: string;         // Total TTC
  // Dates / terms block
  issueDate: string;
  dueDate: string;
  paymentTerms: string;
  clientReference: string;
  // Footer / institutional
  iban: string;
  bic: string;
  capital: string;
  rcs: string;
  ape: string;
  siret: string;
  // Misc
  phoneShort: string;         // "Tel"
  // Payment terms
  paymentTerm: Record<
    "on_receipt" | "net_15" | "net_30" | "net_45" | "net_60" | "end_of_month" | "custom",
    string
  >;
};

const PT: InvoiceDict = {
  docTitleInvoice: "Fatura",
  docTitleQuote: "Orçamento",
  docTitleCredit: "Nota de crédito",
  docTitleProforma: "Proforma",
  number: "Nº",
  clientNotSelected: "Cliente não selecionado",
  vat: "IVA",
  taxId: "NIF / NIPC",
  designation: "Designação",
  quantity: "Quantidade",
  unitPrice: "Preço unit.",
  taxRate: "IVA",
  totalHt: "Total s/ IVA",
  noItems: "Sem itens",
  noDescription: "Sem descrição",
  subtotal: "Subtotal",
  discount: "Desconto",
  totalNet: "Total s/ IVA",
  totalTax: "Total IVA",
  taxRow: (r) => `IVA (${r}%)`,
  totalGross: "Total c/ IVA",
  issueDate: "Data de emissão",
  dueDate: "Data de vencimento",
  paymentTerms: "Condições de pagamento",
  clientReference: "Referência cliente",
  iban: "IBAN",
  bic: "BIC",
  capital: "Capital",
  rcs: "RCS",
  ape: "CAE",
  siret: "NIPC",
  phoneShort: "Tel",
  paymentTerm: {
    on_receipt: "Após recebimento",
    net_15: "15 dias",
    net_30: "30 dias",
    net_45: "45 dias",
    net_60: "60 dias",
    end_of_month: "Final do mês",
    custom: "Data personalizada",
  },
};

const FR: InvoiceDict = {
  docTitleInvoice: "Facture",
  docTitleQuote: "Devis",
  docTitleCredit: "Avoir",
  docTitleProforma: "Proforma",
  number: "N°",
  clientNotSelected: "Client non sélectionné",
  vat: "TVA",
  taxId: "SIRET / TVA",
  designation: "Désignation",
  quantity: "Quantité",
  unitPrice: "Prix unit.",
  taxRate: "TVA",
  totalHt: "Total HT",
  noItems: "Aucun article",
  noDescription: "Sans description",
  subtotal: "Sous-total",
  discount: "Remise",
  totalNet: "Total HT",
  totalTax: "Total TVA",
  taxRow: (r) => `TVA (${r}%)`,
  totalGross: "Total TTC",
  issueDate: "Date d'émission",
  dueDate: "Date d'échéance",
  paymentTerms: "Conditions de paiement",
  clientReference: "Référence client",
  iban: "IBAN",
  bic: "BIC",
  capital: "Capital",
  rcs: "RCS",
  ape: "APE",
  siret: "SIRET",
  phoneShort: "Tél",
  paymentTerm: {
    on_receipt: "À réception",
    net_15: "15 jours",
    net_30: "30 jours",
    net_45: "45 jours",
    net_60: "60 jours",
    end_of_month: "Fin de mois",
    custom: "Date personnalisée",
  },
};

const EN: InvoiceDict = {
  docTitleInvoice: "Invoice",
  docTitleQuote: "Quote",
  docTitleCredit: "Credit note",
  docTitleProforma: "Proforma",
  number: "No.",
  clientNotSelected: "Client not selected",
  vat: "VAT",
  taxId: "Tax ID / VAT",
  designation: "Description",
  quantity: "Quantity",
  unitPrice: "Unit price",
  taxRate: "VAT",
  totalHt: "Net total",
  noItems: "No items",
  noDescription: "No description",
  subtotal: "Subtotal",
  discount: "Discount",
  totalNet: "Net total",
  totalTax: "Total VAT",
  taxRow: (r) => `VAT (${r}%)`,
  totalGross: "Total",
  issueDate: "Issue date",
  dueDate: "Due date",
  paymentTerms: "Payment terms",
  clientReference: "Client reference",
  iban: "IBAN",
  bic: "BIC / SWIFT",
  capital: "Capital",
  rcs: "Reg. No.",
  ape: "Activity code",
  siret: "Reg. No.",
  phoneShort: "Tel",
  paymentTerm: {
    on_receipt: "On receipt",
    net_15: "Net 15",
    net_30: "Net 30",
    net_45: "Net 45",
    net_60: "Net 60",
    end_of_month: "End of month",
    custom: "Custom date",
  },
};

const ES: InvoiceDict = {
  docTitleInvoice: "Factura",
  docTitleQuote: "Presupuesto",
  docTitleCredit: "Nota de crédito",
  docTitleProforma: "Proforma",
  number: "Nº",
  clientNotSelected: "Cliente no seleccionado",
  vat: "IVA",
  taxId: "CIF / NIF",
  designation: "Descripción",
  quantity: "Cantidad",
  unitPrice: "Precio unit.",
  taxRate: "IVA",
  totalHt: "Total sin IVA",
  noItems: "Sin artículos",
  noDescription: "Sin descripción",
  subtotal: "Subtotal",
  discount: "Descuento",
  totalNet: "Total sin IVA",
  totalTax: "Total IVA",
  taxRow: (r) => `IVA (${r}%)`,
  totalGross: "Total con IVA",
  issueDate: "Fecha de emisión",
  dueDate: "Fecha de vencimiento",
  paymentTerms: "Condiciones de pago",
  clientReference: "Referencia cliente",
  iban: "IBAN",
  bic: "BIC",
  capital: "Capital",
  rcs: "Reg. Mercantil",
  ape: "CNAE",
  siret: "CIF",
  phoneShort: "Tel",
  paymentTerm: {
    on_receipt: "A la recepción",
    net_15: "15 días",
    net_30: "30 días",
    net_45: "45 días",
    net_60: "60 días",
    end_of_month: "Fin de mes",
    custom: "Fecha personalizada",
  },
};

const IT: InvoiceDict = {
  docTitleInvoice: "Fattura",
  docTitleQuote: "Preventivo",
  docTitleCredit: "Nota di credito",
  docTitleProforma: "Proforma",
  number: "N°",
  clientNotSelected: "Cliente non selezionato",
  vat: "IVA",
  taxId: "P. IVA / C.F.",
  designation: "Descrizione",
  quantity: "Quantità",
  unitPrice: "Prezzo unit.",
  taxRate: "IVA",
  totalHt: "Totale imponibile",
  noItems: "Nessun articolo",
  noDescription: "Senza descrizione",
  subtotal: "Subtotale",
  discount: "Sconto",
  totalNet: "Totale imponibile",
  totalTax: "Totale IVA",
  taxRow: (r) => `IVA (${r}%)`,
  totalGross: "Totale",
  issueDate: "Data di emissione",
  dueDate: "Data di scadenza",
  paymentTerms: "Condizioni di pagamento",
  clientReference: "Riferimento cliente",
  iban: "IBAN",
  bic: "BIC",
  capital: "Capitale",
  rcs: "Reg. Imprese",
  ape: "ATECO",
  siret: "P. IVA",
  phoneShort: "Tel",
  paymentTerm: {
    on_receipt: "Alla ricezione",
    net_15: "15 giorni",
    net_30: "30 giorni",
    net_45: "45 giorni",
    net_60: "60 giorni",
    end_of_month: "Fine mese",
    custom: "Data personalizzata",
  },
};

const DE: InvoiceDict = {
  docTitleInvoice: "Rechnung",
  docTitleQuote: "Angebot",
  docTitleCredit: "Gutschrift",
  docTitleProforma: "Proforma",
  number: "Nr.",
  clientNotSelected: "Kunde nicht ausgewählt",
  vat: "USt.",
  taxId: "USt-IdNr.",
  designation: "Bezeichnung",
  quantity: "Menge",
  unitPrice: "Einzelpreis",
  taxRate: "USt.",
  totalHt: "Nettobetrag",
  noItems: "Keine Positionen",
  noDescription: "Keine Beschreibung",
  subtotal: "Zwischensumme",
  discount: "Rabatt",
  totalNet: "Nettobetrag",
  totalTax: "USt. gesamt",
  taxRow: (r) => `USt. (${r}%)`,
  totalGross: "Gesamtbetrag",
  issueDate: "Rechnungsdatum",
  dueDate: "Fälligkeitsdatum",
  paymentTerms: "Zahlungsbedingungen",
  clientReference: "Kundenreferenz",
  iban: "IBAN",
  bic: "BIC",
  capital: "Kapital",
  rcs: "HRB",
  ape: "WZ-Code",
  siret: "USt-IdNr.",
  phoneShort: "Tel",
  paymentTerm: {
    on_receipt: "Bei Erhalt",
    net_15: "15 Tage",
    net_30: "30 Tage",
    net_45: "45 Tage",
    net_60: "60 Tage",
    end_of_month: "Monatsende",
    custom: "Eigenes Datum",
  },
};

const DICTS: Record<InvoiceLang, InvoiceDict> = {
  pt: PT, fr: FR, en: EN, es: ES, it: IT, de: DE,
};

export function getInvoiceDict(lang: string | null | undefined): InvoiceDict {
  const k = (lang ?? "pt").toLowerCase() as InvoiceLang;
  return DICTS[k] ?? PT;
}

/** Locale string for Intl.* APIs (currency/date) */
export function localeFor(lang: string | null | undefined): string {
  switch ((lang ?? "pt").toLowerCase()) {
    case "fr": return "fr-FR";
    case "en": return "en-GB";
    case "es": return "es-ES";
    case "it": return "it-IT";
    case "de": return "de-DE";
    default:   return "pt-PT";
  }
}

export function fmtMoney(value: number, lang?: string | null, currency: string = "EUR"): string {
  const v = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat(localeFor(lang), { style: "currency", currency }).format(v);
}

export function fmtDate(d?: string | null, lang?: string | null): string {
  if (!d) return "—";
  try {
    const date = new Date(d);
    if (isNaN(date.getTime())) return d;
    return new Intl.DateTimeFormat(localeFor(lang), {
      day: "2-digit", month: "2-digit", year: "numeric",
    }).format(date);
  } catch { return d; }
}

/** Localized payment term label from a payment_term value */
export function getPaymentTermLabel(
  value: string | null | undefined,
  lang: string | null | undefined,
): string {
  if (!value) return "—";
  const dict = getInvoiceDict(lang);
  const k = value as keyof InvoiceDict["paymentTerm"];
  return dict.paymentTerm[k] ?? value;
}

/** Pick localized doc title from invoice type, falling back to the dict's "Invoice" */
export function getDocTitle(
  type: string | null | undefined,
  lang: string | null | undefined,
): string {
  const dict = getInvoiceDict(lang);
  switch ((type ?? "").toLowerCase()) {
    case "quote":    return dict.docTitleQuote;
    case "credit":
    case "credit_note":
      return dict.docTitleCredit;
    case "proforma": return dict.docTitleProforma;
    default:         return dict.docTitleInvoice;
  }
}
