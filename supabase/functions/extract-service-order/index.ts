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

IMPORTANT RULES:
- Extract ALL visible data accurately
- If you see handwritten corrections or overwritten values, use the CORRECTED/latest value
- If a field is not visible or unclear, return null for that field
- Prices should be numbers without currency symbols
- The total should be the sum of all service prices if visible, otherwise null
- A document may contain MULTIPLE service orders (multiple rows). Extract ALL of them as an array.
- Each row typically represents one vehicle/car service entry

Return a JSON object with this exact structure using the tool provided.`;

    const userPrompt = `Extract all service order data from this document image. The file is named "${fileName}".
    
Look for:
- Client name (company or person)
- Platform (e.g. Uber, Bolt, Heetch, Free Now, etc.)
- Technician name
- Week reference (e.g. "S12", "Week 12", "Semaine 12")
- Car/vehicle name
- License plate number
- Up to 4 services with names and prices
- Total amount

If there are multiple entries/rows, extract each one separately.
If you see handwritten corrections (crossed out values with new ones written), use the corrected values.`;

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
              description: "Extract structured service order data from the document",
              parameters: {
                type: "object",
                properties: {
                  orders: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        client: { type: "string", description: "Client/company name" },
                        platform: { type: "string", description: "Platform (Uber, Bolt, etc.)" },
                        technician: { type: "string", description: "Technician name" },
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
                    description: "Any notes about the extraction (unclear fields, quality issues, etc.)",
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
