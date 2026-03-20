import { serve } from "https://deno.land/std/http/server.ts";

serve(async (req) => {
  // ✅ CORS headers (CRITICAL)
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  // ✅ Handle preflight request
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { question } = await req.json();

    const apiKey = Deno.env.get("GEMINI_API_KEY");

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: question }],
            },
          ],
          generationConfig: {
            temperature: 0.9,
            maxOutputTokens: 4096,
          },
        }),
      }
    );

    const data = await response.json();

    // 🔍 Debug log — check Supabase Edge Function logs if AI fails
    console.log("Gemini status:", response.status);
    console.log("Gemini response:", JSON.stringify(data).slice(0, 500));

    // ❌ Handle API errors cleanly
    if (data.error) {
      console.error("Gemini API error:", data.error);
      return new Response(
        JSON.stringify({
          answer: "⚠️ AI is busy. Try again in a few seconds.",
          error: data.error,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    const answer =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      data?.candidates?.[0]?.output ||
      data?.text ||
      "No response from AI";

    return new Response(JSON.stringify({ answer }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Server error:", err.message);
    return new Response(
      JSON.stringify({
        answer: "Server error. Try again.",
        error: err.message,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});