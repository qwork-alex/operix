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

    const systemPrompt = `You are a data extraction expert for QWork Nexus, an automotive service management system.
You extract structured data from PAYMENT ORDER documents (payment lists, invoices, payment summaries).

CRITICAL RULES FOR ACCURACY:
1. HANDWRITTEN vs PRINTED: If you see handwritten corrections or overwritten values, ALWAYS use the CORRECTED/handwritten value. Mark the field confidence as "low" and record the correction.
2. CROSSED-OUT VALUES: If a value is crossed out / struck through, IGNORE it. Use the replacement value written nearby. If no replacement exists, return null.
3. FIELD CLASSIFICATION — NEVER confuse these:
   - "client" = the COMPANY or PERSON who OWNS the vehicle / pays for service
   - "technician" = the PERSON who PERFORMS the repair/service work
   - These are DIFFERENT roles.
4. If a field is not visible, unclear, or you are guessing, return null and set that field's confidence to "low".
5. Prices should be numbers without currency symbols.
6. A document may contain MULTIPLE payment entries. Extract ALL as an array.
7. Services should be extracted as a JSON array of objects with name and price.
8. For each field, provide a confidence level: "high" (clearly readable), "medium" (partially readable/inferred), "low" (guessed/corrected/unclear).
9. The list_name is the name/title of the payment list or document.`;

    const userPrompt = `Extract all payment order data from this document. File: "${fileName}".

Look for:
- Client name (company or person — the OWNER, not the technician)
- Platform (Uber, Bolt, Heetch, Free Now, etc.)
- List name (payment list title/reference)
- Technician name (the person who did the work)
- Car/vehicle name
- License plate number
- Services performed (name + price each)
- Total amount

IMPORTANT:
- If values are crossed out with new values written, use the NEW values and flag them.
- Verify that service prices sum to the total. If mismatch, flag it.
- Double-check: client ≠ technician.
- For each field, assess confidence: high/medium/low.

Extract each entry/row separately.`;

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: userPrompt },
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${imageBase64}` },
          },
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
              description: "Extract structured payment order data from the document with per-field confidence",
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
                          description: "Per-field confidence levels",
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
                        total_mismatch: {
                          type: "boolean",
                          description: "True if service prices don't sum to total",
                        },
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

    // Post-processing: validate totals
    if (extracted.orders) {
      for (const order of extracted.orders) {
        const computed = (order.services || []).reduce((s: number, sv: any) => s + (sv.price || 0), 0);
        if (order.total != null && Math.abs(computed - order.total) > 0.01) {
          order.total_mismatch = true;
          if (!order.field_confidence) order.field_confidence = {};
          order.field_confidence.total = "low";
        }
        if (!order.field_confidence) order.field_confidence = {};
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
