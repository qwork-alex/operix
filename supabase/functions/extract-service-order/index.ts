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

    const systemPrompt = `You are a data extraction expert for an automotive service management system called QWork Nexus.
You extract structured data from service order documents (PDFs, photos of paper forms, screenshots).

CRITICAL RULES FOR ACCURACY:
1. HANDWRITTEN vs PRINTED: If you see handwritten corrections or overwritten values, ALWAYS use the CORRECTED/handwritten value. Mark the field confidence as "low" and record the correction.
2. CROSSED-OUT VALUES: If a value is crossed out / struck through, IGNORE it. Use the replacement value written nearby. If no replacement exists, return null.
3. FIELD CLASSIFICATION — NEVER confuse these:
   - "client" = the COMPANY or PERSON who OWNS the vehicle / pays for service (e.g. Uber, Bolt, a fleet company)
   - "technician" = the PERSON who PERFORMS the repair/service work
   - These are DIFFERENT roles. A person's name next to "Technicien" or "Mécanicien" is a technician, NOT a client.
4. If a field is not visible, unclear, or you are guessing, return null and set that field's confidence to "low".
5. Prices must be numbers without currency symbols.
6. The total should be the sum of all service prices if visible, otherwise null.
7. A document may contain MULTIPLE service orders (multiple rows). Extract ALL of them.
8. For each field, provide a confidence level: "high" (clearly readable), "medium" (partially readable/inferred), "low" (guessed/corrected/unclear).

Return a JSON object using the tool provided.`;

    const userPrompt = `Extract all service order data from this document image. The file is named "${fileName}".

Look for:
- Client name (the COMPANY/OWNER, NOT the technician)
- Platform (e.g. Uber, Bolt, Heetch, Free Now, etc.)
- Technician name (the PERSON doing the work)
- Week reference (e.g. "S12", "Week 12", "Semaine 12")
- Car/vehicle name
- License plate number
- Up to 4 services with names and prices
- Total amount

IMPORTANT:
- If values are crossed out with new values written, use the NEW values and flag them as corrections.
- Verify that line item prices sum to the total. If they don't match, flag it in notes.
- Double-check: client ≠ technician. They are different fields.
- For each field, assess confidence: high/medium/low.`;

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
              name: "extract_service_orders",
              description: "Extract structured service order data from the document with per-field confidence",
              parameters: {
                type: "object",
                properties: {
                  orders: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        client: { type: "string", description: "Client/company name (the owner, NOT the technician)" },
                        platform: { type: "string", description: "Platform (Uber, Bolt, etc.)" },
                        technician: { type: "string", description: "Technician name (the person doing the work)" },
                        week: { type: "string", description: "Week reference" },
                        car_name: { type: "string", description: "Vehicle name/model" },
                        license_plate: { type: "string", description: "License plate number" },
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
                          description: "Per-field confidence levels",
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
                        total_mismatch: {
                          type: "boolean",
                          description: "True if the sum of service prices does not match the stated total",
                        },
                      },
                      required: ["client", "car_name"],
                    },
                  },
                  confidence: {
                    type: "string",
                    enum: ["high", "medium", "low"],
                    description: "Overall confidence in the extraction quality",
                  },
                  notes: {
                    type: "string",
                    description: "Any notes about the extraction (unclear fields, quality issues, crossed-out values, field classification issues, etc.)",
                  },
                },
                required: ["orders", "confidence"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_service_orders" } },
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

    // Post-processing: validate totals and flag mismatches
    if (extracted.orders) {
      for (const order of extracted.orders) {
        const prices = [
          order.service_1_price || 0,
          order.service_2_price || 0,
          order.service_3_price || 0,
          order.service_4_price || 0,
        ];
        const computed = prices.reduce((a: number, b: number) => a + b, 0);
        if (order.total != null && Math.abs(computed - order.total) > 0.01) {
          order.total_mismatch = true;
          if (!order.field_confidence) order.field_confidence = {};
          order.field_confidence.total = "low";
        }
        // Ensure field_confidence exists
        if (!order.field_confidence) order.field_confidence = {};
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
