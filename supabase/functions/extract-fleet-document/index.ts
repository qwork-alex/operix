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

    const { imageBase64, mimeType, documentType } = await req.json();
    if (!imageBase64) throw new Error("No image data provided");

    let systemPrompt: string;
    let toolDef: any;

    if (documentType === "vehicle") {
      systemPrompt = `You are a document extraction assistant for a fleet management system.
Extract vehicle registration data from this document (carte grise, certificat d'immatriculation, vehicle registration card).

RULES:
- Extract exactly the fields requested. Return null for any field you cannot read.
- For license_plate: look for field A (numéro d'immatriculation)
- For vin_number: look for field E (numéro d'identification du véhicule / VIN)
- For brand: look for field D.1 (marque)
- For model: look for field D.2 (type / variante / version) or D.3
- For year: look for field B (date de première immatriculation) — extract the year
- For first_registration_date: look for field B — full date in YYYY-MM-DD format
- For fuel_type: look for field P.3 (type de carburant) — map to: diesel, gasoline, electric, hybrid
- For vehicle_type: look for field J (catégorie) — map to: private or utility
- For power: look for field P.2 (puissance nette maximale en kW) or field P.1
- Be honest about confidence. If handwritten or blurry, set confidence to low.`;

      toolDef = {
        type: "function",
        function: {
          name: "extract_vehicle_data",
          description: "Extract structured vehicle registration data",
          parameters: {
            type: "object",
            properties: {
              license_plate: { type: "string" },
              vin_number: { type: "string" },
              brand: { type: "string" },
              model: { type: "string" },
              year: { type: "string" },
              first_registration_date: { type: "string" },
              fuel_type: { type: "string", enum: ["diesel", "gasoline", "electric", "hybrid"] },
              vehicle_type: { type: "string", enum: ["private", "utility"] },
              power: { type: "string" },
              confidence: {
                type: "object",
                properties: {
                  license_plate: { type: "string", enum: ["high", "medium", "low"] },
                  vin_number: { type: "string", enum: ["high", "medium", "low"] },
                  brand: { type: "string", enum: ["high", "medium", "low"] },
                  model: { type: "string", enum: ["high", "medium", "low"] },
                  year: { type: "string", enum: ["high", "medium", "low"] },
                  fuel_type: { type: "string", enum: ["high", "medium", "low"] },
                },
              },
              notes: { type: "string" },
            },
            required: ["confidence"],
          },
        },
      };
    } else {
      // Driver license
      systemPrompt = `You are a document extraction assistant for a fleet management system.
Extract driver's license data from this document (permis de conduire, carta de condução).

RULES:
- Extract exactly the fields requested. Return null for any field you cannot read.
- full_name: fields 1 + 2 (surname + given names)
- birth_date: field 3 — in YYYY-MM-DD format
- license_number: field 5
- license_category: field 9 (e.g. B, C, D, BE, CE)
- license_expiry_date: field 4b — in YYYY-MM-DD format
- Be honest about confidence.`;

      toolDef = {
        type: "function",
        function: {
          name: "extract_driver_data",
          description: "Extract structured driver license data",
          parameters: {
            type: "object",
            properties: {
              full_name: { type: "string" },
              birth_date: { type: "string" },
              license_number: { type: "string" },
              license_category: { type: "string" },
              license_expiry_date: { type: "string" },
              confidence: {
                type: "object",
                properties: {
                  full_name: { type: "string", enum: ["high", "medium", "low"] },
                  birth_date: { type: "string", enum: ["high", "medium", "low"] },
                  license_number: { type: "string", enum: ["high", "medium", "low"] },
                  license_category: { type: "string", enum: ["high", "medium", "low"] },
                  license_expiry_date: { type: "string", enum: ["high", "medium", "low"] },
                },
              },
              notes: { type: "string" },
            },
            required: ["confidence"],
          },
        },
      };
    }

    const toolName = documentType === "vehicle" ? "extract_vehicle_data" : "extract_driver_data";

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: `Extract data from this ${documentType === "vehicle" ? "vehicle registration" : "driver's license"} document.` },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
            ],
          },
        ],
        tools: [toolDef],
        tool_choice: { type: "function", function: { name: toolName } },
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
    console.error("extract-fleet-document error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
