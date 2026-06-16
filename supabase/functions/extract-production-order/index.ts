import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { fetchAIChatCompletions } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { imageBase64, mimeType, fileName } = await req.json();
    if (!imageBase64) throw new Error("No image data provided");

    const systemPrompt =
      `You are a pragmatic data extraction assistant for QWork Nexus, an automotive production/order tracking system.
Your job: extract vehicle and claim metadata from a document (PDF, photo of paper order, screenshot).

RULES:
- Do not invent data. If uncertain, return null.
- Normalize license plate to uppercase (do not add separators).
- VIN: 17 characters alphanumeric when possible; if partial, return what you see.
- Return honest per-field confidence: high/medium/low.
- Output must be a SINGLE order object (not a list).`;

    const userPrompt =
      `Extract the following fields from the document "${fileName}":
- client (owner / customer)
- platform (channel / platform)
- license_plate
- vin
- brand
- model
- color
- insurer (seguradora)
- vehicle_notes (any extra vehicle info)

Return per-field confidence. Do not guess.`;

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: userPrompt },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
        ],
      },
    ];

    const { response } = await fetchAIChatCompletions({
      model: "google/gemini-2.5-flash",
      messages,
      tools: [
        {
          type: "function",
          function: {
            name: "extract_production_order",
            description: "Extract production order vehicle metadata with per-field confidence.",
            parameters: {
              type: "object",
              properties: {
                order: {
                  type: "object",
                  properties: {
                    client: { type: "string" },
                    platform: { type: "string" },
                    license_plate: { type: "string" },
                    vin: { type: "string" },
                    brand: { type: "string" },
                    model: { type: "string" },
                    color: { type: "string" },
                    insurer: { type: "string" },
                    vehicle_notes: { type: "string" },
                    field_confidence: {
                      type: "object",
                      properties: {
                        client: { type: "string", enum: ["high", "medium", "low"] },
                        platform: { type: "string", enum: ["high", "medium", "low"] },
                        license_plate: { type: "string", enum: ["high", "medium", "low"] },
                        vin: { type: "string", enum: ["high", "medium", "low"] },
                        brand: { type: "string", enum: ["high", "medium", "low"] },
                        model: { type: "string", enum: ["high", "medium", "low"] },
                        color: { type: "string", enum: ["high", "medium", "low"] },
                        insurer: { type: "string", enum: ["high", "medium", "low"] },
                        vehicle_notes: { type: "string", enum: ["high", "medium", "low"] },
                      },
                    },
                  },
                },
                confidence: { type: "string", enum: ["high", "medium", "low"] },
                notes: { type: "string" },
              },
              required: ["order", "confidence"],
            },
          },
        },
      ],
      toolChoice: { type: "function", function: { name: "extract_production_order" } },
    });

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

