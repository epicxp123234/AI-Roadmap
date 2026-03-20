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

    // ⏳ Small delay (prevents rate spam)
    await new Promise(resolve => setTimeout(resolve, 1500));

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
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
        }),
      }
    );

    const data = await response.json();

    // ❌ Handle API errors cleanly
    if (data.error) {
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
      "No response from AI";

    return new Response(JSON.stringify({ answer }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
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