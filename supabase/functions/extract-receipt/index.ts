import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { fetchAIChatCompletions } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { fileBase64, mimeType, fileName } = await req.json();
    if (!fileBase64) throw new Error("No file data provided");
    if (!mimeType) throw new Error("Missing mimeType");

    const systemPrompt = `You extract structured data from receipts, invoices, fuel tickets, toll receipts, restaurant tickets and any operational fiscal document (EU: PT, FR, EN, ES, IT, DE).
Detect amounts, dates, merchant/vendor, currency, document number.
Classify the most probable expense CATEGORY from this exact set:
- "fuel"     (combustível, posto, station, gasolina, diesel)
- "rent"     (aluguel, location, loyer, rental)
- "tax"      (governo, impôt, taxe, tax, IRS, URSSAF, IRPF)
- "material" (compras, achats, supplies, peças, parts)
- "salary"   (salário, retirada, withdrawal, prélèvement)
- "travel"   (viagem, péage, toll, hotel, parking, transporte)
- "other"    (anything else — restaurant, miscellaneous)
Return null when not present — never fabricate.`;

    const userPrompt = `Extract structured data from this receipt/invoice. Filename: "${fileName ?? "unknown"}".
Return amount as a plain number. Dates as YYYY-MM-DD. Currency as ISO code.`;

    const { response } = await fetchAIChatCompletions({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userPrompt },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${fileBase64}` } },
          ],
        },
      ],
      tools: [{
        type: "function",
        function: {
          name: "extract_receipt",
          description: "Extract structured receipt data",
          parameters: {
            type: "object",
            properties: {
              merchant:        { type: "string", description: "Vendor/merchant name" },
              document_number: { type: "string" },
              issue_date:      { type: "string", description: "YYYY-MM-DD" },
              amount:          { type: "number", description: "Total amount, plain number" },
              currency:        { type: "string", description: "ISO code (EUR, USD, BRL, GBP)" },
              category: {
                type: "string",
                enum: ["fuel", "rent", "tax", "material", "salary", "travel", "other"],
              },
              description:     { type: "string", description: "Short human description" },
              confidence:      { type: "string", enum: ["high", "medium", "low"] },
            },
            required: ["confidence"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "extract_receipt" } },
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
    console.error("extract-receipt error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
