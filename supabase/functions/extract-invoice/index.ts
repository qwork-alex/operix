import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { fetchAIChatCompletions } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { fileBase64, mimeType, fileName, pages } = await req.json();
    const pageImages = Array.isArray(pages)
      ? pages
          .filter((page) => typeof page?.base64 === "string" && typeof page?.mimeType === "string")
          .slice(0, 6)
      : [];
    if (!fileBase64 && pageImages.length === 0) throw new Error("No file data provided");
    if (!mimeType && pageImages.length === 0) throw new Error("Missing mimeType");

    const systemPrompt = `You are an expert invoice extraction assistant for European billing (PT, FR, EN, ES, IT, DE).
Extract STRUCTURED data from invoices/receipts (incoming, supplier-issued documents), including multi-page PDFs.

LANGUAGE-AWARE LABELS to detect:
- Invoice number: "Facture", "Fatura", "Invoice", "Factura", "Fattura", "Rechnung", "Nº", "N°", "No."
- Issue date: "Date", "Data", "Émission", "Emissão", "Issued"
- Due date: "Échéance", "Vencimento", "Due", "Vencimiento", "Scadenza", "Fällig"
- Supplier (issuer): top of document, with logo / SIRET / VAT / NIF
- Client (recipient): "Facturé à", "Faturado a", "Bill to", "Facturado a"
- Total: "Total TTC", "Total c/ IVA", "Total", "Importe total", "Totale", "Gesamtbetrag"
- Tax: "TVA", "IVA", "VAT", "MwSt"
- Currency: detect from symbol (€, $, £, R$) or ISO code

CONFIDENCE per field: "high" | "medium" | "low"
Return null when not present — never fabricate.
Merge data across all provided pages. Keep line items normalized and totals coherent.`;

    const userPrompt = `Extract invoice data from this document. Filename: "${fileName ?? "unknown"}".
Identify supplier (issuer) vs client (recipient) carefully.
Return amounts as plain numbers (no currency symbol). Dates as YYYY-MM-DD.
Return line_items with description, quantity, unit_price, tax_rate, tax_amount and total.
If the PDF has multiple pages, combine all pages before answering.`;

    const contentParts: Array<
      { type: "text"; text: string } |
      { type: "image_url"; image_url: { url: string } }
    > = [{ type: "text", text: userPrompt }];
    if (pageImages.length > 0) {
      for (const page of pageImages) {
        contentParts.push({
          type: "image_url",
          image_url: { url: `data:${page.mimeType};base64,${page.base64}` },
        });
      }
    } else {
      contentParts.push({
        type: "image_url",
        image_url: { url: `data:${mimeType};base64,${fileBase64}` },
      });
    }

    const { response } = await fetchAIChatCompletions({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: contentParts,
        },
      ],
      tools: [{
        type: "function",
        function: {
          name: "extract_invoice",
          description: "Extract structured invoice data with per-field confidence",
          parameters: {
            type: "object",
            properties: {
              invoice_number:  { type: "string" },
              supplier_name:   { type: "string" },
              supplier_tax_id: { type: "string" },
              customer_name:   { type: "string" },
              customer_tax_id: { type: "string" },
              issue_date:      { type: "string", description: "YYYY-MM-DD" },
              due_date:        { type: "string", description: "YYYY-MM-DD" },
              total_amount:    { type: "number" },
              tax_amount:      { type: "number" },
              net_amount:      { type: "number" },
              page_count:      { type: "number" },
              currency:        { type: "string", description: "ISO code (EUR, USD, BRL, GBP)" },
              language:        { type: "string", enum: ["pt", "fr", "en", "es", "it", "de"] },
              notes:           { type: "string" },
              line_items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    description: { type: "string" },
                    quantity: { type: "number" },
                    unit_price: { type: "number" },
                    tax_rate: { type: "number" },
                    tax_amount: { type: "number" },
                    total: { type: "number" },
                  },
                  required: ["description"],
                  additionalProperties: false,
                },
              },
              tax_breakdown: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string" },
                    rate: { type: "number" },
                    taxable_base: { type: "number" },
                    amount: { type: "number" },
                  },
                  additionalProperties: false,
                },
              },
              field_confidence: {
                type: "object",
                properties: {
                  invoice_number: { type: "string", enum: ["high", "medium", "low"] },
                  supplier_name:  { type: "string", enum: ["high", "medium", "low"] },
                  customer_name:  { type: "string", enum: ["high", "medium", "low"] },
                  issue_date:     { type: "string", enum: ["high", "medium", "low"] },
                  due_date:       { type: "string", enum: ["high", "medium", "low"] },
                  total_amount:   { type: "string", enum: ["high", "medium", "low"] },
                  tax_amount:     { type: "string", enum: ["high", "medium", "low"] },
                  net_amount:     { type: "string", enum: ["high", "medium", "low"] },
                },
              },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
            },
            required: ["confidence"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "extract_invoice" } },
    }, {
      modelByProvider: {
        gemini: "gemini-2.5-flash",
        openai: "gpt-4o-mini",
        lovable: "google/gemini-2.5-flash",
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No structured data returned from AI");

    const extracted = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(extracted), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-invoice error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
