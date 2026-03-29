import { serve } from "std/http/server.ts";

serve(async (req: Request) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    // Detect if this is a lecture request
    const isLectureRequest = question.includes("Generate EXACTLY 5 lectures") ||
                             question.includes("Return this exact structure");

    let systemPrompt = "You are a helpful and friendly AI assistant.";

    if (isLectureRequest) {
      systemPrompt = `You are an expert educational content creator for teenagers.
You MUST respond with **ONLY valid JSON** and nothing else.
No explanations, no markdown, no code blocks, no extra text.`;
    }

    const groqBody = {
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: question + "\n\nRespond with ONLY valid JSON. No other text at all." }
      ],
      temperature: isLectureRequest ? 0.3 : 0.7,
      max_tokens: isLectureRequest ? 4000 : 1024,
      response_format: { type: "json_object" }   // ← This is the most important fix
    };

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify(groqBody),
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

    let answer = data?.choices?.[0]?.message?.content || "";

    // Extra cleaning for safety
    answer = answer.trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();

    return new Response(JSON.stringify({ answer }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: unknown) {
    const errMessage = err instanceof Error ? err.message : String(err);
    console.error("Server error:", errMessage);
    return new Response(
      JSON.stringify({ answer: "Server error. Try again.", error: errMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});