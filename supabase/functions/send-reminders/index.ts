import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EMAILJS_SERVICE = "service_az5xx88";
const EMAILJS_CHECKIN = "template_yr13akv";
const EMAILJS_WEEKLY = "template_zheyc9c";
const EMAILJS_PUBLIC_KEY = "_22wrLmwQJNVFd-pa";

Deno.serve(async (req: Request) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const dayOfWeek = today.getDay();

    const { data: allProgress, error } = await supabase
      .from("progress")
      .select("user_id, last_visit, current_month, current_week, current_day, streak");

    if (error) throw error;

    const { data: allPrefs, error: prefsError } = await supabase
      .from("email_preferences")
      .select("user_id, weekly_enabled, checkin_enabled, checkin_last_sent_on, weekly_last_sent_on");

    if (prefsError) throw prefsError;

    const prefsByUser = new Map(
      (allPrefs || []).map((pref) => [pref.user_id, pref])
    );

    let checkinSent = 0;
    let weeklySent = 0;

    for (const row of allProgress || []) {
      const prefs = prefsByUser.get(row.user_id);
      const weeklyEnabled = prefs?.weekly_enabled === true;
      const checkinEnabled = prefs?.checkin_enabled === true;

      const { data: userData, error: userError } =
        await supabase.auth.admin.getUserById(row.user_id);

      if (userError || !userData?.user) continue;

      const userEmail = userData.user.email;
      if (!userEmail) continue;

      const userName =
        userData.user.user_metadata?.full_name ||
        userEmail.split("@")[0] ||
        "Student";

      const { data: roadmapRow } = await supabase
        .from("roadmaps")
        .select("data, title")
        .eq("user_id", row.user_id)
        .maybeSingle();

      const roadmapTitle = roadmapRow?.title || "your roadmap";

      const nextTopic =
        roadmapRow?.data?.months?.[(row.current_month || 1) - 1]?.weeks?.[
          (row.current_week || 1) - 1
        ]?.goal || "your next lesson";

      if (!row.last_visit) continue;

      const lastVisit = new Date(row.last_visit);
      const daysAway = Math.floor(
        (today.getTime() - lastVisit.getTime()) /
          (1000 * 60 * 60 * 24)
      );

      console.log(`${userEmail} | daysAway=${daysAway}`);

      // Send one inactivity email per day after 2 inactive days.
      if (
        checkinEnabled &&
        daysAway >= 2 &&
        prefs?.checkin_last_sent_on !== todayStr
      ) {
        const sent = await sendEmail(EMAILJS_CHECKIN, {
          to_name: userName,
          to_email: userEmail,
          next_topic: nextTopic,
          days_away: daysAway,
          app_url: "https://velorn.vercel.app",
        });

        if (sent) {
          checkinSent++;
          await supabase
            .from("email_preferences")
            .update({ checkin_last_sent_on: todayStr, updated_at: new Date().toISOString() })
            .eq("user_id", row.user_id);
        }
      }

      // Weekly email every Monday
      if (
        weeklyEnabled &&
        dayOfWeek === 1 &&
        daysAway < 3 &&
        prefs?.weekly_last_sent_on !== todayStr
      ) {
        const sent = await sendEmail(EMAILJS_WEEKLY, {
          to_name: userName,
          to_email: userEmail,
          roadmap_title: roadmapTitle,
          current_day: row.current_day || 1,
          next_topic: nextTopic,
          streak: row.streak || 0,
          app_url: "https://velorn.vercel.app",
        });

        if (sent) {
          weeklySent++;
          await supabase
            .from("email_preferences")
            .update({ weekly_last_sent_on: todayStr, updated_at: new Date().toISOString() })
            .eq("user_id", row.user_id);
        }
      }
    }

    console.log(
      `Reminders sent: ${checkinSent} check-ins, ${weeklySent} weekly`
    );

    return new Response(
      JSON.stringify({
        success: true,
        checkinSent,
        weeklySent,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err) {
    console.error("FULL ERROR:", err);

    return new Response(
      JSON.stringify({
        success: false,
        error: String(err),
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
});

async function sendEmail(
  templateId: string,
  params: Record<string, unknown>
) {
  const res = await fetch(
    "https://api.emailjs.com/api/v1.0/email/send",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE,
        template_id: templateId,
        user_id: EMAILJS_PUBLIC_KEY,
        template_params: params,
      }),
    }
  );

  if (!res.ok) {
    console.error(
      `EmailJS error: ${res.status} ${await res.text()}`
    );
  }

  return res.ok;
}
