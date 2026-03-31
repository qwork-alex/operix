import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { imageBase64, mimeType, fileName } = await req.json();
    if (!imageBase64) throw new Error("No image data provided");

    const systemPrompt = `You are a pragmatic data extraction assistant for QWork Nexus, an automotive service management system.
Your job: extract structured data from PAYMENT ORDER documents (payment lists, invoices, payment summaries).

PRIORITIES (in order):
1. STRUCTURE FIRST: Identify rows and columns. Each row = one payment entry.
2. NUMBERS MATTER MOST: Get prices and totals right. Numbers are the hardest to correct manually.
3. TEXT IS SECONDARY: Names can be corrected by the user. Do your best but don't guess.

CONFIDENCE SCORING — be honest:
- "high": clearly printed/typed, no ambiguity
- "medium": readable but could be misread (poor scan, small font)
- "low": handwritten, blurry, overlapping, or you're guessing. User MUST verify.

HANDWRITTEN vs PRINTED:
- If handwritten corrections exist over printed values → use the HANDWRITTEN value, set confidence to "medium" or "low", and record the correction.
- If a value is crossed out with no replacement → return null.

FIELD RULES:
- "client" = COMPANY or PERSON who OWNS the vehicle (NOT the technician)
- "technician" = PERSON who did the work
- If unsure about a text field → return null. Never fabricate data.
- Prices must be numbers (no currency symbols). Can't read? → null.
- list_name = title/reference of the payment list or document.

A document may have MULTIPLE entries. Extract ALL of them.`;

    const userPrompt = `Extract payment order data from this document. File: "${fileName}".

Focus on:
1. How many distinct payment entries exist?
2. For each: client, platform, list_name, technician, car_name, license_plate, services (name+price each), total
3. For EVERY field, honestly assess confidence (high/medium/low)
4. Flag crossed-out values or handwritten corrections
5. Verify service prices sum to total — flag if they don't

Remember: null with low confidence > wrong guess. The user will review everything.`;

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

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        tools: [
          {
            type: "function",
            function: {
              name: "extract_payment_orders",
              description: "Extract structured payment order data with per-field confidence",
              parameters: {
                type: "object",
                properties: {
                  orders: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        client: { type: "string" },
                        platform: { type: "string" },
                        list_name: { type: "string" },
                        technician: { type: "string" },
                        car_name: { type: "string" },
                        license_plate: { type: "string" },
                        services: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              name: { type: "string" },
                              price: { type: "number" },
                              confidence: { type: "string", enum: ["high", "medium", "low"] },
                            },
                            required: ["name", "price"],
                          },
                        },
                        total: { type: "number" },
                        field_confidence: {
                          type: "object",
                          properties: {
                            client: { type: "string", enum: ["high", "medium", "low"] },
                            platform: { type: "string", enum: ["high", "medium", "low"] },
                            list_name: { type: "string", enum: ["high", "medium", "low"] },
                            technician: { type: "string", enum: ["high", "medium", "low"] },
                            car_name: { type: "string", enum: ["high", "medium", "low"] },
                            license_plate: { type: "string", enum: ["high", "medium", "low"] },
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
                  notes: { type: "string" },
                },
                required: ["orders", "confidence"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_payment_orders" } },
      }),
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

        const computed = (order.services || []).reduce((s: number, sv: any) => s + (sv.price || 0), 0);
        if (order.total != null && Math.abs(computed - order.total) > 0.01) {
          order.total_mismatch = true;
          order.field_confidence.total = "low";
        }

        // Flag sparse rows
        const textFields = ["client", "platform", "technician", "car_name", "license_plate"];
        const filledCount = textFields.filter(f => order[f]?.trim()).length;
        if (filledCount <= 2) {
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
    console.error("extract-payment-order error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
