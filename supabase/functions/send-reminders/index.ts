// supabase/functions/send-reminders/index.ts
// Runs daily via pg_cron — sends emails to users inactive 3+ days


import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EMAILJS_SERVICE  = "service_az5xx88";
const EMAILJS_KEY      = "_22wrLmwQJNVFd-pa";
const EMAILJS_CHECKIN  = "template_yr13akv";
const EMAILJS_WEEKLY   = "template_zheyc9c";

Deno.serve(async (req: Request) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Use service role key to read all users
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon

    // Get all progress rows
    const { data: allProgress, error } = await supabase
      .from("progress")
      .select("user_id, last_visit, current_month, current_week, streak");

    if (error) throw error;

    let checkinSent = 0;
    let weeklySent = 0;

    for (const row of allProgress || []) {
      // Get user email and name
      const { data: authUser } = await supabase.auth.admin.getUserById(row.user_id);
      if (!authUser?.user) continue;

      const userEmail = authUser.user.email;
      const userName = authUser.user.user_metadata?.full_name || 
                       authUser.user.email?.split("@")[0] || "Student";

      if (!userEmail) continue;

      // Get roadmap for next topic
      const { data: roadmapRow } = await supabase
        .from("roadmaps")
        .select("data, title")
        .eq("user_id", row.user_id)
        .maybeSingle();

      const nextTopic = roadmapRow?.data?.months?.[
        (row.current_month || 1) - 1
      ]?.weeks?.[
        (row.current_week || 1) - 1
      ]?.goal || "your next lesson";

      const roadmapTitle = roadmapRow?.title || "your roadmap";

      // Calculate days since last visit
      const lastVisit = new Date(row.last_visit);
      const msAway = today.getTime() - lastVisit.getTime();
      const daysAway = Math.floor(msAway / (1000 * 60 * 60 * 24));

      // ── 3-day inactivity check-in ──
      if (daysAway >= 3 && daysAway < 14) {
        // Don't spam — only send once per 3-day window
        const shouldSend = daysAway === 3 || daysAway === 7 || daysAway === 10;
        if (shouldSend) {
          await sendEmail(EMAILJS_CHECKIN, {
            to_name: userName,
            to_email: userEmail,
            next_topic: nextTopic,
            days_away: daysAway,
            app_url: "https://velorn.vercel.app"
          });
          checkinSent++;
        }
      }

      // ── Weekly progress email (every Monday) ──
      if (dayOfWeek === 1 && daysAway < 3) {
        // Only send to active users (visited in last 3 days)
        await sendEmail(EMAILJS_WEEKLY, {
          to_name: userName,
          to_email: userEmail,
          roadmap_title: roadmapTitle,
          current_day: row.current_week ? (row.current_week - 1) * 7 + 1 : 1,
          next_topic: nextTopic,
          streak: row.streak || 0,
          app_url: "https://velorn.vercel.app"
        });
        weeklySent++;
      }
    }

    console.log(`✅ Reminders sent: ${checkinSent} check-ins, ${weeklySent} weekly`);

    return new Response(
      JSON.stringify({ success: true, checkinSent, weeklySent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("send-reminders error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

// Helper to call EmailJS REST API (works from server-side)
async function sendEmail(templateId: string, params: Record<string, unknown>) {
  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: "service_az5xx88",
      template_id: templateId,
      user_id: "_22wrLmwQJNVFd-pa",
      template_params: params,
    }),
  });
  if (!res.ok) {
    console.error(`EmailJS error: ${res.status} ${await res.text()}`);
  }
  return res.ok;
}