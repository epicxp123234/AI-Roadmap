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

    const apiKey = Deno.env.get("GROQ_API_KEY");

    if (!apiKey) {
      console.error("No Groq API key configured");
      return new Response(
        JSON.stringify({ answer: "Server not configured properly." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: question }],
          temperature: 0.9,
          max_tokens: 1024,
        }),
      }
    );

    const data = await response.json();
    console.log("Groq status:", response.status);

    if (data.error) {
      console.error("Groq error:", data.error.message);
      return new Response(
        JSON.stringify({ answer: "⚠️ AI is busy. Try again in a moment." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const answer = data?.choices?.[0]?.message?.content || "";

    if (!answer) {
      return new Response(
        JSON.stringify({ answer: "🤖 I couldn't generate a response. Try asking differently." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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