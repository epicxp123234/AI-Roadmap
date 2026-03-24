import { serve } from "https://deno.land/std/http/server.ts";

serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { question } = await req.json();

    if (!question || question.trim() === "") {
      return new Response(
        JSON.stringify({ answer: "Ask something first." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY");

    if (!apiKey) {
      console.error("No Gemini API key configured");
      return new Response(
        JSON.stringify({ answer: "Server not configured properly." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: question }] }],
          generationConfig: {
            temperature: 0.9,
            maxOutputTokens: 1024,
          },
        }),
      }
    );

    const data = await response.json();
    console.log("Gemini status:", response.status);

    if (data.error) {
      console.error("Gemini error:", data.error.message);
      return new Response(
        JSON.stringify({ answer: "⚠️ AI is busy. Try again in a moment." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let answer = "";

    if (data.candidates && data.candidates.length > 0) {
      const candidate = data.candidates[0];
      if (candidate?.content?.parts?.length > 0) {
        answer = candidate.content.parts
          .map((p: any) => p.text || "")
          .join("")
          .trim();
      }
    }

    if (!answer) {
      answer = "🤖 I couldn't generate a response. Try asking differently.";
    }

    return new Response(JSON.stringify({ answer }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Server error:", err.message);
    return new Response(
      JSON.stringify({ answer: "Server error. Try again.", error: err.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});