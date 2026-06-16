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

    const systemPrompt = `You are a pragmatic data extraction assistant for QWork Nexus, an automotive service management system.
Your job: extract structured data from service order documents (PDFs, photos of paper forms, screenshots).

PRIORITIES (in order):
1. STRUCTURE FIRST: Identify rows and columns. Each row = one service order entry.
2. NUMBERS MATTER MOST: Get prices and totals right. Numbers are the hardest to correct manually.
3. TEXT IS SECONDARY: Client names, technician names, etc. can be corrected by the user. Do your best but don't guess.

CONFIDENCE SCORING — be honest:
- "high": clearly printed/typed, no ambiguity
- "medium": readable but could be misread (poor scan, small font, partial occlusion)
- "low": handwritten, blurry, overlapping, or you're guessing. User MUST verify.

HANDWRITTEN vs PRINTED:
- If handwritten corrections exist over printed values → use the HANDWRITTEN value, set confidence to "medium" or "low", and record the correction.
- If a value is crossed out with no replacement → return null for that field.

FIELD RULES:
- "client" = COMPANY or PERSON who OWNS the vehicle (e.g. Uber, Bolt, a fleet company)
- "technician" = PERSON who PERFORMS the work. These are NEVER the same.
- If unsure about a text field → return null. Never fabricate data.
- Prices must be numbers (no currency symbols). If you can't read a price → return null.
- Total should match sum of services. If it doesn't, still report what you see — flag the mismatch.

A document may have MULTIPLE rows. Extract ALL of them.`;

    const userPrompt = `Extract service order data from this document. File: "${fileName}".

Focus on:
1. How many distinct service entries/rows exist?
2. For each row, extract: client, platform, technician, week, car_name, license_plate, up to 4 services (name + price), total
3. For EVERY field, honestly assess confidence (high/medium/low)
4. Flag any crossed-out values or handwritten corrections

Remember: it's better to return null with low confidence than to guess wrong. The user will review and correct.`;

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
            name: "extract_service_orders",
            description: "Extract structured service order data with per-field confidence",
            parameters: {
              type: "object",
              properties: {
                orders: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      client: { type: "string", description: "Client/owner name — NOT the technician" },
                      platform: { type: "string" },
                      technician: { type: "string", description: "Person doing the work" },
                      week: { type: "string" },
                      car_name: { type: "string" },
                      license_plate: { type: "string" },
                      service_1_name: { type: "string" },
                      service_1_price: { type: "number" },
                      service_2_name: { type: "string" },
                      service_2_price: { type: "number" },
                      service_3_name: { type: "string" },
                      service_3_price: { type: "number" },
                      service_4_name: { type: "string" },
                      service_4_price: { type: "number" },
                      total: { type: "number" },
                      field_confidence: {
                        type: "object",
                        properties: {
                          client: { type: "string", enum: ["high", "medium", "low"] },
                          platform: { type: "string", enum: ["high", "medium", "low"] },
                          technician: { type: "string", enum: ["high", "medium", "low"] },
                          week: { type: "string", enum: ["high", "medium", "low"] },
                          car_name: { type: "string", enum: ["high", "medium", "low"] },
                          license_plate: { type: "string", enum: ["high", "medium", "low"] },
                          service_1_name: { type: "string", enum: ["high", "medium", "low"] },
                          service_1_price: { type: "string", enum: ["high", "medium", "low"] },
                          service_2_name: { type: "string", enum: ["high", "medium", "low"] },
                          service_2_price: { type: "string", enum: ["high", "medium", "low"] },
                          service_3_name: { type: "string", enum: ["high", "medium", "low"] },
                          service_3_price: { type: "string", enum: ["high", "medium", "low"] },
                          service_4_name: { type: "string", enum: ["high", "medium", "low"] },
                          service_4_price: { type: "string", enum: ["high", "medium", "low"] },
                          total: { type: "string", enum: ["high", "medium", "low"] },
                        },
                      },
                      handwritten_corrections: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            field: { type: "string" },
                            original_value: { type: "string" },
                            corrected_value: { type: "string" },
                          },
                          required: ["field", "corrected_value"],
                        },
                      },
                      total_mismatch: { type: "boolean" },
                    },
                    required: ["client", "car_name"],
                  },
                },
                confidence: { type: "string", enum: ["high", "medium", "low"] },
                notes: { type: "string", description: "Issues found: unclear fields, quality problems, crossed-out values" },
              },
              required: ["orders", "confidence"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "extract_service_orders" } },
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

    // Post-processing
    if (extracted.orders) {
      for (const order of extracted.orders) {
        if (!order.field_confidence) order.field_confidence = {};

        // Validate totals
        const prices = [
          order.service_1_price || 0,
          order.service_2_price || 0,
          order.service_3_price || 0,
          order.service_4_price || 0,
        ];
        const computed = prices.reduce((a: number, b: number) => a + b, 0);
        if (order.total != null && Math.abs(computed - order.total) > 0.01) {
          order.total_mismatch = true;
          order.field_confidence.total = "low";
        }

        // Count fields with actual values vs null — flag sparse rows
        const textFields = ["client", "platform", "technician", "week", "car_name", "license_plate"];
        const filledCount = textFields.filter(f => order[f]?.trim()).length;
        if (filledCount <= 2) {
          // Very sparse extraction — lower overall confidence for missing fields
          for (const f of textFields) {
            if (!order[f]?.trim() && !order.field_confidence[f]) {
              order.field_confidence[f] = "low";
            }
          }
        }
      }
    }

    return new Response(JSON.stringify(extracted), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-service-order error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
