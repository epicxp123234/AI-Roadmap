import { serve } from "std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = ["https://velorn.vercel.app"];
const RATE_LIMIT = 30;
const WINDOW_MINUTES = 60;

function buildCorsHeaders(origin) {
  const allowOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const rateCheck = await checkRateLimit(serviceClient, user.id);
    if (!rateCheck.allowed) {
      return new Response(JSON.stringify({ answer: "You're sending requests too fast. Try again in a bit." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { question } = await req.json();
    if (!question || question.trim() === "") {
      return new Response(JSON.stringify({ answer: "Ask something first." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const apiKey = Deno.env.get("GROQ_API_KEY");
    if (!apiKey) {
      console.error("No Groq API key configured");
      return new Response(JSON.stringify({ answer: "Server not configured properly." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: question }],
        temperature: 0.4,
        max_tokens: 8000,
      }),
    });

    const data = await response.json();
    console.log("Groq status:", response.status);

    if (data.error) {
      console.error("Groq error:", data.error.message);
      return new Response(JSON.stringify({ answer: "⚠️ AI is busy. Try again in a moment." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const answer = data?.choices?.[0]?.message?.content || "";
    if (!answer) {
      return new Response(JSON.stringify({ answer: "🤖 I couldn't generate a response. Try asking differently." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ answer }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : String(err);
    console.error("Server error:", errMessage);
    return new Response(JSON.stringify({ answer: "Server error. Try again.", error: errMessage }), { headers: { "Content-Type": "application/json" }, status: 500 });
  }
});

async function checkRateLimit(supabase, userId) {
  const endpoint = "ask-doubt";
  const now = new Date();
  const windowStart = new Date(now.getTime() - WINDOW_MINUTES * 60 * 1000);

  const { data: existing } = await supabase
    .from("rate_limits")
    .select("id, count, window_start")
    .eq("user_id", userId)
    .eq("endpoint", endpoint)
    .maybeSingle();

  if (!existing || new Date(existing.window_start) < windowStart) {
    await supabase.from("rate_limits").upsert(
      { user_id: userId, endpoint, count: 1, window_start: now.toISOString() },
      { onConflict: "user_id,endpoint" }
    );
    return { allowed: true };
  }

  if (existing.count >= RATE_LIMIT) return { allowed: false };

  await supabase.from("rate_limits").update({ count: existing.count + 1 }).eq("id", existing.id);
  return { allowed: true };
}