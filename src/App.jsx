import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL  = "https://knqclhfxhkishaivowhe.supabase.co";
const SUPABASE_ANON = "sb_publishable_xcwOjTEqwOgX6VHhB2krTA_YI1Swr5_";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "velorn-auth" }
});

const LANDING_EXAMPLES = ["Chess","Web Development","Digital Art","Entrepreneurship","Music Production","Graphic Design"];

const SUGGESTED_TRACKS = [
  {
    id: "python",
    title: "Python",
    topic: "Python Programming",
    level: "Beginner",
    goal: "Build projects",
    accent: "var(--accent2)",
    summary: "Start with syntax, control flow, functions, OOP, and small real projects.",
    sequence: [
      "Variables and data types","Strings and numbers","Lists, tuples, and dictionaries","Conditionals and boolean logic",
      "Loops and iteration","Functions and scope","Modules and imports","Reading and writing files",
      "Errors and debugging","Object-oriented programming","Classes and objects","Working with APIs",
      "Virtual environments and packages","Data handling with CSV and JSON","Automation scripts","Testing basics",
      "Command-line programs","Web basics with Python","Databases and persistence","Project structure",
      "Capstone planning","Build a useful Python tool","Improve and refactor the project","Publish and present your work"
    ]
  },
  {
    id: "chess",
    title: "Chess",
    topic: "Chess",
    level: "Beginner",
    goal: "Strong foundation",
    accent: "var(--gold)",
    summary: "Learn board vision, tactics, openings, middlegames, endgames, and game review.",
    sequence: [
      "Board, pieces, and legal moves","Check, checkmate, and stalemate","Piece value and trades","Opening principles",
      "Basic tactics: forks and pins","Skewers, discovered attacks, and double attacks","King safety and castling","Development and center control",
      "Pawn structure basics","Planning in the middlegame","Attacking patterns","Defensive thinking",
      "Endgame king activity","Basic pawn endings","Rook endgame ideas","Checkmate patterns",
      "Calculation habits","Blunder checks","Analyzing your games","Building an opening repertoire",
      "Time management","Tournament mindset","Solving puzzle sets","Full game review and improvement plan"
    ]
  },
  {
    id: "business-trading",
    title: "Business/Trading",
    topic: "Business and Trading Fundamentals",
    level: "Beginner",
    goal: "Strong foundation",
    accent: "var(--emerald)",
    summary: "Build business basics, market thinking, risk control, charts, and disciplined decisions.",
    sequence: [
      "Business models and value creation","Customers, problems, and offers","Market research basics","Revenue, costs, and profit",
      "Pricing and positioning","Sales funnels and marketing channels","Cash flow and budgeting","Lean experiments",
      "Markets, assets, and exchanges","Supply, demand, and liquidity","Candlesticks and chart basics","Trends, ranges, and support/resistance",
      "Risk management and position sizing","Trading psychology","Backtesting and journaling","News, catalysts, and macro basics",
      "Building a simple strategy","Paper trading rules","Reviewing wins and losses","Avoiding common trading mistakes",
      "Business growth metrics","Creating a small business plan","Creating a trading plan","Capstone: pitch and risk-managed strategy"
    ]
  }
];

function saveKnownDeviceUser(authUser, profile) {
  try {
    localStorage.setItem("velorn_last_user", JSON.stringify({
      email: authUser?.email || "",
      name: profile?.full_name || authUser?.user_metadata?.full_name || "",
      savedAt: new Date().toISOString(),
    }));
  } catch {
    // Remembering this device is best-effort only.
  }
}

function getKnownDeviceUser() {
  try {
    return JSON.parse(localStorage.getItem("velorn_last_user") || "null");
  } catch { return null; }
}

function withTimeout(promise, ms = 8000, fallback = null) {
  return Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => resolve(fallback), ms))
  ]);
}

async function askClaude(messages) {
  const userMessage = messages.find(m => m.role === "user")?.content || "";
  try {
    // Proactively refresh a near-expiry session so supabase.functions.invoke
    // doesn't attach a stale JWT and trigger a spurious 401.
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const expiresAt = sessionData?.session?.expires_at;
      if (expiresAt && expiresAt * 1000 - Date.now() < 60000) {
        await supabase.auth.refreshSession();
      }
    } catch {}
    // supabase.functions.invoke automatically attaches the current user's
    // session token as the Authorization header, which the edge function
    // now requires. This also means a logged-out user simply can't call it.
    const { data, error } = await supabase.functions.invoke("ask-doubt", {
      body: { question: userMessage },
    });
    if (error) {
      if (error.context?.status === 401) return "Please log in to ask a question.";
      if (error.context?.status === 429) return "You're sending requests too fast. Try again in a bit.";
      return "";
    }
    if (typeof data.answer === "string") return data.answer;
    if (data.answer?.content) return data.answer.content;
    return JSON.stringify(data);
  } catch { return ""; }
}

async function getProfile(userId) { const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle(); return data; }
async function upsertProfile(userId, fields) { await supabase.from("profiles").upsert({ id: userId, ...fields }); }
async function markFeynmanOnboardingSeen(userId) { await upsertProfile(userId, { has_seen_onboarding: true }); }
async function getRoadmap(userId) { const { data } = await supabase.from("roadmaps").select("*").eq("user_id", userId).maybeSingle(); return data; }
async function upsertRoadmap(userId, roadmapData, meta = {}) { await supabase.from("roadmaps").upsert({ user_id: userId, title: roadmapData.title, data: roadmapData, ...meta }, { onConflict: "user_id" }); }
async function getProgress(userId) {
  const { data } = await supabase.from("progress").select("*").eq("user_id", userId).maybeSingle();
  if (!data) return { current_month:1, current_week:1, current_day:1, streak:0, completed_days:[], last_visit: new Date().toISOString().slice(0,10) };
  return data;
}
async function upsertProgress(userId, fields) { await supabase.from("progress").upsert({ user_id: userId, ...fields, updated_at: new Date().toISOString() }, { onConflict: "user_id" }); }
function initialProgressFields() { return { current_month:1, current_week:1, current_day:1, streak:0, completed_days:[], last_visit:new Date().toISOString().slice(0,10) }; }
async function saveTaskSubmission(userId, data) { await supabase.from("task_submissions").upsert({ user_id: userId, week_key: data.weekKey, career: data.career, task_title: data.taskTitle, answers: data.answers, feedback: data.feedback, submitted_at: new Date().toISOString() }, { onConflict: "user_id,week_key" }); }
async function getCachedLectures(userId, key) { const { data } = await supabase.from("lecture_cache").select("lectures").eq("user_id", userId).eq("roadmap_key", key).maybeSingle(); return data?.lectures || null; }
async function saveCachedLectures(userId, key, lectures) { await supabase.from("lecture_cache").upsert({ user_id: userId, roadmap_key: key, lectures }, { onConflict: "user_id,roadmap_key" }); }
// ── Friends ──────────────────────────────────────────────────────────────
async function searchProfiles(query, excludeUserId) {
  if (!query || !query.trim()) return [];
  const { data, error } = await supabase.from("profile_search").select("id,full_name").ilike("full_name", `%${query.trim()}%`).neq("id", excludeUserId).limit(15);
  if (error) return [];
  return data || [];
}
async function getFriendships(userId) {
  const { data, error } = await supabase.from("friendships").select("*").or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
  if (error) return [];
  return data || [];
}
async function getProfilesByIds(ids) {
  if (!ids.length) return {};
  const { data } = await supabase.from("profile_search").select("id,full_name").in("id", ids);
  const map = {};
  (data || []).forEach(p => { map[p.id] = p.full_name; });
  return map;
}
async function sendFriendRequest(requesterId, addresseeId) {
  return await supabase.from("friendships").insert({ requester_id: requesterId, addressee_id: addresseeId });
}
async function respondFriendRequest(id, status) {
  return await supabase.from("friendships").update({ status, responded_at: new Date().toISOString() }).eq("id", id);
}
async function removeFriendship(id) {
  return await supabase.from("friendships").delete().eq("id", id);
}

function roadmapSlug(roadmap) {
  const base = roadmap?.trackId || roadmap?.title || "roadmap";
  return String(base).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"").slice(0,60) || "roadmap";
}

function dbToProgress(row) {
  if (!row) return { currentMonth:1, currentWeek:1, currentDay:1, streak:0, completedDays:[] };
  return { currentMonth: row.current_month??1, currentWeek: row.current_week??1, currentDay: row.current_day??1, streak: row.streak??0, completedDays: row.completed_days??[], lastVisit: row.last_visit };
}
function progressToDb(p) { return { current_month: p.currentMonth, current_week: p.currentWeek, current_day: p.currentDay, streak: p.streak, completed_days: p.completedDays, last_visit: new Date().toISOString().slice(0,10) }; }

// ── Icons ──────────────────────────────────────────────────────────────────
const Icon = {
  ArrowRight: ()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
  ChevronLeft: ()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>,
  ChevronRight: ()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>,
  MessageCircle: ()=><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  Send: ()=><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  X: ()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Bell: ()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  Check: ()=><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  AlertCircle: ()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  LogOut: ()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  Eye: ()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  Award: ()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>,
  CheckSquare: ()=><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  Loader: ()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{animation:"spin 1s linear infinite"}}><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>,
  Menu: ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  BookOpen: ()=><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
  Star: ()=><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  Sparkles: ()=><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>,
  Laugh: ()=><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 13s1.5 3 4 3 4-3 4-3"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>,
  Child: ()=><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="7" r="4"/><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/></svg>,
  Lightbulb: ()=><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/></svg>,
  Globe: ()=><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>,
  Zap: ()=><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  Clipboard: ()=><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>,
  Sun: ()=><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4.5"/><line x1="12" y1="1.5" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22.5"/><line x1="3.5" y1="12" x2="1" y2="12"/><line x1="23" y1="12" x2="20.5" y2="12"/><line x1="5" y1="5" x2="6.8" y2="6.8"/><line x1="17.2" y1="17.2" x2="19" y2="19"/><line x1="19" y1="5" x2="17.2" y2="6.8"/><line x1="6.8" y1="17.2" x2="5" y2="19"/></svg>,
  Moon: ()=><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z"/></svg>,
  Users: ()=><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  UserPlus: ()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="17" y1="11" x2="23" y2="11"/></svg>,
  Search: ()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
};

// ── Hero illustration: an annotated notebook page, mid-Feynman-technique ───
// (crossed-out jargon, a simpler rewrite, Pip asking "why", a graded 10/10 —
// this is what actually happens inside the app, not a generic AI motif)
const NotebookHero = () => (
  <svg viewBox="0 0 480 500" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%"}}>
    <defs>
      <filter id="pageShadow" x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="20" stdDeviation="24" floodColor="#000" floodOpacity="0.4"/>
      </filter>
    </defs>

    {/* floating doodles */}
    <g opacity="0.55">
      <path d="M44 96 l6 -16 6 16 16 6 -16 6 -6 16 -6 -16 -16 -6Z" fill="#d9a854"><animate attributeName="opacity" values="0.55;1;0.55" dur="3.4s" repeatCount="indefinite"/></path>
      <circle cx="430" cy="430" r="4" fill="#8ba86a"><animate attributeName="cy" values="430;418;430" dur="3s" repeatCount="indefinite"/></circle>
      <path d="M416 70 q10 -14 22 -6" stroke="#8a5230" strokeWidth="2.5" fill="none" strokeLinecap="round"><animate attributeName="opacity" values="0.4;0.9;0.4" dur="2.6s" repeatCount="indefinite"/></path>
    </g>

    <g transform="rotate(-3 240 250)" filter="url(#pageShadow)">
      {/* paper */}
      <rect x="58" y="42" width="364" height="418" rx="8" fill="#f5f0e0"/>
      {/* spine shadow strip */}
      <rect x="58" y="42" width="18" height="418" rx="8" fill="#000" opacity="0.05"/>
      {/* spiral binding */}
      {Array.from({length:10},(_,i)=>(
        <circle key={i} cx="76" cy={70+i*40} r="6" fill="none" stroke="#b8ad98" strokeWidth="2.5"/>
      ))}
      {/* red margin rule */}
      <line x1="122" y1="58" x2="122" y2="444" stroke="#c0392b" strokeWidth="2" opacity="0.5"/>
      {/* blue ruled lines */}
      {Array.from({length:10},(_,i)=>(
        <line key={i} x1="96" y1={98+i*36} x2="404" y2={98+i*36} stroke="#6495ed" strokeOpacity="0.18" strokeWidth="1.5"/>
      ))}

      {/* crossed-out jargon */}
      <text x="140" y="112" fontFamily="var(--font-hand)" fontWeight="600" fontSize="27" fill="#4a5a35" opacity="0.6">the mitochondria is...</text>
      <line x1="136" y1="103" x2="368" y2="103" stroke="#8a5230" strokeWidth="3" strokeLinecap="round"/>

      {/* arrow down to the simple version */}
      <path d="M175 122 q26 22 8 46" stroke="#4a5a35" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      <path d="M178 160 l6 14 12 -8" stroke="#4a5a35" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>

      {/* simple rewrite, larger + bolder */}
      <text x="138" y="212" fontFamily="var(--font-hand)" fontWeight="700" fontSize="36" fill="#2b2013">"it's the cell's</text>
      <text x="138" y="252" fontFamily="var(--font-hand)" fontWeight="700" fontSize="36" fill="#2b2013">tiny battery!"</text>
      <path d="M136 262 q95 10 190 -4" stroke="#d9a854" strokeWidth="3" fill="none" strokeLinecap="round"/>

      {/* Pip's speech bubble */}
      <g transform="translate(320,178)">
        <path d="M-52 -30 q0 -18 20 -18 h64 q20 0 20 18 v30 q0 18 -20 18 h-38 l-18 18 q-2 -12 4 -18 h-12 q-20 0 -20 -18Z" fill="#fff" stroke="#8a5230" strokeWidth="2"/>
        <text x="0" y="-2" textAnchor="middle" fontFamily="var(--font-hand)" fontWeight="700" fontSize="22" fill="#8a5230">wait, why?</text>
      </g>

      {/* graded mark */}
      <g transform="translate(368,326) rotate(9)">
        <circle r="30" fill="none" stroke="#d9a854" strokeWidth="2.5" opacity="0.9"/>
        <text x="0" y="7" textAnchor="middle" fontFamily="var(--font-hand)" fontWeight="700" fontSize="19" fill="#d9a854">10/10</text>
      </g>
      <path d="M108 368 l14 16 26 -32" stroke="#7cae63" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>

      {/* footer note */}
      <text x="96" y="424" fontFamily="var(--font-hand)" fontWeight="600" fontSize="19" fill="#8a7f72">— explained to Pip, age 7</text>
    </g>
  </svg>
);

// ── Hero centerpiece: a faceted paper-sculpture brain ──────────────────────
// Built from a low-poly triangle mesh clipped to a brain silhouette, using
// only the linen/antique-white/champagne/bisque/ecru/khaki palette, with a
// light bias (top-left lit, bottom-right shadowed) so it reads like a folded
// paper object sitting under a softbox, not a screen glow. Original geometry.
const BRAIN_LIGHT = ["#fff8e7","#faf0e6","#faebd7","#f7e7ce"];
const BRAIN_DARK = ["#ffe4c4","#cdb891","#c3b091"];
function seededRand(seed){ const x = Math.sin(seed*12.9898)*43758.5453; return x-Math.floor(x); }
function buildBrainFacets(){
  const cols=11, rows=11, w=500/cols, h=460/rows, offY=20;
  const pts=[];
  for(let r=0;r<=rows;r++){
    for(let c=0;c<=cols;c++){
      const jitterX=(seededRand(r*97+c*13)-0.5)*w*0.75;
      const jitterY=(seededRand(r*61+c*29+500)-0.5)*h*0.75;
      pts.push([c*w+jitterX, r*h+offY+jitterY]);
    }
  }
  const tris=[]; let idx=0;
  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      const i0=r*(cols+1)+c, i1=i0+1, i2=i0+cols+1, i3=i2+1;
      const bias=(r+c)/(rows+cols);
      [[i0,i1,i2],[i1,i3,i2]].forEach(tri=>{
        idx++;
        const lit = seededRand(idx*3.7) > bias*0.85;
        const pool = lit ? BRAIN_LIGHT : BRAIN_DARK;
        const fill = pool[Math.floor(seededRand(idx*7.3)*pool.length)];
        tris.push({p:tri.map(i=>pts[i]), fill});
      });
    }
  }
  return tris;
}
const BRAIN_FACETS = buildBrainFacets();
const OrigamiBrain = () => (
  <svg viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%",overflow:"visible"}}>
    <defs>
      <clipPath id="brainSilhouette">
        <path d="M150 180 C130 160 110 170 105 195 C100 215 108 235 115 250 C125 270 120 290 130 305 C145 325 165 330 180 320 C195 335 200 350 215 355 C235 362 255 355 260 340 L255 180 C235 165 210 165 195 172 C180 158 165 162 150 180Z"/>
        <path d="M350 180 C370 160 390 170 395 195 C400 215 392 235 385 250 C375 270 380 290 370 305 C355 325 335 330 320 320 C305 335 300 350 285 355 C265 362 245 355 240 340 L245 180 C265 165 290 165 305 172 C320 158 335 162 350 180Z"/>
        <path d="M225 340 L235 355 L232 400 Q232 415 245 418 L255 418 Q268 415 268 400 L265 355 L275 340Z"/>
      </clipPath>
      <filter id="brainShadow" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="22" stdDeviation="20" floodColor="#2b2013" floodOpacity="0.28"/>
      </filter>
    </defs>
    <ellipse cx="250" cy="430" rx="150" ry="18" fill="#2b2013" opacity="0.12"/>
    <g filter="url(#brainShadow)">
      <g clipPath="url(#brainSilhouette)">
        {BRAIN_FACETS.map((t,i)=>(
          <polygon key={i} points={t.p.map(p=>p.join(",")).join(" ")} fill={t.fill} stroke="#8a7550" strokeOpacity="0.3" strokeWidth="0.75"/>
        ))}
      </g>
      <path d="M150 180 C130 160 110 170 105 195 C100 215 108 235 115 250 C125 270 120 290 130 305 C145 325 165 330 180 320 C195 335 200 350 215 355 C235 362 255 355 260 340 L255 180 C235 165 210 165 195 172 C180 158 165 162 150 180Z" fill="none" stroke="#7a6a4f" strokeWidth="1.5" opacity="0.4"/>
      <path d="M350 180 C370 160 390 170 395 195 C400 215 392 235 385 250 C375 270 380 290 370 305 C355 325 335 330 320 320 C305 335 300 350 285 355 C265 362 245 355 240 340 L245 180 C265 165 290 165 305 172 C320 158 335 162 350 180Z" fill="none" stroke="#7a6a4f" strokeWidth="1.5" opacity="0.4"/>
    </g>
  </svg>
);
const ProfessorAvatar = ({ size = 44, mood = "normal" }) => {
  return (
    <svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" width={size} height={size}>
      <defs>
        <radialGradient id="profGrad" cx="40%" cy="30%" r="60%">
          <stop offset="0%" stopColor="#c3d4a8"/>
          <stop offset="100%" stopColor="#3d2f1e"/>
        </radialGradient>
      </defs>
      {/* Head */}
      <circle cx="30" cy="22" r="16" fill="url(#profGrad)" />
      {/* Glasses */}
      <rect x="16" y="18" width="10" height="7" rx="3" fill="none" stroke="#faf0e6" strokeWidth="1.5" opacity="0.8"/>
      <rect x="34" y="18" width="10" height="7" rx="3" fill="none" stroke="#faf0e6" strokeWidth="1.5" opacity="0.8"/>
      <line x1="26" y1="21" x2="34" y2="21" stroke="#faf0e6" strokeWidth="1.5" opacity="0.8"/>
      <line x1="13" y1="21" x2="16" y2="21" stroke="#faf0e6" strokeWidth="1.5" opacity="0.8"/>
      <line x1="44" y1="21" x2="47" y2="21" stroke="#faf0e6" strokeWidth="1.5" opacity="0.8"/>
      {/* Eyes */}
      {mood === "wink" ? (
        <>
          <circle cx="21" cy="21" r="2" fill="#faf0e6" opacity="0.9"/>
          <path d="M33 21 Q36 19 39 21" stroke="#faf0e6" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
        </>
      ) : (
        <>
          <circle cx="21" cy="21" r="2" fill="#faf0e6" opacity="0.9"/>
          <circle cx="39" cy="21" r="2" fill="#faf0e6" opacity="0.9"/>
        </>
      )}
      {/* Smile */}
      {mood === "laugh" ? (
        <path d="M22 30 Q30 37 38 30" stroke="#faf0e6" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
      ) : (
        <path d="M23 29 Q30 34 37 29" stroke="#faf0e6" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      )}
      {/* Body / gown */}
      <path d="M14 42 Q14 36 22 35 L30 38 L38 35 Q46 36 46 42 L46 58 L14 58Z" fill="#333f24" opacity="0.9"/>
      {/* Collar */}
      <path d="M25 35 L30 42 L35 35" fill="#c3d4a8" opacity="0.6"/>
      {/* Grad cap */}
      <rect x="17" y="7" width="26" height="4" rx="1" fill="#1a1714"/>
      <polygon points="30,2 44,9 30,12 16,9" fill="#2a2520"/>
      <line x1="44" y1="9" x2="47" y2="16" stroke="#d9a854" strokeWidth="1.5"/>
      <circle cx="47" cy="17" r="2" fill="#d9a854"/>
    </svg>
  );
};

// ── Child Bot SVG ──────────────────────────────────────────────────────────
const ChildBotAvatar = ({ size = 44, mood = "curious" }) => (
  <svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" width={size} height={size}>
    <defs>
      <radialGradient id="childGrad" cx="40%" cy="30%" r="60%">
        <stop offset="0%" stopColor="#fde68a"/>
        <stop offset="100%" stopColor="#d99a52"/>
      </radialGradient>
    </defs>
    {/* Head */}
    <circle cx="30" cy="22" r="16" fill="url(#childGrad)"/>
    {/* Antenna */}
    <line x1="30" y1="6" x2="30" y2="1" stroke="#d99a52" strokeWidth="2"/>
    <circle cx="30" cy="1" r="2.5" fill="#fbbf24">
      <animate attributeName="r" values="2.5;3.5;2.5" dur="1.8s" repeatCount="indefinite"/>
      <animate attributeName="fill" values="#fbbf24;#fde68a;#fbbf24" dur="1.8s" repeatCount="indefinite"/>
    </circle>
    {/* Eyes */}
    {mood === "thinking" ? (
      <>
        <circle cx="23" cy="20" r="3.5" fill="#1a1714" opacity="0.9"/>
        <circle cx="37" cy="20" r="3.5" fill="#1a1714" opacity="0.9"/>
        <circle cx="24.2" cy="19" r="1" fill="white"/>
        <circle cx="38.2" cy="19" r="1" fill="white"/>
        {/* Eyebrow raised */}
        <path d="M20 15 Q23 13 26 15" stroke="#d97706" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      </>
    ) : (
      <>
        <circle cx="23" cy="20" r="3.5" fill="#1a1714" opacity="0.9"/>
        <circle cx="37" cy="20" r="3.5" fill="#1a1714" opacity="0.9"/>
        <circle cx="24.2" cy="19" r="1" fill="white"/>
        <circle cx="38.2" cy="19" r="1" fill="white"/>
      </>
    )}
    {/* Mouth */}
    {mood === "happy" ? (
      <path d="M22 28 Q30 35 38 28" stroke="#92400e" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
    ) : mood === "thinking" ? (
      <path d="M24 29 Q30 28 36 31" stroke="#92400e" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    ) : (
      <circle cx="30" cy="29" r="3" fill="#92400e" opacity="0.8"/>
    )}
    {/* Rosy cheeks */}
    <circle cx="18" cy="26" r="4" fill="#fca5a5" opacity="0.4"/>
    <circle cx="42" cy="26" r="4" fill="#fca5a5" opacity="0.4"/>
    {/* Body */}
    <path d="M16 43 Q16 37 24 36 L30 39 L36 36 Q44 37 44 43 L44 58 L16 58Z" fill="#fbbf24" opacity="0.8"/>
    {/* Overalls bib */}
    <path d="M24 36 L30 42 L36 36 Q36 44 30 44 Q24 44 24 36Z" fill="#d97706" opacity="0.7"/>
    {/* Little star badge */}
    <circle cx="22" cy="48" r="4" fill="#fde68a" opacity="0.9"/>
    <text x="22" y="50.5" textAnchor="middle" fontSize="5" fill="#92400e">★</text>
  </svg>
);

// ── CSS ────────────────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,600&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&family=DM+Mono:wght@400;500&family=Caveat:wght@500;600;700&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  :root{
    --bg:#fff8e7;--bg2:#f7e7ce;--surface:#faf0e6;--surface2:#f7e7ce;--surface3:#ffe4c4;
    --ecru:#cdb891;--khaki:#c3b091;
    --border:rgba(43,32,19,0.14);--border2:rgba(43,32,19,0.24);--border3:rgba(43,32,19,0.38);
    --ink:#2b2013;--ink2:#4a3c28;--muted:#7a6a4f;--subtle:#a89572;
    --accent:#333f24;--accent2:#4a5a35;--accent3:#5f7245;
    --gold:#8a5c23;--gold2:#6e491b;
    --emerald:#3f5c2e;--ember:#7a3b3b;
    --child:#a3672f;--rust:#8a5230;
    --sage:#adb99c;--sage-deep:#7c8a68;--sage-ink:#37402c;
    --gold-light:color-mix(in srgb,var(--gold) 12%,transparent);--gold-border:color-mix(in srgb,var(--gold) 34%,transparent);
    --emerald-light:color-mix(in srgb,var(--emerald) 12%,transparent);--ember-light:color-mix(in srgb,var(--ember) 12%,transparent);
    --blue-light:color-mix(in srgb,var(--accent2) 12%,transparent);
    --child-light:color-mix(in srgb,var(--child) 14%,transparent);--child-border:color-mix(in srgb,var(--child) 36%,transparent);
    --rust-light:color-mix(in srgb,var(--rust) 14%,transparent);--rust-border:color-mix(in srgb,var(--rust) 36%,transparent);
    --r:2px;--font:'DM Sans',system-ui,sans-serif;--font-display:'Cormorant Garamond',Georgia,serif;--font-mono:'DM Mono',monospace;--font-hand:'Caveat',cursive;
  }
  [data-theme="dark"]{
    --bg:#1c150e;--bg2:#241b12;--surface:#2a2016;--surface2:#33261a;--surface3:#3d2d1e;
    --ecru:#a89170;--khaki:#8f7d5c;
    --border:rgba(250,240,220,0.10);--border2:rgba(250,240,220,0.18);--border3:rgba(250,240,220,0.28);
    --ink:#f7f0e0;--ink2:#d9cbb0;--muted:#a89572;--subtle:#7a6a52;
    --accent:#9db97f;--accent2:#8ba86a;--accent3:#c3d4a8;
    --gold:#d9a854;--gold2:#cdb891;
    --emerald:#7cae63;--ember:#c56a5a;
    --child:#d99a52;--rust:#c1885c;
    --sage:#5c6b4a;--sage-deep:#465236;--sage-ink:#e8ead9;
  }
  html{scroll-behavior:smooth;}
  body{font-family:var(--font);background:var(--bg);color:var(--ink);min-height:100vh;width:100%;overflow-x:hidden;-webkit-font-smoothing:antialiased;transition:background-color 0.3s ease,color 0.3s ease;}
  body::after{content:'';position:fixed;inset:0;z-index:9999;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.035'/%3E%3C/svg%3E");pointer-events:none;opacity:0.4;}
  #root{width:100%;position:relative;z-index:1;}
  h1,h2,h3{font-family:var(--font-display);letter-spacing:-0.01em;}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes fadeUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
  @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-18px)}}
  @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
  @keyframes pulse{0%,100%{opacity:0.6}50%{opacity:1}}
  @keyframes bounceIn{0%{opacity:0;transform:scale(0.3) translateY(40px)}60%{transform:scale(1.08) translateY(-8px)}80%{transform:scale(0.97) translateY(3px)}100%{opacity:1;transform:scale(1) translateY(0)}}
  @keyframes slideUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
  @keyframes confettiFall{0%{transform:translateY(-10px) rotate(0deg);opacity:1}100%{transform:translateY(100vh) rotate(720deg);opacity:0}}
  @keyframes welcomePop{0%{opacity:0;transform:scale(0.7)}70%{transform:scale(1.04)}100%{opacity:1;transform:scale(1)}}
  @keyframes ripple{0%{transform:scale(1);opacity:0.4}100%{transform:scale(2.2);opacity:0}}
  @keyframes childTyping{0%,100%{opacity:0.4}50%{opacity:1}}
  @keyframes popIn{0%{opacity:0;transform:scale(0.5) translateY(10px)}80%{transform:scale(1.05)}100%{opacity:1;transform:scale(1) translateY(0)}}
  @keyframes jokePop{0%{opacity:0;transform:translateX(-16px) scale(0.92)}100%{opacity:1;transform:translateX(0) scale(1)}}
  @keyframes waveHand{0%,100%{transform:rotate(0deg)}25%{transform:rotate(-20deg)}75%{transform:rotate(20deg)}}
  .page{animation:fadeUp 0.5s cubic-bezier(0.22,1,0.36,1) both;}
  .nav{position:fixed;top:0;left:0;right:0;z-index:200;height:60px;padding:0 40px;display:flex;align-items:center;justify-content:space-between;background:color-mix(in srgb,var(--bg) 86%,transparent);backdrop-filter:blur(20px);border-bottom:1px solid var(--border);}
  .theme-toggle{display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:999px;border:1px solid var(--border2);background:var(--surface2);color:var(--ink2);cursor:pointer;transition:all 0.15s;flex-shrink:0;}
  .theme-toggle:hover{border-color:var(--border3);color:var(--ink);}
  .nav-logo{font-family:var(--font);font-weight:700;font-size:14px;color:var(--ink);letter-spacing:0.05em;text-transform:uppercase;display:flex;align-items:center;gap:8px;}
  .nav-logo-dot{width:6px;height:6px;background:var(--accent2);border-radius:50%;box-shadow:0 0 8px var(--accent2);animation:pulse 2s ease-in-out infinite;}
  .nav-links{display:flex;align-items:center;gap:4px;}
  .nav-link{font-size:13px;font-weight:400;color:var(--muted);background:none;border:none;cursor:pointer;padding:6px 12px;border-radius:6px;font-family:var(--font);transition:all 0.15s;}
  .nav-link:hover{color:var(--ink);}
  .nav-link.active{color:var(--ink);font-weight:500;}
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;font-family:var(--font);font-size:13px;font-weight:500;cursor:pointer;transition:all 0.2s;border:none;border-radius:var(--r);outline:none;white-space:nowrap;letter-spacing:0.01em;}
  .btn:disabled{opacity:0.35;cursor:not-allowed;}
  .btn-primary{background:var(--ink);color:var(--bg);padding:10px 22px;letter-spacing:0.02em;}
  .btn-primary:hover:not(:disabled){background:var(--ink2);transform:translateY(-1px);}
  .btn-outline{background:transparent;color:var(--ink);padding:10px 22px;border:1px solid var(--border2);}
  .btn-outline:hover:not(:disabled){border-color:var(--border3);background:var(--surface2);}
  .btn-secondary{background:var(--surface2);color:var(--ink2);padding:10px 20px;border:1px solid var(--border);}
  .btn-secondary:hover:not(:disabled){background:var(--surface3);border-color:var(--border2);color:var(--ink);}
  .btn-ghost{background:transparent;color:var(--muted);padding:7px 11px;}
  .btn-ghost:hover:not(:disabled){color:var(--ink2);background:var(--surface2);}
  .btn-gold{background:var(--gold);color:var(--bg);padding:10px 22px;font-weight:600;}
  .btn-gold:hover:not(:disabled){background:var(--gold2);transform:translateY(-1px);}
  .btn-child{background:var(--child-light);color:var(--child);padding:10px 22px;font-weight:600;border:1px solid var(--child-border);}
  .btn-child:hover:not(:disabled){background:rgba(163,103,47,0.18);transform:translateY(-1px);}
  .btn-lg{padding:13px 28px;font-size:14px;border-radius:10px;letter-spacing:0.03em;}
  .btn-sm{padding:6px 14px;font-size:12px;}
  .btn-icon{padding:7px;}
  .card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);transition:border-color 0.2s,background 0.2s;}
  .card:hover{border-color:var(--border2);}
  .card-p{padding:24px;}
  .card-p-lg{padding:32px;}
  .notepad{background:#f5f0e0;border-radius:4px;padding:32px 36px;position:relative;box-shadow:0 20px 60px rgba(0,0,0,0.5),0 4px 12px rgba(0,0,0,0.3);color:#1a1714;}
  .notepad::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:repeating-linear-gradient(90deg,#c0392b 0px,#c0392b 8px,transparent 8px,transparent 12px);}
  .notepad-lines{position:absolute;inset:0;top:12px;background-image:repeating-linear-gradient(transparent,transparent 27px,rgba(100,149,237,0.2) 27px,rgba(100,149,237,0.2) 28px);pointer-events:none;border-radius:4px;}
  .notepad-pin{position:absolute;top:-12px;left:50%;transform:translateX(-50%);width:18px;height:18px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#7ecef4,#2196f3);box-shadow:0 2px 8px rgba(33,150,243,0.5);}
  .notepad-tag{font-family:var(--font-mono);font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:#8a7f72;margin-bottom:14px;}
  .notepad-title{font-family:var(--font-mono);font-size:clamp(22px,3vw,32px);font-weight:700;color:#1a1714;line-height:1.2;margin-bottom:16px;}
  .notepad-title em{font-style:italic;color:#4a5a35;font-family:var(--font-display);}
  .notepad-body{font-family:var(--font-mono);font-size:13px;line-height:2;color:#3d3832;}
  .field{display:flex;flex-direction:column;gap:6px;}
  .label{font-size:11px;font-weight:500;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;font-family:var(--font-mono);}
  .input{border:1px solid var(--border2);border-radius:var(--r);padding:10px 14px;font-family:var(--font);font-size:14px;color:var(--ink);background:var(--surface2);outline:none;transition:all 0.15s;}
  .input:focus{border-color:var(--accent2);box-shadow:0 0 0 3px rgba(74,90,53,0.1);background:var(--surface3);}
  .input::placeholder{color:var(--subtle);}
  textarea.input{resize:vertical;min-height:88px;line-height:1.6;}
  select.input{cursor:pointer;}
  select.input option{background:var(--surface2);color:var(--ink);}
  .badge{display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:500;font-family:var(--font-mono);}
  .badge-gold{background:var(--gold-light);color:var(--gold);border:1px solid var(--gold-border);}
  .badge-green{background:var(--emerald-light);color:var(--emerald);border:1px solid rgba(63,92,46,0.2);}
  .badge-red{background:var(--ember-light);color:var(--ember);border:1px solid rgba(122,59,59,0.2);}
  .badge-blue{background:var(--blue-light);color:var(--accent2);border:1px solid rgba(74,90,53,0.2);}
  .badge-neutral{background:var(--surface2);color:var(--ink2);border:1px solid var(--border2);}
  .badge-child{background:var(--child-light);color:var(--child);border:1px solid var(--child-border);}
  .progress-track{background:var(--surface2);border-radius:999px;overflow:hidden;}
  .progress-fill{height:100%;border-radius:999px;background:var(--accent2);transition:width 0.6s cubic-bezier(0.22,1,0.36,1);}
  .progress-fill-gold{background:var(--gold);}
  .progress-fill-green{background:var(--emerald);}
  .progress-fill-child{background:var(--child);}
  .container{max-width:900px;margin:0 auto;padding:0 24px;}
  .container-wide{max-width:1200px;margin:0 auto;padding:0 40px;}
  .stack{display:flex;flex-direction:column;}
  .row{display:flex;align-items:center;}
  .gap-2{gap:2px}.gap-4{gap:4px}.gap-6{gap:6px}.gap-7{gap:7px}.gap-8{gap:8px}.gap-10{gap:10px}.gap-12{gap:12px}.gap-14{gap:14px}.gap-16{gap:16px}.gap-20{gap:20px}.gap-24{gap:24px}.gap-32{gap:32px}
  .divider{display:flex;align-items:center;gap:12px;color:var(--muted);font-size:13px;}
  .divider::before,.divider::after{content:"";flex:1;height:1px;background:var(--border);}
  .stat-card{padding:20px 22px;}
  .stat-label{font-size:10px;font-weight:500;color:var(--muted);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;font-family:var(--font-mono);}
  .stat-value{font-size:32px;font-weight:600;color:var(--ink);letter-spacing:-0.02em;line-height:1;font-family:var(--font-display);font-style:italic;}
  .stat-sub{font-size:12px;color:var(--muted);margin-top:4px;font-family:var(--font-mono);}
  .learn-page{padding-top:84px;padding-bottom:64px;background:var(--sage);box-shadow:0 0 0 100vmax var(--sage);clip-path:inset(0 -100vmax);position:relative;}
  .learn-header{position:relative;overflow:hidden;margin-bottom:24px;padding:28px 32px;border-radius:14px;background:linear-gradient(135deg,var(--surface) 0%,rgba(74,90,53,0.08) 100%);border:1px solid var(--border2);}
  .learn-header::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--accent2),var(--gold),transparent);}
  .learn-header-top{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:16px;}
  .learn-header-title{font-family:var(--font-display);font-size:clamp(22px,3vw,28px);font-weight:500;line-height:1.25;margin-bottom:6px;}
  .learn-header-meta{font-size:12px;color:var(--muted);font-family:var(--font-mono);}
  .learn-day-ring{width:52px;height:52px;border-radius:50%;background:var(--surface2);border:2px solid var(--border2);display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0;}
  .learn-day-ring-num{font-family:var(--font-display);font-size:20px;font-weight:600;line-height:1;color:var(--ink);}
  .learn-day-ring-label{font-size:8px;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);font-family:var(--font-mono);margin-top:1px;}
  .learn-step-dots{display:flex;gap:6px;align-items:center;}
  .learn-step-dot{flex:1;height:4px;border-radius:999px;background:var(--surface3);transition:all 0.3s;cursor:pointer;border:none;padding:0;}
  .learn-step-dot.done{background:rgba(74,90,53,0.35);}
  .learn-step-dot.active{background:var(--accent2);box-shadow:0 0 10px rgba(74,90,53,0.5);}
  .learn-layout{display:grid;grid-template-columns:260px 1fr;gap:20px;align-items:start;}
  .learn-sidebar{position:sticky;top:84px;display:flex;flex-direction:column;gap:10px;}
  .learn-sidebar-card{padding:14px;}
  .learn-sidebar-label{font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:0.12em;color:var(--muted);margin-bottom:10px;font-family:var(--font-mono);padding:0 4px;}
  .lec-list-item{display:flex;align-items:flex-start;gap:10px;padding:11px 12px;border-radius:10px;cursor:pointer;transition:all 0.18s;font-size:12px;color:var(--muted);border:1px solid transparent;text-align:left;background:none;width:100%;font-family:var(--font);position:relative;}
  .lec-list-item:hover{background:var(--surface2);color:var(--ink2);border-color:var(--border);}
  .lec-list-item.active{background:rgba(74,90,53,0.1);border-color:rgba(74,90,53,0.35);color:var(--ink);font-weight:500;box-shadow:0 0 0 1px rgba(74,90,53,0.1);}
  .lec-list-item.done:not(.active){color:var(--ink2);}
  .lec-list-item.active::before{content:'';position:absolute;left:0;top:8px;bottom:8px;width:3px;border-radius:0 3px 3px 0;background:var(--accent2);}
  .lec-num{width:24px;height:24px;border-radius:8px;background:var(--surface3);border:1px solid var(--border2);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;color:var(--muted);flex-shrink:0;font-family:var(--font-mono);transition:all 0.18s;}
  .lec-list-item.active .lec-num{background:var(--accent2);border-color:var(--accent2);color:#fff;box-shadow:0 2px 8px rgba(74,90,53,0.4);}
  .lec-list-item.done .lec-num{background:rgba(63,92,46,0.12);border-color:rgba(63,92,46,0.3);color:var(--emerald);}
  .lec-list-title{line-height:1.45;flex:1;padding-top:2px;}
  .lec-pills{display:none;gap:6px;overflow-x:auto;padding-bottom:4px;margin-bottom:16px;scrollbar-width:none;}
  .lec-pills::-webkit-scrollbar{display:none;}
  .lec-pill{flex-shrink:0;padding:8px 14px;border-radius:999px;font-size:12px;font-family:var(--font-mono);cursor:pointer;border:1px solid var(--border2);background:var(--surface2);color:var(--muted);transition:all 0.15s;white-space:nowrap;}
  .lec-pill:hover{border-color:var(--border3);color:var(--ink2);}
  .lec-pill.active{background:rgba(74,90,53,0.15);border-color:rgba(74,90,53,0.4);color:var(--ink);font-weight:500;}
  .lec-content-card{overflow:hidden;background:var(--surface);border:none;border-radius:0;transform:rotate(-0.6deg);box-shadow:0 2px 4px rgba(43,32,19,0.06),0 18px 40px -14px rgba(43,32,19,0.35),0 0 0 1px rgba(43,32,19,0.05);clip-path:polygon(0.5% 2%,3% 0%,22% 1%,41% 0.3%,58% 1.2%,77% 0%,96% 1.5%,99.5% 0.5%,100% 18%,99.2% 39%,100% 61%,99.4% 83%,100% 97.5%,97% 100%,79% 99%,60% 100%,42% 99.3%,24% 100%,4% 98.8%,0% 99.5%,0.6% 82%,0% 60%,0.8% 38%,0% 20%);}
  .lec-content-header{display:flex;align-items:flex-start;gap:16px;padding-bottom:22px;margin-bottom:22px;border-bottom:1px dashed var(--border2);}
  .lec-content-num{width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;font-weight:600;font-size:18px;color:#fff;flex-shrink:0;font-family:var(--font-display);box-shadow:0 4px 16px rgba(74,90,53,0.35);}
  .lec-content-title{font-family:var(--font-hand);font-size:clamp(28px,3.4vw,38px);font-weight:700;line-height:1.15;color:var(--sage-deep);}
  .lec-content-sub{font-size:11px;color:var(--muted);font-family:var(--font-mono);margin-top:6px;}
  .lec-sections{display:flex;flex-direction:column;gap:12px;margin-bottom:22px;}
  .lec-section{display:flex;gap:14px;padding:16px 18px;border-radius:12px;border:1px solid var(--border);background:var(--surface2);transition:border-color 0.2s;}
  .lec-section:hover{border-color:var(--border2);}
  .lec-section-icon{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
  .lec-section-icon-blue{background:rgba(74,90,53,0.12);color:var(--accent2);}
  .lec-section-icon-green{background:rgba(63,92,46,0.1);color:var(--emerald);}
  .lec-section-icon-red{background:rgba(122,59,59,0.1);color:var(--ember);}
  .lec-section-icon-gold{background:rgba(138,92,35,0.12);color:var(--gold);}
  .lec-section-body{flex:1;min-width:0;}
  .lec-section-label{font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;font-family:var(--font-mono);}
  .lec-section-label-blue{color:var(--accent2);}
  .lec-section-label-green{color:var(--emerald);}
  .lec-section-label-red{color:var(--ember);}
  .lec-section-label-gold{color:var(--gold);}
  .lec-text{font-size:14px;line-height:1.75;color:var(--ink2);}
  .lec-takeaway{display:flex;gap:14px;padding:18px 20px;border-radius:12px;background:linear-gradient(135deg,rgba(138,92,35,0.08),rgba(138,92,35,0.03));border:1px solid var(--gold-border);margin-bottom:14px;}
  .lec-takeaway-icon{color:var(--gold);flex-shrink:0;padding-top:2px;}
  .lec-takeaway-label{font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:0.1em;color:var(--gold);margin-bottom:5px;font-family:var(--font-mono);}
  .lec-takeaway-text{font-family:var(--font-hand);font-size:22px;font-weight:700;color:var(--ink);line-height:1.35;}
  .lec-homework{padding:18px 20px;border-radius:12px;background:var(--surface2);border:1px solid var(--border);margin-bottom:22px;}
  .lec-homework-label{font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:0.1em;color:var(--muted);margin-bottom:12px;font-family:var(--font-mono);display:flex;align-items:center;gap:6px;}
  .lec-homework-item{display:flex;gap:12px;align-items:flex-start;padding:10px 0;}
  .lec-homework-item:not(:last-child){border-bottom:1px solid var(--border);}
  .lec-homework-num{width:22px;height:22px;border-radius:6px;background:var(--accent2);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;color:#fff;flex-shrink:0;font-family:var(--font-mono);}
  .lec-nav-row{display:flex;gap:10px;justify-content:space-between;flex-wrap:wrap;padding-top:4px;}
  .lec-progress-wrap{margin-bottom:20px;}
  .lec-progress-meta{display:flex;justify-content:space-between;margin-bottom:8px;font-size:11px;color:var(--muted);font-family:var(--font-mono);}
  .lec-progress-track{height:6px;border-radius:999px;background:var(--surface3);overflow:hidden;}
  .lec-progress-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,var(--accent),var(--accent2));transition:width 0.5s cubic-bezier(0.22,1,0.36,1);box-shadow:0 0 12px rgba(74,90,53,0.4);}
  .prof-ask-card{position:relative;overflow:hidden;}
  .prof-ask-card::before{content:'';position:absolute;top:0;right:0;width:120px;height:120px;background:radial-gradient(circle,rgba(74,90,53,0.12) 0%,transparent 70%);pointer-events:none;}
  .prof-ask-header{display:flex;align-items:center;gap:12px;margin-bottom:14px;}
  .prof-ask-avatar{width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,var(--accent),#3d2f1e);display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 4px 12px rgba(74,90,53,0.3);}
  .learn-loading{display:flex;align-items:center;justify-content:center;min-height:60vh;flex-direction:column;gap:20px;padding-top:80px;}
  .learn-loading-ring{width:48px;height:48px;border:2px solid var(--border2);border-top:2px solid var(--accent2);border-radius:50%;animation:spin 0.8s linear infinite;}
  .learn-loading-text{font-size:13px;color:var(--muted);font-family:var(--font-mono);}
  .learn-loading-sub{font-size:11px;color:var(--subtle);font-family:var(--font-mono);}
  .answer-box{margin-top:14px;padding:14px 18px;background:var(--surface2);border:1px solid var(--border);border-left:3px solid var(--accent2);border-radius:var(--r);font-size:14px;line-height:1.75;color:var(--ink2);white-space:pre-wrap;}
  .mcq-option{display:block;width:100%;text-align:left;padding:11px 15px;border:1px solid var(--border);border-radius:var(--r);background:var(--surface2);font-family:var(--font);font-size:13px;color:var(--ink2);cursor:pointer;transition:all 0.12s;}
  .mcq-option:hover{border-color:var(--accent2);color:var(--ink);background:var(--surface3);}
  .mcq-option.selected{border-color:var(--accent2);background:rgba(74,90,53,0.08);color:var(--ink);font-weight:500;}
  .mcq-option.correct{border-color:var(--emerald);background:var(--emerald-light);color:var(--emerald);}
  .mcq-option.wrong{border-color:var(--ember);background:var(--ember-light);color:var(--ember);}
  .btn-google{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:10px 18px;background:var(--surface2);border:1px solid var(--border2);border-radius:var(--r);font-family:var(--font);font-size:13px;font-weight:500;color:var(--ink2);cursor:pointer;transition:all 0.15s;}
  .btn-google:hover{background:var(--surface3);border-color:var(--border3);color:var(--ink);}
  .quick-track-card{display:flex;flex-direction:column;gap:5px;text-align:left;padding:12px;border-radius:8px;border:1px solid var(--border);border-left:2px solid var(--track-accent);background:var(--surface);color:var(--ink);font-family:var(--font);cursor:pointer;transition:all 0.18s;min-height:118px;}
  .quick-track-card:hover{transform:translateY(-1px);background:var(--surface2);border-color:var(--border2);}
  .quick-track-card strong{font-size:14px;font-weight:600;line-height:1.25;}
  .quick-track-card span:last-child{font-size:11px;line-height:1.5;color:var(--muted);}
  .quick-track-label{font-family:var(--font-mono);font-size:9px!important;letter-spacing:0.12em;text-transform:uppercase;color:var(--track-accent)!important;}
  .demo-banner{background:var(--surface);border-bottom:1px solid var(--border);padding:9px 24px;display:flex;align-items:center;justify-content:center;gap:14px;font-size:12px;color:var(--ink2);position:fixed;top:60px;left:0;right:0;z-index:150;}
  .section-label{font-family:var(--font-mono);font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:var(--muted);display:flex;align-items:center;gap:12px;}
  .section-label::after{content:'';flex:1;height:1px;background:var(--border);}
  .hamburger{display:none;background:none;border:none;cursor:pointer;color:var(--ink);padding:6px;}
  .mobile-nav{display:none;position:fixed;top:60px;left:0;right:0;bottom:0;background:rgba(14,12,10,0.97);z-index:199;flex-direction:column;align-items:center;justify-content:center;gap:8px;}
  .mobile-nav.open{display:flex;}
  .mobile-nav-link{font-size:20px;font-weight:400;color:var(--ink2);background:none;border:none;cursor:pointer;padding:12px 24px;font-family:var(--font);transition:color 0.15s;}
  .mobile-nav-link:hover,.mobile-nav-link.active{color:var(--ink);}
  .toggle-row{display:flex;align-items:center;justify-content:space-between;padding:14px 0;border-bottom:1px solid var(--border);}
  .toggle-row:last-child{border-bottom:none;}
  .toggle{position:relative;width:44px;height:24px;flex-shrink:0;}
  .toggle input{opacity:0;width:0;height:0;}
  .toggle-slider{position:absolute;inset:0;background:var(--surface3);border-radius:24px;transition:0.2s;cursor:pointer;border:1px solid var(--border2);}
  .toggle-slider::before{content:"";position:absolute;height:18px;width:18px;left:2px;bottom:2px;background:var(--muted);border-radius:50%;transition:0.2s;}
  .toggle input:checked + .toggle-slider{background:var(--accent2);border-color:var(--accent2);}
  .toggle input:checked + .toggle-slider::before{transform:translateX(20px);background:#fff;}

  /* ── Welcome Screen ── */
  .welcome-overlay{position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;background:rgba(8,6,4,0.96);backdrop-filter:blur(16px);}
  .welcome-card{background:var(--surface);border:1px solid var(--border2);border-radius:20px;padding:48px 40px;max-width:480px;width:90%;text-align:center;position:relative;overflow:hidden;animation:welcomePop 0.6s cubic-bezier(0.22,1,0.36,1) both;}
  .welcome-card::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 50% 0%, rgba(74,90,53,0.15) 0%, transparent 70%);pointer-events:none;}
  .welcome-rings{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;}
  .welcome-ring{position:absolute;border-radius:50%;border:1px solid rgba(74,90,53,0.2);animation:ripple 3s ease-out infinite;}
  .confetti-piece{position:fixed;width:8px;height:8px;border-radius:2px;animation:confettiFall linear forwards;pointer-events:none;z-index:9001;}
  .welcome-avatar{animation:bounceIn 0.8s cubic-bezier(0.22,1,0.36,1) 0.2s both;}
  .welcome-title{animation:slideUp 0.6s ease 0.4s both;opacity:0;}
  .welcome-sub{animation:slideUp 0.6s ease 0.55s both;opacity:0;}
  .welcome-btn{animation:slideUp 0.6s ease 0.7s both;opacity:0;}
  .feynman-page{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:96px 24px 56px;background:radial-gradient(ellipse at 50% 0%,rgba(74,90,53,0.14),transparent 62%),var(--bg);}
  .feynman-card{width:100%;max-width:760px;position:relative;overflow:hidden;}
  .feynman-card::before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 18% 0%,rgba(138,92,35,0.10),transparent 54%);pointer-events:none;}
  .feynman-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:22px 0 26px;position:relative;z-index:1;}
  .feynman-step{background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:16px;min-height:150px;}
  .feynman-step-num{width:26px;height:26px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:rgba(74,90,53,0.14);border:1px solid rgba(74,90,53,0.28);color:var(--accent2);font-family:var(--font-mono);font-size:11px;font-weight:600;margin-bottom:12px;}
  .feynman-step h3{font-family:var(--font);font-size:14px;font-weight:600;margin-bottom:8px;letter-spacing:0;color:var(--ink);}
  .feynman-step p{font-size:12px;line-height:1.65;color:var(--muted);}

  /* ── Professor Joke Sidekick ── */
  .prof-sidekick{position:relative;display:flex;flex-direction:column;align-items:center;gap:8px;padding:12px 8px;flex-shrink:0;}
  .prof-joke-bubble{background:var(--surface2);border:1px solid var(--border2);border-radius:12px;border-bottom-left-radius:4px;padding:10px 13px;font-size:12px;color:var(--ink2);line-height:1.55;max-width:160px;animation:jokePop 0.4s cubic-bezier(0.22,1,0.36,1) both;position:relative;cursor:pointer;}
  .prof-joke-bubble::after{content:'';position:absolute;bottom:-8px;left:16px;border:4px solid transparent;border-top-color:var(--border2);}
  .prof-joke-inner::after{content:'';position:absolute;bottom:-7px;left:16px;border:4px solid transparent;border-top-color:var(--surface2);}
  .joke-refresh{font-size:10px;color:var(--muted);cursor:pointer;display:flex;align-items:center;gap:3px;transition:color 0.15s;background:none;border:none;padding:2px 4px;font-family:var(--font-mono);}
  .joke-refresh:hover{color:var(--accent2);}
  .prof-figure-wrap{animation:float 4s ease-in-out infinite;}

  /* ── Teach Me / Child Bot ── */
  .teach-btn{display:flex;align-items:center;gap:8px;padding:12px 18px;background:var(--surface2);border:1px solid var(--border2);border-radius:10px;cursor:pointer;transition:all 0.2s;color:var(--ink);font-weight:600;font-size:13px;font-family:var(--font);width:100%;}
  .teach-btn:hover{background:var(--surface3);border-color:var(--accent2);transform:translateY(-1px);box-shadow:0 4px 16px rgba(74,90,53,0.15);}
  .teach-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:800;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(10px);}
  .teach-modal{background:var(--surface);border:1px solid var(--border2);border-radius:16px;width:100%;max-width:580px;max-height:85vh;overflow:hidden;display:flex;flex-direction:column;animation:welcomePop 0.4s cubic-bezier(0.22,1,0.36,1) both;}
  .teach-modal-header{padding:20px 24px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px;flex-shrink:0;}
  .teach-messages{flex:1;overflow-y:auto;padding:16px 20px;display:flex;flex-direction:column;gap:12px;scroll-behavior:smooth;}
  .teach-msg{display:flex;gap:10px;align-items:flex-end;}
  .teach-msg.user{flex-direction:row-reverse;}
  .teach-bubble{padding:11px 15px;border-radius:14px;font-size:13px;line-height:1.65;max-width:78%;word-wrap:break-word;}
  .teach-bubble-child{background:rgba(163,103,47,0.12);border:1px solid rgba(163,103,47,0.25);color:var(--ink2);border-bottom-left-radius:4px;}
  .teach-bubble-user{background:var(--accent2);color:#fff;border-bottom-right-radius:4px;}
  .teach-input-row{padding:14px 20px;border-top:1px solid var(--border);display:flex;gap:8px;flex-shrink:0;}
  .teach-input{flex:1;border:1px solid var(--border2);border-radius:8px;padding:10px 14px;font-size:13px;font-family:var(--font);background:var(--surface2);color:var(--ink);outline:none;resize:none;line-height:1.5;}
  .teach-input:focus{border-color:var(--child-border);box-shadow:0 0 0 3px rgba(163,103,47,0.08);}
  .teach-score{display:flex;align-items:center;gap:4px;padding:3px 8px;background:var(--child-light);border:1px solid var(--child-border);border-radius:999px;font-size:11px;font-weight:600;color:var(--child);font-family:var(--font-mono);}
  .typing-dots{display:flex;gap:3px;padding:4px 0;}
  .typing-dot{width:5px;height:5px;border-radius:50%;background:var(--child);animation:childTyping 1.2s ease-in-out infinite;}
  .typing-dot:nth-child(2){animation-delay:0.2s;}
  .typing-dot:nth-child(3){animation-delay:0.4s;}
  .score-bar-wrap{padding:8px 20px;background:rgba(163,103,47,0.05);border-bottom:1px solid var(--child-border);display:flex;align-items:center;gap:10px;font-size:11px;color:var(--muted);font-family:var(--font-mono);}

  @media(max-width:768px){
    .nav{padding:0 20px;}
    .nav-links{display:none;}
    .hamburger{display:flex;}
    .container{padding:0 20px;}
    .container-wide{padding:0 20px;}
    .card-p-lg{padding:20px;}
    .hero-layout{flex-direction:column!important;text-align:center;}
    .hero-text{max-width:100%!important;}
    .hero-brain{width:260px!important;height:260px!important;margin:0 auto;}
    .quick-track-card{min-height:auto;}
    .feynman-steps{grid-template-columns:1fr!important;}
    .feynman-step{min-height:auto;}
    .hero-text > div[style*="repeat(3,1fr)"]{grid-template-columns:1fr!important;}
    .features-grid{grid-template-columns:1fr!important;}
    .stats-grid{grid-template-columns:repeat(2,1fr)!important;}
    .learn-layout{grid-template-columns:1fr!important;}
    .learn-sidebar{position:static!important;}
    .learn-sidebar .learn-sidebar-card{display:none;}
    .lec-pills{display:flex!important;}
    .learn-header{padding:22px 20px;}
    .notepad{padding:24px 20px!important;}
    .hero-section{padding:100px 0 60px!important;}
    .testimonials-grid{grid-template-columns:1fr!important;}
    .prof-sidekick{display:none;}
    .teach-modal{max-height:90vh;}
    .welcome-card{padding:32px 24px;}
  }
  @media(max-width:480px){
    .stats-grid{grid-template-columns:repeat(2,1fr)!important;}
    .stat-value{font-size:26px!important;}
    .nav-logo span{display:none;}
  }

  /* ── Journey / gamification layer ─────────────────────────────────── */
  @keyframes flameFlicker{0%,100%{transform:scale(1) rotate(-2deg);}50%{transform:scale(1.1) rotate(2deg);}}
  @keyframes floatUpFade{0%{transform:translateY(0);opacity:1;}100%{transform:translateY(-46px);opacity:0;}}
  @keyframes shimmerMove{0%{background-position:0% 0;}100%{background-position:200% 0;}}
  @keyframes nodePulse{0%,100%{box-shadow:0 0 0 0 rgba(138,92,35,0.45);}50%{box-shadow:0 0 0 12px rgba(138,92,35,0);}}
  @keyframes levelUpFlash{0%{opacity:0;transform:scale(0.9);}15%{opacity:1;transform:scale(1);}85%{opacity:1;}100%{opacity:0;}}
  @keyframes dotPop{0%{transform:scale(0.4);opacity:0;}60%{transform:scale(1.15);}100%{transform:scale(1);opacity:1;}}
  .streak-flame{display:inline-block;animation:flameFlicker 1.8s ease-in-out infinite;}
  .floating-xp{position:fixed;pointer-events:none;font-family:var(--font-display);font-style:italic;font-weight:600;font-size:19px;color:var(--gold);z-index:9002;animation:floatUpFade 1.5s ease-out forwards;text-shadow:0 1px 6px rgba(0,0,0,0.15);}
  .hero-continue-btn{position:relative;overflow:hidden;background:linear-gradient(100deg,var(--accent2) 0%,var(--gold) 25%,var(--accent2) 50%,var(--gold) 75%,var(--accent2) 100%);background-size:250% 100%;animation:shimmerMove 5s linear infinite;color:#fff;border:none;border-radius:14px;padding:20px 28px;font-family:var(--font);font-size:17px;font-weight:600;letter-spacing:0.01em;cursor:pointer;box-shadow:0 12px 32px rgba(74,90,53,0.32);width:100%;transition:transform 0.15s;}
  .hero-continue-btn:hover{transform:translateY(-2px);}
  .hero-continue-btn:active{transform:translateY(0);}
  .journey-scroll{display:flex;align-items:flex-end;gap:0;overflow-x:auto;padding:36px 20px 24px;-webkit-overflow-scrolling:touch;}
  .journey-node-wrap{display:flex;flex-direction:column;align-items:center;flex-shrink:0;width:74px;position:relative;transition:margin-top 0.2s;}
  .journey-node{display:flex;align-items:center;justify-content:center;border-radius:50%;font-family:var(--font-mono);font-weight:700;transition:all 0.2s;position:relative;}
  .journey-node.current{animation:nodePulse 1.9s ease-out infinite;}
  .journey-connector{height:2px;flex-shrink:0;width:28px;margin-bottom:29px;background-repeat:repeat-x;background-image:linear-gradient(90deg,var(--border2) 50%,transparent 50%);background-size:8px 2px;}
  .weekly-dot{width:9px;height:9px;border-radius:50%;transition:all 0.2s;}
  .weekly-dot.filled{animation:dotPop 0.3s ease-out;}
  .levelup-overlay{position:fixed;inset:0;z-index:9500;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;background:rgba(20,15,8,0.6);animation:levelUpFlash 1.9s ease-in-out forwards;pointer-events:none;}
  .levelup-text{font-family:var(--font-display);font-style:italic;font-size:46px;color:#fff;text-shadow:0 0 30px var(--gold);}
  .levelup-sub{font-family:var(--font-mono);font-size:13px;letter-spacing:0.1em;text-transform:uppercase;color:var(--gold);}
`;

// ── Confetti helper ────────────────────────────────────────────────────────
function Confetti() {
  const pieces = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    color: ["#8ba86a","#d99a52","#7cae63","#c56a5a","#c3d4a8","#fde68a"][i % 6],
    left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 1.5}s`,
    duration: `${2 + Math.random() * 2}s`,
    size: `${6 + Math.random() * 8}px`,
    rotate: Math.random() > 0.5 ? "3px" : "50%",
  }));
  return (
    <>
      {pieces.map(p => (
        <div key={p.id} className="confetti-piece" style={{
          left: p.left, top: "-20px",
          width: p.size, height: p.size,
          background: p.color,
          borderRadius: p.rotate,
          animationDuration: p.duration,
          animationDelay: p.delay,
        }} />
      ))}
    </>
  );
}

// ── Welcome Screen ─────────────────────────────────────────────────────────
function WelcomeScreen({ name, onDone }) {
  const [phase, setPhase] = useState(0); // 0=show, 1=fading
  useEffect(() => {
    const t = setTimeout(() => setPhase(1), 4200);
    return () => clearTimeout(t);
  }, []);
  const firstName = name?.split(" ")[0] || "there";
  return (
    <div className="welcome-overlay" style={{ opacity: phase === 1 ? 0 : 1, transition: "opacity 0.6s ease", pointerEvents: phase === 1 ? "none" : "all" }}
      onTransitionEnd={() => phase === 1 && onDone()}>
      <Confetti />
      <div className="welcome-card">
        <div className="welcome-rings">
          {[120,180,240].map((s, i) => (
            <div key={i} className="welcome-ring" style={{ width: s, height: s, animationDelay: `${i * 0.8}s` }} />
          ))}
        </div>
        <div className="welcome-avatar" style={{ marginBottom: 20, display: "flex", justifyContent: "center" }}>
          <div style={{ position: "relative", display: "inline-block" }}>
            <ProfessorAvatar size={80} mood="laugh" />
            <div style={{ position: "absolute", top: -4, right: -4, animation: "waveHand 0.6s ease-in-out infinite", transformOrigin: "bottom center", fontSize: 22 }}>👋</div>
          </div>
        </div>
        <h1 className="welcome-title" style={{ fontFamily: "var(--font-display)", fontSize: "clamp(28px,4vw,40px)", fontWeight: 300, marginBottom: 10, color: "var(--ink)" }}>
          Welcome, <em style={{ fontStyle: "italic", fontWeight: 600, color: "var(--accent3)" }}>{firstName}!</em>
        </h1>
        <p className="welcome-sub" style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.7, marginBottom: 28, maxWidth: 340, margin: "0 auto 28px" }}>
          Professor Max is ready to guide you. Your 6-month roadmap awaits — one day at a time.
        </p>
        <div className="welcome-btn">
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 16 }}>
            {["Daily Lectures", "AI Professor", "Weekly Tests", "Teach Me!"].map((feat, i) => (
              <span key={i} className="badge badge-blue" style={{ animation: `popIn 0.4s ease ${0.8 + i * 0.1}s both`, opacity: 0 }}>{feat}</span>
            ))}
          </div>
          <button className="btn btn-primary btn-lg" style={{ margin: "0 auto" }} onClick={onDone}>
            Let's start learning →
          </button>
        </div>
      </div>
    </div>
  );
}

function FeynmanIntro({ name, onDone }) {
  const [saving, setSaving] = useState(false);
  const firstName = name?.split(" ")[0] || "there";
  const steps = [
    { title: "Learn it", body: "Professor Max gives you a focused lecture on whatever you picked." },
    { title: "Explain it", body: "Then you teach it back in your own words. Fancy fog is politely not accepted." },
    { title: "Patch the gaps", body: "The AI student points at vague bits until your explanation is simple enough to survive daylight." },
  ];
  const finish = async () => {
    if (saving) return;
    setSaving(true);
    await onDone();
    setSaving(false);
  };
  return (
    <div className="feynman-page page">
      <div className="card card-p-lg feynman-card">
        <div style={{position:"relative",zIndex:1}}>
          <div className="row gap-8" style={{marginBottom:14,flexWrap:"wrap"}}>
            <span className="badge badge-blue">How Velorn works</span>
            <span className="badge badge-neutral">30-second briefing</span>
          </div>
          <h1 style={{fontFamily:"var(--font-display)",fontSize:"clamp(32px,5vw,52px)",fontWeight:300,lineHeight:1.08,marginBottom:12}}>
            Hey {firstName}, meet the Feynman trick.
          </h1>
          <p style={{fontSize:15,color:"var(--ink2)",lineHeight:1.75,maxWidth:620}}>
            You do not really know a thing until you can explain it simply. If your explanation turns into academic soup, congratulations: we found the exact spot to fix.
          </p>
          <div className="feynman-steps">
            {steps.map((step, i) => (
              <div key={step.title} className="feynman-step">
                <div className="feynman-step-num">0{i + 1}</div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            ))}
          </div>
          <button className="btn btn-primary btn-lg row gap-8" style={{justifyContent:"center",width:"100%"}} onClick={finish} disabled={saving}>
            {saving ? <><Icon.Loader/> Saving</> : <>Got it, let's start learning <Icon.ArrowRight/></>}
          </button>
        </div>
      </div>
    </div>
  );
}
// ── Professor Joke Sidekick ────────────────────────────────────────────────
const PROF_JOKES = [
  "Why do programmers prefer dark mode? Because light attracts bugs! 🐛",
  "I told my students to think outside the box. Now they're learning in the hallway. 📦",
  "A photon checks into a hotel. The bellhop asks 'Can I help with your luggage?' The photon replies: 'No thanks, I'm travelling light.' ✨",
  "Why did the student eat his homework? Because the teacher told him it was a piece of cake! 🎂",
  "What do you call a fish without eyes? A fsh. 🐟",
  "I used to hate maths, but then I realized decimals have a point. 📐",
  "Why can't you trust an atom? Because they make up everything! ⚛️",
  "What's a teacher's favourite nation? Expla-nation! 🌍",
  "I told a chemistry joke. No reaction. 🧪",
  "Why did the math book look so sad? It had too many problems. 📚",
];

function ProfJokeSidekick() {
  const [jokeIdx, setJokeIdx] = useState(() => Math.floor(Math.random() * PROF_JOKES.length));
  const [mood, setMood] = useState("normal");
  const [key, setKey] = useState(0);

  const nextJoke = () => {
    setMood("wink");
    setJokeIdx(i => (i + 1) % PROF_JOKES.length);
    setKey(k => k + 1);
    setTimeout(() => setMood("normal"), 1800);
  };

  return (
    <div className="prof-sidekick">
      <div key={key} className="prof-joke-bubble" onClick={nextJoke} title="Click for another joke!">
        <div className="prof-joke-inner" />
        <p style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)", marginBottom: 4 }}>Prof. Max says:</p>
        <p style={{ fontSize: 12, color: "var(--ink2)", lineHeight: 1.55 }}>{PROF_JOKES[jokeIdx]}</p>
      </div>
      <button className="joke-refresh" onClick={nextJoke}>↻ next joke</button>
      <div className="prof-figure-wrap">
        <ProfessorAvatar size={52} mood={mood} />
      </div>
    </div>
  );
}

// ── Teach Me! Child Bot Modal ──────────────────────────────────────────────
function TeachMeModal({ onClose, lectureContext }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [score, setScore] = useState(0);
  const [childMood, setChildMood] = useState("curious");
  const [sessionStarted, setSessionStarted] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => { scrollToBottom(); }, [messages]);

  const startSession = () => {
    setSessionStarted(true);
    setMessages([{
      role: "child",
      text: `Hi! I'm Pip 👋 I heard you learned about "${lectureContext}" today. Can you teach me? I'm a curious kid who doesn't know anything yet! Start with the most basic thing — what even IS it? 🤔`,
      mood: "curious"
    }]);
    setChildMood("curious");
  };

  const send = async () => {
    if (!input.trim() || loading) return;
    const userText = input.trim();
    setInput("");
    const newMessages = [...messages, { role: "user", text: userText }];
    setMessages(newMessages);
    setLoading(true);
    setChildMood("thinking");

    const history = newMessages.map(m => `${m.role === "user" ? "Student (teaching)" : "Pip (child)"}: ${m.text}`).join("\n");

    const prompt = `You are Pip — a curious, friendly 7-year-old child who is being taught about "${lectureContext}" by a student.

Your job is to:
1. Ask follow-up questions like a genuinely curious child would ("But WHY?", "What does that mean?", "Can you give an example?", "I don't understand that word!")
2. React with childlike wonder when things are well explained ("Ooooh that makes sense!", "Wow I never knew that!")
3. Get confused about jargon and ask for simpler explanations
4. Occasionally make cute wrong assumptions that the student has to correct
5. Give a score OUT OF 10 based on how well the student explained it — simple clear explanations get high scores, jargon-filled ones get low scores

After your child response, on a new line write exactly: SCORE:X (where X is 1-10)

Keep your response SHORT (2-4 sentences max). Be playful and warm. Never sound like an AI or teacher.

Conversation so far:
${history}

Respond as Pip now:`;

    try {
      const raw = await askClaude([{ role: "user", content: prompt }]);
      const scoreMatch = raw.match(/SCORE:(\d+)/i);
      const newScore = scoreMatch ? parseInt(scoreMatch[1]) : 5;
      const childText = raw.replace(/SCORE:\d+/gi, "").trim();

      // determine mood based on score
      const newMood = newScore >= 8 ? "happy" : newScore >= 5 ? "thinking" : "curious";
      setChildMood(newMood);
      setScore(Math.min(10, Math.max(0, newScore)));

      setMessages(prev => [...prev, { role: "child", text: childText, mood: newMood, score: newScore }]);
    } catch {
      setMessages(prev => [...prev, { role: "child", text: "Umm... I got a bit confused. Can you try explaining it again? 😅", mood: "thinking" }]);
    }
    setLoading(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const scoreColor = score >= 8 ? "var(--emerald)" : score >= 5 ? "var(--gold)" : "var(--ember)";
  const scorePct = (score / 10) * 100;

  return (
    <div className="teach-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="teach-modal">
        {/* Header */}
        <div className="teach-modal-header">
          <ChildBotAvatar size={44} mood={childMood} />
          <div style={{ flex: 1 }}>
            <div className="row gap-8">
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 500, color: "var(--ink)" }}>Teach Me!</h3>
              <span className="badge badge-child">Feynman Technique</span>
            </div>
            <p style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>Explain to Pip like they're 7 years old</p>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><Icon.X /></button>
        </div>

        {/* Score bar */}
        {sessionStarted && (
          <div className="score-bar-wrap">
            <span>Pip's understanding:</span>
            <div style={{ flex: 1, background: "var(--surface2)", borderRadius: 999, height: 6, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${scorePct}%`, background: scoreColor, borderRadius: 999, transition: "width 0.6s cubic-bezier(0.22,1,0.36,1)" }} />
            </div>
            <div className="teach-score"><Icon.Star />{score}/10</div>
          </div>
        )}

        {/* Messages */}
        <div className="teach-messages">
          {!sessionStarted ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", gap: 20, textAlign: "center" }}>
              <div style={{ animation: "float 3s ease-in-out infinite" }}>
                <ChildBotAvatar size={80} mood="curious" />
              </div>
              <div>
                <h3 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 400, marginBottom: 8 }}>Meet Pip!</h3>
                <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.7, maxWidth: 340, margin: "0 auto 20px" }}>
                  Pip is a curious 7-year-old who wants to learn about <strong style={{ color: "var(--ink)" }}>"{lectureContext}"</strong> from you. Teach clearly and earn a perfect 10!
                </p>
                <p style={{ fontSize: 11, color: "var(--subtle)", fontFamily: "var(--font-mono)", marginBottom: 20 }}>The clearer your explanation, the higher Pip scores you.</p>
                <button className="btn btn-child btn-lg" onClick={startSession}>
                  <ChildBotAvatar size={18} mood="happy" />
                  Start Teaching Pip →
                </button>
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, i) => (
                <div key={i} className={`teach-msg ${msg.role === "user" ? "user" : ""}`}>
                  {msg.role === "child" && (
                    <div style={{ flexShrink: 0, animation: i === messages.length - 1 ? "popIn 0.3s ease both" : "none" }}>
                      <ChildBotAvatar size={32} mood={msg.mood || "curious"} />
                    </div>
                  )}
                  <div className={`teach-bubble ${msg.role === "child" ? "teach-bubble-child" : "teach-bubble-user"}`}
                    style={{ animation: i === messages.length - 1 ? "popIn 0.3s ease both" : "none" }}>
                    {msg.text}
                    {msg.role === "child" && msg.score !== undefined && (
                      <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 4 }}>
                        {Array.from({ length: 10 }, (_, j) => (
                          <span key={j} style={{ fontSize: 8, color: j < msg.score ? "var(--gold)" : "var(--border2)" }}>★</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="teach-msg">
                  <ChildBotAvatar size={32} mood="thinking" />
                  <div className="teach-bubble teach-bubble-child">
                    <div className="typing-dots">
                      <div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input */}
        {sessionStarted && (
          <div className="teach-input-row">
            <textarea
              ref={inputRef}
              className="teach-input"
              rows={2}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Explain it simply… Press Enter to send"
              disabled={loading}
            />
            <button className="btn btn-child" style={{ alignSelf: "flex-end", padding: "10px 14px" }} onClick={send} disabled={loading || !input.trim()}>
              {loading ? <Icon.Loader /> : <Icon.Send />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function buildFallback(form) {
  const career=form.career||"your chosen field"; const lc=career.toLowerCase();
  const preset=SUGGESTED_TRACKS.find(t=>t.id===form.trackId||t.topic.toLowerCase()===lc||t.title.toLowerCase()===lc);
  if(preset){
    const months=Array.from({length:6},(_,mi)=>{
      const topics=preset.sequence.slice(mi*4,mi*4+4);
      const theme=topics[0]?.replace(/^(Basic |Building |Creating )/,"")||`${preset.title} Foundations`;
      return {
        month: mi+1,
        theme,
        focus: `Month ${mi+1}: ${theme}`,
        weeks: topics.map((topic,wi)=>({
          week: wi+1,
          goal: topic,
          days: [1,2,3,4,5,6,7].map(di=>({day:di,task:di===7?`Review ${topic}`:`${topic}: practice step ${di}`})),
          testTopic: topic
        }))
      };
    });
    return {title:`6-Month ${preset.topic} Roadmap`,trackId:preset.id,months};
  }
  const careerThemes={entrepreneur:["Business Foundations","Market Research","Building Your Product","Marketing & Sales","Finance & Operations","Scaling & Growth"],coding:["Programming Basics","Data Structures","Web Development","Databases & APIs","Projects & Portfolio","Job Preparation"],chess:["Chess Basics","Tactics & Puzzles","Opening Principles","Middlegame Strategy","Endgame Mastery","Tournament Preparation"],art:["Drawing Fundamentals","Color Theory","Digital Art","Illustration","Style Development","Portfolio & Career"],music:["Music Theory Basics","Instrument Fundamentals","Scales & Chords","Composition","Production","Performance & Career"]};
  let themes=null; for(const [k,v] of Object.entries(careerThemes)){if(lc.includes(k)){themes=v;break;}}
  if(!themes)themes=[`${career} Fundamentals`,`Core ${career} Skills`,`${career} in Practice`,`Advanced ${career} Concepts`,`Real-world ${career} Projects`,`${career} Mastery & Career`];
  const wt={0:["Getting Started","Core Basics","Key Concepts","First Project"],1:["Deep Dive","Practical Skills","Real Examples","Week Review"],2:["Advanced Topics","Case Studies","Hands-on Practice","Assessment"],3:["Expert Techniques","Industry Insights","Build Something","Milestone Review"],4:["Refinement","Problem Solving","Creative Application","Progress Check"],5:["Mastery","Portfolio Work","Final Project","Graduation"]};
  return {title:`6-Month ${career} Roadmap`,months:themes.map((theme,mi)=>({month:mi+1,theme,focus:`Month ${mi+1}: ${theme}`,weeks:[1,2,3,4].map(wi=>({week:wi,goal:`${wt[mi]?.[wi-1]||"Weekly Goals"} — ${theme}`,days:[1,2,3,4,5,6,7].map(di=>({day:di,task:di===7?`Review ${theme}`:`${theme}: sub-topic ${di}`})),testTopic:theme}))}))};
}

const DEMO_THEMES=["Business Foundations","Market Research","Building Your Product","Marketing & Sales","Finance & Operations","Scaling & Growth"];
const DEMO_ROADMAP={title:"Entrepreneurship — Demo Roadmap",months:Array.from({length:6},(_,mi)=>({month:mi+1,theme:DEMO_THEMES[mi],focus:`Month ${mi+1}: ${DEMO_THEMES[mi]}`,weeks:Array.from({length:4},(_,wi)=>({week:wi+1,goal:`Week ${wi+1} — ${DEMO_THEMES[mi]}`,days:Array.from({length:7},(_,di)=>({day:di+1,task:di===6?`Review Week ${wi+1}`:`${DEMO_THEMES[mi]}: sub-topic ${di+1}`})),testTopic:DEMO_THEMES[mi]}))}))};
const DEMO_PROGRESS={currentMonth:1,currentWeek:1,currentDay:1,streak:3,completedDays:["m1w1d1","m1w1d2","m1w1d3"]};

// ── Email Settings Modal ───────────────────────────────────────────────────
function EmailSettingsModal({ onClose, userEmail }) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:20,backdropFilter:"blur(8px)"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="card card-p-lg" style={{width:"100%",maxWidth:420}}>
        <div className="row gap-8" style={{justifyContent:"space-between",marginBottom:6}}>
          <h3 style={{fontFamily:"var(--font-display)",fontSize:22,fontWeight:400}}>Email Reminders</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><Icon.X/></button>
        </div>
        <p style={{fontSize:12,color:"var(--muted)",marginBottom:24,fontFamily:"var(--font-mono)"}}>Sent to {userEmail}</p>
        <div className="toggle-row">
          <div><p style={{fontSize:14,fontWeight:500,color:"var(--ink)",marginBottom:3}}>Automatic activity emails</p><p style={{fontSize:12,color:"var(--muted)"}}>The countdown starts when an account is created or a user signs in.</p></div>
          <span className="badge badge-green">Active</span>
        </div>
        <div className="toggle-row">
          <div><p style={{fontSize:14,fontWeight:500,color:"var(--ink)",marginBottom:3}}>Daily inactivity check-ins</p><p style={{fontSize:12,color:"var(--muted)"}}>After 1 full inactive day, EmailJS sends one reminder per day until the user returns.</p></div>
        </div>
        <button className="btn btn-primary" style={{width:"100%",justifyContent:"center",marginTop:24}} onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

// ── Nav ────────────────────────────────────────────────────────────────────
function Nav({ user, onLogout, onNav, page, onOpenEmailSettings, isDemo, onSignUp, theme, onToggleTheme }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const links = user ? ["dashboard","learn","test","friends","onboard"] : [];
  return (
    <>
      <nav className="nav">
        <div className="nav-logo"><div className="nav-logo-dot"/><span>Velorn</span></div>
        {user && (<div className="nav-links">{links.map(p=>(<button key={p} onClick={()=>{onNav(p);setMobileOpen(false);}} className={`nav-link ${page===p?"active":""}`}>{p==="learn"?"Learn":p==="test"?"Test":p==="friends"?"Friends":p==="onboard"?"New Topic":"Dashboard"}</button>))}</div>)}
        <div className="row gap-8">
          <button onClick={onToggleTheme} className="theme-toggle" aria-label="Toggle light or dark mode" title={theme==="dark"?"Switch to light mode":"Switch to dark mode"}>
            {theme==="dark"?<Icon.Sun/>:<Icon.Moon/>}
          </button>
        
          
          {user && !isDemo && <button onClick={onOpenEmailSettings} className="btn btn-ghost btn-sm row gap-6"><Icon.Bell/></button>}
          {user && (isDemo ? <button className="btn btn-primary btn-sm" onClick={onSignUp}>Sign Up</button> : <button className="btn btn-ghost btn-sm btn-icon" onClick={onLogout}><Icon.LogOut/></button>)}
          {user && <button className="hamburger" onClick={()=>setMobileOpen(o=>!o)}><Icon.Menu/></button>}
          {!user && <button className="btn btn-outline btn-sm" onClick={()=>onNav("auth")}>Sign In</button>}
        </div>
      </nav>
      {user && (
        <div className={`mobile-nav ${mobileOpen?"open":""}`}>
          {links.map(p=>(<button key={p} onClick={()=>{onNav(p);setMobileOpen(false);}} className={`mobile-nav-link ${page===p?"active":""}`}>{p==="learn"?"Learn":p==="test"?"Test":p==="friends"?"Friends":p==="onboard"?"New Topic":"Dashboard"}</button>))}
          <button className="mobile-nav-link" onClick={()=>{onOpenEmailSettings();setMobileOpen(false);}}>Reminders</button>
          <button className="mobile-nav-link" style={{color:"var(--ember)"}} onClick={()=>{onLogout();setMobileOpen(false);}}>Sign Out</button>
        </div>
      )}
    </>
  );
}

// ── Landing ────────────────────────────────────────────────────────────────
function Landing({ onStart, onDemo, onTrack }) {
  const [typed, setTyped] = useState("");
  const [focused, setFocused] = useState(false);
  const [exIdx, setExIdx] = useState(0);
  useEffect(()=>{const t=setInterval(()=>setExIdx(i=>(i+1)%LANDING_EXAMPLES.length),2400);return()=>clearInterval(t);},[]);
  return (
    <div style={{minHeight:"100vh",background:"var(--bg)",overflowX:"hidden"}}>

      {/* ── Hero: big centered stack, filling the frame ── */}
      <section style={{padding:"128px 24px 64px",textAlign:"center",position:"relative"}}>
        <div style={{fontFamily:"var(--font-mono)",fontSize:11,letterSpacing:"0.22em",textTransform:"uppercase",color:"var(--muted)",marginBottom:20,display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
          <span style={{width:5,height:5,borderRadius:"50%",background:"var(--gold)",display:"inline-block"}}/>
          Free for students aged 13–18
        </div>
        <h1 style={{fontFamily:"var(--font-display)",fontSize:"clamp(42px,8.5vw,118px)",fontStyle:"italic",fontWeight:600,lineHeight:0.96,letterSpacing:"-0.02em",color:"var(--ink)",maxWidth:1040,margin:"0 auto"}}>
          Explain it, or you<br/>don't <span style={{color:"var(--accent)"}}>know</span> it.
        </h1>

        {/* layered swatch cards + centered brain */}
        <div style={{position:"relative",width:"min(520px,84vw)",aspectRatio:"1 / 0.95",margin:"56px auto 44px"}}>
          <div style={{position:"absolute",inset:"8% 0% 0% 8%",background:"var(--khaki)",transform:"rotate(-6deg)"}}/>
          <div style={{position:"absolute",inset:"5% 4% 3% 1%",background:"var(--ecru)",transform:"rotate(4deg)"}}/>
          <div style={{position:"absolute",inset:"2% 2% 6% 4%",background:"var(--surface3)",transform:"rotate(-1.5deg)",boxShadow:"0 30px 50px -20px rgba(43,32,19,0.35)"}}/>
          <div style={{position:"absolute",inset:"6% 8%"}}><OrigamiBrain/></div>
        </div>

        <p style={{fontSize:"clamp(14px,1.7vw,17px)",color:"var(--muted)",lineHeight:1.8,maxWidth:480,margin:"0 auto 34px"}}>
          Pick any skill. Get a 6-month roadmap split into daily lectures, then teach each one back to a curious AI student who keeps asking "why" until it actually holds up. <strong style={{color:"var(--ink)",fontWeight:600}}>Then find friends on Velorn and learn together.</strong>
        </p>

        <div style={{display:"flex",justifyContent:"center",marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",background:"var(--surface)",border:`1px solid ${focused?"var(--accent)":"var(--border2)"}`,overflow:"hidden",width:"min(480px,92vw)"}}>
            <input value={typed} onChange={e=>setTyped(e.target.value)} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} placeholder={`e.g. ${LANDING_EXAMPLES[exIdx]}`} style={{flex:1,padding:"14px 16px",border:"none",outline:"none",fontSize:14,fontFamily:"var(--font)",background:"transparent",color:"var(--ink)"}} onKeyDown={e=>e.key==="Enter"&&onStart(typed)}/>
            <button style={{margin:0,border:"none",background:"var(--accent)",color:"var(--bg)",fontFamily:"var(--font)",fontWeight:600,fontSize:13,padding:"15px 20px",cursor:"pointer",flexShrink:0}} onClick={()=>onStart(typed)}>Build Roadmap →</button>
          </div>
        </div>
        <p style={{fontSize:11,color:"var(--subtle)",marginBottom:26,fontFamily:"var(--font-mono)"}}>No credit card · 30 seconds to set up</p>

        <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center"}}>
          {SUGGESTED_TRACKS.map(track=>(
            <button key={track.id} onClick={()=>onTrack(track)} style={{background:"transparent",border:"1px solid var(--border2)",color:"var(--ink2)",fontFamily:"var(--font-mono)",fontSize:12,padding:"9px 16px",cursor:"pointer",transition:"all 0.15s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--accent)";e.currentTarget.style.color="var(--accent)";}} onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border2)";e.currentTarget.style.color="var(--ink2)";}}>
              {track.title}
            </button>
          ))}
          <button onClick={onDemo} style={{background:"transparent",border:"1px solid transparent",color:"var(--muted)",fontFamily:"var(--font-mono)",fontSize:12,padding:"9px 4px",cursor:"pointer",textDecoration:"underline",textUnderlineOffset:3}}>see a demo first</button>
        </div>
      </section>

      {/* ── Approach: statement + the notebook illustration as proof ── */}
      <section style={{padding:"96px 24px",background:"var(--bg2)"}}>
        <div className="container" style={{display:"flex",gap:56,alignItems:"center",flexWrap:"wrap"}}>
          <div style={{flex:"1 1 420px",minWidth:280}}>
            <div className="section-label" style={{marginBottom:22}}>The Approach</div>
            <h2 style={{fontFamily:"var(--font-display)",fontSize:"clamp(28px,4.2vw,54px)",fontStyle:"italic",fontWeight:500,color:"var(--ink)",lineHeight:1.2,marginBottom:26}}>
              Reading isn't learning. Explaining it is.
            </h2>
            <p style={{fontSize:"clamp(14px,1.6vw,17px)",color:"var(--muted)",lineHeight:1.85,maxWidth:520}}>
              Most apps stop at the lecture. Velorn makes you teach it back before it counts. Professor Max explains it once, plainly, for whatever you picked. Then <strong style={{color:"var(--ink)",fontWeight:600}}>Pip</strong>, a curious 7-year-old AI, makes you say it again in words that actually work.
            </p>
          </div>
          <div style={{flex:"1 1 280px",maxWidth:340,minWidth:220,transform:"rotate(2deg)"}}><NotebookHero/></div>
        </div>
      </section>

      {/* ── Three steps ── */}
      <section style={{padding:"0 24px 96px"}}>
        <div className="container">
          {[{n:"01",title:"Pick any topic",desc:"Chess, Python, guitar, trading, whatever. Type it in and get a 6-month plan broken into daily, doable pieces."},{n:"02",title:"Professor Max teaches",desc:"Five short lectures a day, written for the topic you actually chose, not a generic template stretched to fit."},{n:"03",title:"You explain it to Pip",desc:"A curious AI kid who knows nothing and asks \"why\" a lot. Jargon gets you a low score. Plain words get you a 10."},{n:"04",title:"Find friends, study together",desc:"Search for other students, add them, and keep each other going. Studying alone is optional now."}].map((f,i)=>(
            <div key={f.n} style={{display:"flex",alignItems:"center",gap:32,padding:"38px 0",borderBottom:i<3?"1px solid var(--border)":"none",borderTop:i===0?"1px solid var(--border)":"none"}}>
              <p style={{fontFamily:"var(--font-display)",fontSize:"clamp(50px,7vw,88px)",fontStyle:"italic",fontWeight:500,color:"var(--khaki)",lineHeight:1,width:140,flexShrink:0}}>{f.n}</p>
              <div style={{flex:1}}>
                <h3 style={{fontFamily:"var(--font-display)",fontSize:"clamp(19px,2.2vw,27px)",fontWeight:500,color:"var(--ink)",marginBottom:8}}>{f.title}</h3>
                <p style={{fontSize:14,color:"var(--muted)",lineHeight:1.7,maxWidth:520}}>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Testimonials: sage block ── */}
      <section style={{padding:"90px 24px",background:"var(--sage)"}}>
        <div className="container">
          <div style={{marginBottom:40}}>
            <div className="section-label" style={{marginBottom:14,color:"rgba(43,32,19,0.55)"}}>Who built real skills</div>
            <h2 style={{fontFamily:"var(--font-display)",fontSize:"clamp(28px,3.8vw,48px)",fontStyle:"italic",fontWeight:500,color:"var(--sage-ink)"}}>Student stories.</h2>
          </div>
          <div className="testimonials-grid" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:20}}>
            {[{q:"This is the only app where I actually knew what to do next, every single day.",name:"Riya, 16",tag:"Web Dev",rot:-1.5},{q:"Explaining recursion to Pip taught me more than the lecture did. Rough on the ego though.",name:"Arjun, 17",tag:"Programming",rot:1},{q:"Went from zero chess to beating my dad in 3 months. Still salty he doesn't believe me.",name:"Sana, 15",tag:"Chess",rot:-0.5}].map(t=>(
              <div key={t.name} style={{padding:"24px 22px",background:"var(--surface)",transform:`rotate(${t.rot}deg)`,position:"relative"}}>
                <p style={{fontFamily:"var(--font-display)",fontSize:"clamp(15px,1.8vw,18px)",fontStyle:"italic",fontWeight:400,color:"var(--ink2)",lineHeight:1.7,marginBottom:18}}>"{t.q}"</p>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <p style={{fontSize:19,fontWeight:600,color:"var(--sage-deep)",fontFamily:"var(--font-hand)"}}>{t.name}</p>
                  <span style={{fontSize:10,color:"var(--muted)",fontFamily:"var(--font-mono)",background:"var(--bg2)",padding:"2px 8px",borderRadius:999}}>{t.tag}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Closing CTA: deep olive block ── */}
      <section style={{padding:"110px 24px",textAlign:"center",background:"var(--accent)"}}>
        <h2 style={{fontFamily:"var(--font-display)",fontSize:"clamp(38px,6vw,80px)",fontStyle:"italic",fontWeight:600,marginBottom:20,color:"var(--bg)",lineHeight:1.05}}>Go on then, explain it.</h2>
        <p style={{fontSize:14,color:"color-mix(in srgb,var(--bg) 65%,transparent)",marginBottom:36,fontFamily:"var(--font-mono)"}}>No credit card. Just a topic and 6 months.</p>
        <div style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap"}}>
          <button style={{background:"var(--bg)",color:"var(--accent)",border:"none",fontFamily:"var(--font)",fontWeight:600,fontSize:14,padding:"14px 30px",cursor:"pointer"}} onClick={onStart}>Build My Roadmap →</button>
          <button style={{background:"transparent",color:"var(--bg)",border:"1px solid color-mix(in srgb,var(--bg) 40%,transparent)",fontFamily:"var(--font)",fontWeight:500,fontSize:14,padding:"14px 30px",cursor:"pointer"}} onClick={onDemo}>See Demo</button>
        </div>
      </section>
    </div>
  );
}

// ── Auth ───────────────────────────────────────────────────────────────────
function Auth({ onAuth }) {
  const knownUser = getKnownDeviceUser();
  const [mode,setMode]=useState(knownUser?.email ? "login" : "signup");
  const [form,setForm]=useState({name:knownUser?.name||"",age:"",grade:"",email:knownUser?.email||"",password:""});
  const [err,setErr]=useState(""); const [loading,setLoading]=useState(false);
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const handleGoogle=async()=>{setLoading(true);setErr("");const redirectTo=window.location.hostname==="localhost"?"http://localhost:5173":"https://velorn.vercel.app";const{error}=await supabase.auth.signInWithOAuth({provider:"google",options:{redirectTo}});if(error){setErr(error.message);setLoading(false);}};
  const handleSubmit=async()=>{
    setErr("");setLoading(true);
    if(mode==="signup"){
      if(!form.name||!form.age||!form.grade||!form.email||!form.password){setErr("All fields required.");setLoading(false);return;}
      const{data,error}=await supabase.auth.signUp({email:form.email,password:form.password,options:{data:{full_name:form.name}}});
      if(error){setErr(error.message);setLoading(false);return;}
      if(data.user){const prof={full_name:form.name,age:form.age,grade:form.grade,has_seen_onboarding:false};await upsertProfile(data.user.id,{full_name:form.name,age:parseInt(form.age),grade:form.grade,has_seen_onboarding:false});await upsertProgress(data.user.id,initialProgressFields());saveKnownDeviceUser(data.user,prof);onAuth(data.user,prof,false);}
    }else{
      const{data,error}=await supabase.auth.signInWithPassword({email:form.email,password:form.password});
      if(error){setErr("Invalid email or password.");setLoading(false);return;}
      const profile=await getProfile(data.user.id);saveKnownDeviceUser(data.user,profile);onAuth(data.user,profile,true);
    }
    setLoading(false);
  };
  return (
    <div className="page container" style={{paddingTop:100,paddingBottom:60}}>
      <div className="card card-p-lg" style={{maxWidth:420,margin:"0 auto"}}>
        <div style={{marginBottom:24}}>
          <h2 style={{fontFamily:"var(--font-display)",fontSize:28,fontWeight:400,marginBottom:4}}>{mode==="signup"?"Create account":"Welcome back"}</h2>
          <p style={{fontSize:13,color:"var(--muted)"}}>{mode==="signup"?"Start your learning journey":"Continue your roadmap"}</p>
        </div>
        <button className="btn-google" onClick={handleGoogle} disabled={loading}>
          <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
          Continue with Google
        </button>
        <div className="divider" style={{margin:"14px 0"}}>or</div>
        {err&&<div style={{marginBottom:12,padding:"8px 12px",background:"var(--ember-light)",border:"1px solid rgba(122,59,59,0.2)",borderRadius:6,fontSize:12,color:"var(--ember)",display:"flex",gap:6,alignItems:"center"}}><Icon.AlertCircle/>{err}</div>}
        <div className="stack gap-12">
          {mode==="signup"&&<>
            <div className="field"><label className="label">Full Name</label><input className="input" placeholder="Your name" value={form.name} onChange={e=>set("name",e.target.value)}/></div>
            <div className="row gap-10">
              <div className="field" style={{flex:1}}><label className="label">Age</label><input className="input" type="number" min="13" max="18" placeholder="15" value={form.age} onChange={e=>set("age",e.target.value)}/></div>
              <div className="field" style={{flex:1}}><label className="label">Grade</label><input className="input" placeholder="Grade 10" value={form.grade} onChange={e=>set("grade",e.target.value)}/></div>
            </div>
          </>}
          <div className="field"><label className="label">Email</label><input className="input" type="email" placeholder="you@email.com" value={form.email} onChange={e=>set("email",e.target.value)}/></div>
          <div className="field"><label className="label">Password</label><input className="input" type="password" placeholder="••••••••" value={form.password} onChange={e=>set("password",e.target.value)}/></div>
          <button className="btn btn-primary" style={{width:"100%",justifyContent:"center",marginTop:4}} onClick={handleSubmit} disabled={loading}>{loading?<span className="row gap-8"><Icon.Loader/> Please wait</span>:mode==="signup"?"Create Account":"Sign In"}</button>
          <p style={{textAlign:"center",fontSize:12,color:"var(--muted)"}}>{mode==="signup"?"Already have an account? ":"New here? "}<span style={{color:"var(--accent3)",cursor:"pointer",fontWeight:500}} onClick={()=>{setMode(m=>m==="signup"?"login":"signup");setErr("");}}>{mode==="signup"?"Sign in":"Create account"}</span></p>
        </div>
      </div>
    </div>
  );
}

const LOADING_STEPS=["Analyzing your learning goals","Mapping out 6 months of content","Scheduling daily lessons","Preparing weekly assessments","Finalizing your roadmap"];
function RoadmapLoader() {
  const [step,setStep]=useState(0);const [pct,setPct]=useState(0);
  useEffect(()=>{const si=setInterval(()=>setStep(s=>s<LOADING_STEPS.length-1?s+1:s),3500);const pi=setInterval(()=>setPct(p=>p<95?p+1:p),220);return()=>{clearInterval(si);clearInterval(pi);};},[]);
  return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:40}}>
      <div style={{width:380,textAlign:"center"}}>
        <div style={{width:40,height:40,border:"1px solid var(--border2)",borderTop:"1px solid var(--accent2)",borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 28px"}}/>
        <h2 style={{fontFamily:"var(--font-display)",fontSize:22,fontWeight:400,marginBottom:8}}>Building Your Roadmap</h2>
        <p style={{fontSize:12,color:"var(--muted)",marginBottom:28,fontFamily:"var(--font-mono)"}}>{LOADING_STEPS[step]}</p>
        <div style={{background:"var(--surface2)",borderRadius:999,height:2,overflow:"hidden",marginBottom:8}}><div style={{height:"100%",background:"var(--accent2)",width:`${pct}%`,transition:"width 0.3s"}}/></div>
        <p style={{fontSize:11,color:"var(--subtle)",fontFamily:"var(--font-mono)"}}>{pct}%</p>
      </div>
    </div>
  );
}

function Onboarding({ user, profile, onDone, initialTopic = "", initialTrack = null }) {
  const initialPreset=initialTrack||SUGGESTED_TRACKS.find(t=>t.topic===initialTopic||t.title===initialTopic)||null;
  const [form,setForm]=useState({career:initialPreset?.topic||initialTopic||"",level:initialPreset?.level||"Beginner",time:"1 hour",goal:initialPreset?.goal||"Strong foundation",trackId:initialPreset?.id||null});
  const [loading,setLoading]=useState(false);
  const set=(k,v)=>setForm(f=>({...f,[k]:v,trackId:k==="career"?null:f.trackId}));
  const applyTrack=(track)=>setForm(f=>({...f,career:track.topic,level:track.level,time:f.time,goal:track.goal,trackId:track.id}));
  const generate=async()=>{
    if(!form.career.trim()){alert("Please enter what you want to learn.");return;}
    setLoading(true);
    const name=profile?.full_name||user?.user_metadata?.full_name||user?.email||"Student";
    const age=profile?.age||"15";const grade=profile?.grade||"High School";
    const preset=SUGGESTED_TRACKS.find(t=>t.id===form.trackId);
    const sequenceText=preset?`\nUse this suggested quick-start sequence as the backbone, one item per week in order. Do not limit the app to this track; this is only the current roadmap seed:\n${preset.sequence.map((topic,i)=>`${i+1}. ${topic}`).join("\n")}`:"";
    const prompt=`Create a 6-month learning roadmap. Student: Name ${name}, Age ${age}, Grade ${grade}, Topic "${form.career}", Level ${form.level}, Time ${form.time}, Goal ${form.goal}.${sequenceText}\nReturn ONLY valid JSON no markdown:\n{"title":"6-Month ${form.career} Roadmap","months":[{"month":1,"theme":"Theme","focus":"Focus","weeks":[{"week":1,"goal":"Goal","days":[{"day":1,"task":"Task"},{"day":2,"task":"Task"},{"day":3,"task":"Task"},{"day":4,"task":"Task"},{"day":5,"task":"Task"},{"day":6,"task":"Project"},{"day":7,"task":"Review"}],"testTopic":"Topic"}]}]}\nGenerate ALL 6 months ALL 4 weeks. Every task specific to "${form.career}".`;
    try {
      const raw=await askClaude([{role:"user",content:prompt}]);
      const jsonMatch=raw.match(/\{[\s\S]*\}/);if(!jsonMatch)throw new Error("No JSON");
      const roadmap=JSON.parse(jsonMatch[0]);
      await upsertRoadmap(user.id,roadmap,{career:form.career,level:form.level,daily_time:form.time,goal:form.goal,track_id:form.trackId});
      const ip={current_month:1,current_week:1,current_day:1,streak:0,completed_days:[],last_visit:new Date().toISOString().slice(0,10)};
      await upsertProgress(user.id,ip);onDone(roadmap,dbToProgress(ip));
    } catch {
      const fallback=buildFallback(form);
      await upsertRoadmap(user.id,fallback,{career:form.career,level:form.level,daily_time:form.time,goal:form.goal,track_id:form.trackId});
      const ip={current_month:1,current_week:1,current_day:1,streak:0,completed_days:[],last_visit:new Date().toISOString().slice(0,10)};
      await upsertProgress(user.id,ip);onDone(fallback,dbToProgress(ip));
    }
    setLoading(false);
  };
  if(loading)return <RoadmapLoader/>;
  const name=profile?.full_name||user?.user_metadata?.full_name||"there";
  return (
    <div className="page container" style={{paddingTop:100,paddingBottom:60}}>
      <div className="card card-p-lg" style={{maxWidth:500,margin:"0 auto"}}>
        <div style={{marginBottom:24}}>
          <p style={{fontSize:11,color:"var(--muted)",marginBottom:4,fontFamily:"var(--font-mono)",textTransform:"uppercase",letterSpacing:"0.1em"}}>Welcome, {name}</p>
          <h2 style={{fontFamily:"var(--font-display)",fontSize:28,fontWeight:400,marginBottom:6}}>Set up your learning path</h2>
          <p style={{fontSize:13,color:"var(--muted)"}}>Type any topic, or use a quick start below. You can switch to a completely different topic anytime.</p>
        </div>
        <div className="stack gap-14">
          <div className="field"><label className="label">What do you want to learn?</label><input className="input" placeholder="e.g. Quantum physics, Guitar, Python, Chess" value={form.career} onChange={e=>set("career",e.target.value)}/></div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
            {SUGGESTED_TRACKS.map(track=>(
              <button key={track.id} type="button" onClick={()=>applyTrack(track)} className="quick-track-card" style={{"--track-accent":track.accent,borderColor:form.trackId===track.id?"var(--border3)":"var(--border)",background:form.trackId===track.id?"var(--surface2)":"var(--surface)",minHeight:120}}>
                <span className="quick-track-label">{form.trackId===track.id?"Selected":"Quick start"}</span>
                <strong>{track.title}</strong>
                <span>{track.summary}</span>
              </button>
            ))}
          </div>
          <div className="row gap-10">
            <div className="field" style={{flex:1}}><label className="label">Level</label><select className="input" value={form.level} onChange={e=>set("level",e.target.value)}><option>Beginner</option><option>Intermediate</option></select></div>
            <div className="field" style={{flex:1}}><label className="label">Daily Time</label><select className="input" value={form.time} onChange={e=>set("time",e.target.value)}><option>1 hour</option><option>2 hours</option><option>3+ hours</option></select></div>
          </div>
          <div className="field"><label className="label">Goal</label><select className="input" value={form.goal} onChange={e=>set("goal",e.target.value)}><option>Strong foundation</option><option>Job ready</option><option>Build projects</option></select></div>
          <button className="btn btn-primary row gap-8" style={{justifyContent:"center",padding:"12px 24px",fontSize:14}} onClick={generate}>Generate My Roadmap →</button>
        </div>
      </div>
    </div>
  );
}

// XP: +20 per completed day. 300 XP per level, matching "Level 3 — 240/300 XP" style display.
const XP_PER_DAY = 20;
const XP_PER_LEVEL = 300;
function xpFromProgress(completedDays){
  const totalXp = completedDays.length * XP_PER_DAY;
  const level = Math.floor(totalXp / XP_PER_LEVEL) + 1;
  const xpInLevel = totalXp % XP_PER_LEVEL;
  return { totalXp, level, xpInLevel, xpTarget: XP_PER_LEVEL };
}

// Floating "+20 XP" text that drifts up and fades — spawned imperatively so
// bursts can stack without extra re-renders of the whole dashboard.
function spawnFloatingXp(amount, originEl){
  if(typeof document==="undefined") return;
  const rect = originEl?.getBoundingClientRect();
  const x = rect ? rect.left + rect.width/2 : window.innerWidth/2;
  const y = rect ? rect.top : window.innerHeight/2;
  const el = document.createElement("div");
  el.className = "floating-xp";
  el.textContent = `+${amount} XP`;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(), 1600);
}

function vibrate(pattern){
  try{ if(navigator?.vibrate) navigator.vibrate(pattern); }catch{}
}

// A short zig-zag "level map" for the current learning week: 7 day-nodes,
// done/current/locked states driven by real progress data (no fake states).
function WeekJourneyMap({ week, currentMonth, currentWeek, currentDay, completedDays, onJumpToday }) {
  const offsets = [0, 34, 8, 42, 4, 36, 12]; // vertical wave pattern
  const days = week?.days || Array.from({length:7},(_,i)=>({day:i+1,task:""}));
  return (
    <div className="card" style={{marginBottom:12,overflow:"hidden"}}>
      <div style={{padding:"14px 20px 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.1em",color:"var(--muted)",fontFamily:"var(--font-mono)"}}>This Week's Path</span>
        <span style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>Week {currentWeek} of 4</span>
      </div>
      <div className="journey-scroll">
        {days.map((d,i)=>{
          const key=`m${currentMonth}w${currentWeek}d${d.day}`;
          const isDone=completedDays.includes(key);
          const isCurrent=!isDone && d.day===currentDay;
          const isLocked=!isDone && d.day>currentDay;
          const size=isCurrent?54:44;
          let bg="var(--surface2)",border="1px solid var(--border2)",color="var(--muted)";
          if(isDone){bg="var(--emerald)";color="#fff";border="1px solid var(--emerald)";}
          else if(isCurrent){bg="var(--gold)";color="#fff";border="2px solid var(--gold)";}
          return (
            <div key={d.day} style={{display:"flex",alignItems:"flex-end"}}>
              {i>0 && <div className="journey-connector" />}
              <div className="journey-node-wrap" style={{marginTop:offsets[i%offsets.length]}}>
                <button
                  onClick={isLocked?undefined:onJumpToday}
                  disabled={isLocked}
                  className={`journey-node${isCurrent?" current":""}`}
                  style={{width:size,height:size,background:bg,border,color,cursor:isLocked?"default":"pointer",fontSize:isCurrent?15:13}}
                  title={isLocked?"Locked — finish today's task first":`Day ${d.day}`}
                >
                  {isDone ? <Icon.Check/> : isLocked ? <span style={{fontSize:12,opacity:0.7}}>🔒</span> : d.day}
                </button>
                <span style={{fontSize:9,marginTop:6,color:"var(--muted)",fontFamily:"var(--font-mono)",whiteSpace:"nowrap"}}>
                  {isCurrent ? "YOU ARE HERE" : `Day ${d.day}`}
                </span>
              </div>
            </div>
          );
        })}
        <div className="journey-connector" />
        <div className="journey-node-wrap" style={{marginTop:offsets[0]}}>
          <div style={{width:44,height:44,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:"var(--surface2)",border:"1px dashed var(--border2)",fontSize:16,opacity:0.6}}>☁️</div>
          <span style={{fontSize:9,marginTop:6,color:"var(--subtle)",fontFamily:"var(--font-mono)",whiteSpace:"nowrap"}}>More ahead…</span>
        </div>
      </div>
    </div>
  );
}

function Friends({ user, isDemo }) {
  const [tab, setTab] = useState("friends"); // friends | requests | find
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [friendships, setFriendships] = useState([]);
  const [profileMap, setProfileMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [sentIds, setSentIds] = useState(new Set());

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const fs = await getFriendships(user.id);
    setFriendships(fs);
    const otherIds = [...new Set(fs.map(f => f.requester_id === user.id ? f.addressee_id : f.requester_id))];
    const map = await getProfilesByIds(otherIds);
    setProfileMap(map);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      const r = await searchProfiles(query, user.id);
      setResults(r);
      setSearching(false);
    }, 350);
    return () => clearTimeout(t);
  }, [query, user?.id]);

  const friendshipWith = (id) => friendships.find(f => f.requester_id === id || f.addressee_id === id);

  const handleAdd = async (targetId) => {
    if (isDemo) { alert("Sign up to add friends."); return; }
    setSentIds(s => new Set([...s, targetId]));
    await sendFriendRequest(user.id, targetId);
    await refresh();
  };
  const handleAccept = async (f) => { await respondFriendRequest(f.id, "accepted"); await refresh(); };
  const handleDecline = async (f) => { await removeFriendship(f.id); await refresh(); };
  const handleRemove = async (f) => { if (!confirm("Remove this friend?")) return; await removeFriendship(f.id); await refresh(); };
  const handleCancel = async (f) => { await removeFriendship(f.id); await refresh(); };

  const accepted = friendships.filter(f => f.status === "accepted");
  const incoming = friendships.filter(f => f.status === "pending" && f.addressee_id === user.id);
  const outgoing = friendships.filter(f => f.status === "pending" && f.requester_id === user.id);

  const nameFor = (f) => {
    const otherId = f.requester_id === user.id ? f.addressee_id : f.requester_id;
    return profileMap[otherId] || "Student";
  };
  const initials = (name) => (name || "?").trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();

  const TABS = [
    { key: "friends", label: "Friends", count: accepted.length },
    { key: "requests", label: "Requests", count: incoming.length },
    { key: "find", label: "Find Students", count: null },
  ];

  return (
    <div className="page container" style={{ paddingTop: 90, paddingBottom: 64, maxWidth: 760 }}>
      <div style={{ marginBottom: 24 }}>
        <p className="label" style={{ marginBottom: 4 }}>Social</p>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 400 }}>Friends</h2>
        <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>Find other students, connect, and study together.</p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 24, borderBottom: "1px solid var(--border)", paddingBottom: 0 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              padding: "10px 4px", marginRight: 20, fontSize: 13, fontFamily: "var(--font)",
              color: tab === t.key ? "var(--ink)" : "var(--muted)",
              borderBottom: tab === t.key ? "2px solid var(--accent2)" : "2px solid transparent",
              display: "flex", alignItems: "center", gap: 6, fontWeight: tab === t.key ? 600 : 400,
            }}>
            {t.label}
            {t.count > 0 && <span className="badge badge-blue" style={{ fontSize: 10, padding: "1px 7px" }}>{t.count}</span>}
          </button>
        ))}
      </div>

      {isDemo && (
        <div className="card" style={{ padding: 16, marginBottom: 20, fontSize: 13, color: "var(--muted)" }}>
          You're in demo mode — sign up to add real friends.
        </div>
      )}

      {tab === "find" && (
        <div>
          <p className="label" style={{ marginBottom: 10 }}>Search by name</p>
          <div style={{ position: "relative", marginBottom: 20 }}>
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }}><Icon.Search /></span>
            <input className="input" style={{ width: "100%", paddingLeft: 36 }} placeholder="Type a student's name…" value={query} onChange={e => setQuery(e.target.value)} />
          </div>
          {searching && <p style={{ fontSize: 13, color: "var(--muted)" }}>Searching…</p>}
          {!searching && query.trim() && results.length === 0 && (
            <p style={{ fontSize: 13, color: "var(--muted)" }}>No students found matching "{query.trim()}".</p>
          )}
          <div className="stack gap-8">
            {results.map(r => {
              const existing = friendshipWith(r.id);
              const alreadySent = sentIds.has(r.id);
              return (
                <div key={r.id} className="card" style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--surface2)", border: "1px solid var(--border2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, color: "var(--ink2)", fontFamily: "var(--font-mono)" }}>{initials(r.full_name)}</div>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{r.full_name}</span>
                  </div>
                  {existing?.status === "accepted" ? (
                    <span className="badge badge-neutral">Friends</span>
                  ) : existing?.status === "pending" ? (
                    <span className="badge badge-neutral">Pending</span>
                  ) : alreadySent ? (
                    <span className="badge badge-neutral">Sent</span>
                  ) : (
                    <button className="btn btn-secondary btn-sm row gap-6" onClick={() => handleAdd(r.id)}><Icon.UserPlus />Add</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "requests" && (
        <div className="stack gap-24">
          <div>
            <p className="label" style={{ marginBottom: 10 }}>Incoming ({incoming.length})</p>
            {loading ? <p style={{ fontSize: 13, color: "var(--muted)" }}>Loading…</p> : incoming.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--muted)" }}>No pending requests.</p>
            ) : (
              <div className="stack gap-8">
                {incoming.map(f => (
                  <div key={f.id} className="card" style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--surface2)", border: "1px solid var(--border2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, color: "var(--ink2)", fontFamily: "var(--font-mono)" }}>{initials(nameFor(f))}</div>
                      <span style={{ fontSize: 14, fontWeight: 500 }}>{nameFor(f)}</span>
                    </div>
                    <div className="row gap-8">
                      <button className="btn btn-primary btn-sm row gap-6" onClick={() => handleAccept(f)}><Icon.Check />Accept</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleDecline(f)}>Decline</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="label" style={{ marginBottom: 10 }}>Sent ({outgoing.length})</p>
            {outgoing.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--muted)" }}>No sent requests.</p>
            ) : (
              <div className="stack gap-8">
                {outgoing.map(f => (
                  <div key={f.id} className="card" style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--surface2)", border: "1px solid var(--border2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, color: "var(--ink2)", fontFamily: "var(--font-mono)" }}>{initials(nameFor(f))}</div>
                      <span style={{ fontSize: 14, fontWeight: 500 }}>{nameFor(f)}</span>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => handleCancel(f)}>Cancel</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "friends" && (
        <div>
          {loading ? <p style={{ fontSize: 13, color: "var(--muted)" }}>Loading…</p> : accepted.length === 0 ? (
            <div className="card" style={{ padding: 28, textAlign: "center" }}>
              <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 12 }}>No friends yet.</p>
              <button className="btn btn-secondary btn-sm" onClick={() => setTab("find")}>Find students to add</button>
            </div>
          ) : (
            <div className="stack gap-8">
              {accepted.map(f => (
                <div key={f.id} className="card" style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--surface2)", border: "1px solid var(--border2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, color: "var(--ink2)", fontFamily: "var(--font-mono)" }}>{initials(nameFor(f))}</div>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{nameFor(f)}</span>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => handleRemove(f)}>Remove</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Dashboard({ user, roadmap, progress, onUpdateProgress, onNav, isDemo }) {
  const{currentMonth=1,currentWeek=1,currentDay=1,streak=0,completedDays=[]}=progress;
  const totalDays=180;const pct=Math.min(100,Math.round((completedDays.length/totalDays)*100));
  const month=roadmap.months[currentMonth-1];const week=month?.weeks[currentWeek-1];
  const todayTask=week?.days[currentDay-1]?.task??"All caught up.";
  const todayKey=`m${currentMonth}w${currentWeek}d${currentDay}`;
  const todayDone=completedDays.includes(todayKey);

  const { totalXp, level, xpInLevel, xpTarget } = xpFromProgress(completedDays);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [heroLearners, setHeroLearners] = useState(null);
  const heroBtnRef = useRef(null);
  const doneBtnRef = useRef(null);

  // Social proof widget: only render if we can honestly fetch a real count.
  // No hardcoded/fake numbers — if the query fails (e.g. RLS blocks a
  // cross-user count with the anon key) the widget just doesn't show.
  useEffect(()=>{
    let cancelled=false;
    supabase.from("progress").select("user_id",{count:"exact",head:true})
      .then(({count,error})=>{ if(!cancelled && !error && typeof count==="number") setHeroLearners(count); })
      .catch(()=>{});
    return ()=>{cancelled=true;};
  },[]);

  // Streak-saver reminder. Works only while this tab/PWA is open in the
  // background — a real "notify even when fully closed" system needs a
  // service worker + push subscription + a server trigger, which isn't
  // wired up here.
  useEffect(()=>{
    if(typeof Notification==="undefined") return;
    if(Notification.permission==="default") Notification.requestPermission().catch(()=>{});
    const check=()=>{
      const hour=new Date().getHours();
      if(hour>=20 && streak>0 && !todayDone && Notification.permission==="granted"){
        new Notification(`Your ${streak}-day streak ends soon 🔥`,{ body:"Finish today's task to keep it alive.", tag:"streak-saver" });
      }
    };
    const id=setInterval(check, 15*60*1000);
    return ()=>clearInterval(id);
  },[streak,todayDone]);

  const markDone=async(e)=>{
    if(isDemo){alert("Sign up to track your progress.");return;}
    const key=todayKey;if(completedDays.includes(key))return;
    const newCompleted=[...completedDays,key];let nd=currentDay+1,nw=currentWeek,nm=currentMonth;
    if(nd>7){nd=1;nw++;}if(nw>4){nw=1;nm++;}if(nm>6)nm=6;
    const next={...progress,completedDays:newCompleted,streak:streak+1,currentDay:nd,currentWeek:nw,currentMonth:nm};

    const prevLevel = xpFromProgress(completedDays).level;
    const nextLevel = xpFromProgress(newCompleted).level;

    await upsertProgress(user.id,progressToDb(next));onUpdateProgress(next);

    spawnFloatingXp(XP_PER_DAY, e?.currentTarget || doneBtnRef.current);
    vibrate(nextLevel>prevLevel ? [40,60,40,60,120] : 30);
    if(nextLevel>prevLevel){
      setShowLevelUp(true);
      setTimeout(()=>setShowLevelUp(false), 1900);
    }
  };

  return (
    <div className="page container" style={{paddingTop:90,paddingBottom:64}}>
      {showLevelUp && (
        <div className="levelup-overlay">
          <div className="levelup-text">LEVEL UP!</div>
          <div className="levelup-sub">Now Level {level}</div>
        </div>
      )}

      <div style={{marginBottom:20,display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
        <div>
          <p style={{fontSize:11,color:"var(--muted)",marginBottom:4,fontFamily:"var(--font-mono)",textTransform:"uppercase",letterSpacing:"0.1em"}}>{roadmap.title}</p>
          <h2 style={{fontFamily:"var(--font-display)",fontSize:32,fontWeight:400}}>Dashboard</h2>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span className="streak-flame" style={{fontSize:22}}>🔥</span>
          <div>
            <div style={{fontSize:15,fontWeight:600,lineHeight:1.1}}>{streak > 0 ? `${streak}-Day Streak` : "No streak yet"}</div>
            <div style={{fontSize:11,color:"var(--muted)"}}>{streak<3 ? "Complete today's task to build it up" : "Keep it going"}</div>
          </div>
          <span
            title="Streak Freeze — earn one by finishing bonus/extra-credit work (coming soon)"
            style={{width:28,height:28,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",background:"var(--surface2)",border:"1px solid var(--border2)",opacity:0.45,fontSize:14,cursor:"help"}}
          >🛡️</span>
        </div>
      </div>

      {/* Weekly dot strip — 7 learning-days in the current week (the app tracks
          learning-day progress, not calendar dates, so this mirrors that rather
          than faking a Mon–Sun calendar). */}
      <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:20}}>
        {Array.from({length:7},(_,i)=>i+1).map(d=>{
          const done=completedDays.includes(`m${currentMonth}w${currentWeek}d${d}`);
          const isToday=d===currentDay;
          return <span key={d} className={`weekly-dot${done?" filled":""}`} style={{background:done?"var(--emerald)":isToday?"var(--gold)":"var(--surface3)"}} title={`Day ${d}${done?" — done":isToday?" — today":""}`} />;
        })}
        <span style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)",marginLeft:6}}>this week</span>
      </div>

      {/* XP bar */}
      <div className="card card-p" style={{marginBottom:12}}>
        <div className="row gap-8" style={{justifyContent:"space-between",marginBottom:8}}>
          <span style={{fontSize:13,fontWeight:600}}>Level {level}</span>
          <span style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>{xpInLevel} / {xpTarget} XP</span>
        </div>
        <div className="progress-track" style={{height:6,borderRadius:999,background:"var(--surface3)"}}>
          <div className="progress-fill" style={{width:`${Math.round((xpInLevel/xpTarget)*100)}%`,background:"linear-gradient(90deg,var(--accent2),var(--gold))",borderRadius:999}}/>
        </div>
      </div>

      {/* Hero button — one obvious next action */}
      <button ref={heroBtnRef} className="hero-continue-btn row gap-8" style={{justifyContent:"center",marginBottom:20}} onClick={()=>onNav(todayDone?"learn":"learn")}>
        Continue Your Journey <Icon.ArrowRight/>
      </button>

      <WeekJourneyMap
        week={week}
        currentMonth={currentMonth}
        currentWeek={currentWeek}
        currentDay={currentDay}
        completedDays={completedDays}
        onJumpToday={()=>onNav("learn")}
      />

      <div className="card card-p" style={{marginBottom:12,borderLeft:"2px solid var(--accent2)"}}>
        <div style={{marginBottom:10}}><span className="badge badge-neutral">Day {currentDay} · Today</span></div>
        <p style={{fontSize:14,lineHeight:1.7,color:"var(--ink2)",marginBottom:18}}>{todayTask}</p>
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          <button className="btn btn-primary row gap-6" onClick={()=>onNav("learn")}>Start Learning <Icon.ArrowRight/></button>
          <button ref={doneBtnRef} className="btn btn-secondary" onClick={markDone} disabled={todayDone}>{todayDone?"Done ✓":"Mark Done"}</button>
          {!isDemo&&<button className="btn btn-ghost" onClick={()=>onNav("onboard")}>Start another topic</button>}
        </div>
      </div>

      <div className="stats-grid" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:20}}>
        {[{label:"Month",value:`${currentMonth}`,sub:"of 6"},{label:"Week",value:`${currentWeek}`,sub:"of 4"},{label:"Streak",value:`${streak}`,sub:"days"},{label:"Complete",value:`${pct}%`,sub:`${completedDays.length}/${totalDays}`}].map(s=>(
          <div key={s.label} className="card stat-card" style={{position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",top:0,left:0,right:0,height:"1px",background:"linear-gradient(90deg,var(--accent2),transparent)"}}/>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-sub">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="card card-p" style={{marginBottom:12}}>
        <div className="row gap-8" style={{justifyContent:"space-between",marginBottom:10}}>
          <span style={{fontSize:13,fontWeight:500}}>Overall Progress</span>
          <span style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>{completedDays.length} / {totalDays}</span>
        </div>
        <div className="progress-track" style={{height:3}}><div className="progress-fill progress-fill-gold" style={{width:`${pct}%`}}/></div>
      </div>

      {heroLearners!==null && (
        <div className="card card-p" style={{marginBottom:12,display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:16}}>👥</span>
          <span style={{fontSize:13,color:"var(--ink2)"}}>{heroLearners} learner{heroLearners===1?"":"s"} on Velorn right now</span>
        </div>
      )}

      {week&&(
        <div className="card card-p">
          <p style={{fontSize:10,fontWeight:500,textTransform:"uppercase",letterSpacing:"0.1em",color:"var(--muted)",marginBottom:8,fontFamily:"var(--font-mono)"}}>Week {currentWeek} Goal</p>
          <p style={{fontSize:14,color:"var(--ink2)",lineHeight:1.7,marginBottom:14}}>{week.goal}</p>
          <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
            <span style={{fontSize:11,background:"var(--surface2)",border:"1px solid var(--border2)",color:"var(--ink2)",padding:"3px 10px",borderRadius:999,fontFamily:"var(--font-mono)"}}>{week.testTopic}</span>
            <button className="btn btn-secondary btn-sm" onClick={()=>onNav("test")}>Take Test</button>
          </div>
        </div>
      )}
    </div>
  );
}

const PROFESSOR_SYSTEM=`You are Professor Max — a clear, direct, knowledgeable mentor for teenagers. Write concisely. Use short paragraphs. Speak directly to "you". Never write like a textbook.`;

function Learn({ progress, roadmap, onUpdateProgress, user, isDemo }) {
  const{currentMonth=1,currentWeek=1,currentDay=1}=progress;
  const month=roadmap.months[currentMonth-1];const week=month?.weeks[currentWeek-1];const weekTopic=week?.goal??"Core Concepts";
  const[lectures,setLectures]=useState(null);const[active,setActive]=useState(0);const[loading,setLoading]=useState(false);
  const[doubt,setDoubt]=useState("");const[answer,setAnswer]=useState("");const[loadingDoubt,setLoadingDoubt]=useState(false);
  const[dayDone,setDayDone]=useState(false);const[showTask,setShowTask]=useState(false);const[taskSteps,setTaskSteps]=useState({});
  const[taskSubmitted,setTaskSubmitted]=useState(false);const[taskFeedback,setTaskFeedback]=useState("");const[loadingFeedback,setLoadingFeedback]=useState(false);
  const[taskDoubt,setTaskDoubt]=useState("");const[taskDoubtAnswer,setTaskDoubtAnswer]=useState("");const[loadingTaskDoubt,setLoadingTaskDoubt]=useState(false);
  // NEW STATE
  const[showTeachMe,setShowTeachMe]=useState(false);
  const[lectureError,setLectureError]=useState(false);

  const loadLectures=useCallback(async()=>{
    setLoading(true);
    setLectureError(false);
    const cacheKey=`${roadmapSlug(roadmap)}-m${currentMonth}w${currentWeek}d${currentDay}`;
    if(!isDemo&&user?.id){const cached=await withTimeout(getCachedLectures(user.id,cacheKey), 6000, null);if(cached&&cached.length>=3){setLectures(cached);setLoading(false);return;}}
    const prompt=`You are a world-class mentor teaching a 14-year-old beginner.\nWeek topic: "${weekTopic}"\nSubject: "${roadmap.title}"\nToday is Day ${currentDay} of 7 this week.\nFor Day ${currentDay}, cover sub-topics ${(currentDay-1)*5+1} to ${currentDay*5} of "${weekTopic}". Do NOT repeat previous days.\nGenerate EXACTLY 5 lectures. Return ONLY valid JSON. No markdown, no backticks.\n{"lectures":[{"num":1,"title":"Clear concise title","coreIdea":"2-3 sentences","example":"Real-world example","action":"One task","mistake":"One mistake","takeaway":"One sentence"},{"num":2,"title":"...","coreIdea":"...","example":"...","action":"...","mistake":"...","takeaway":"..."},{"num":3,"title":"...","coreIdea":"...","example":"...","action":"...","mistake":"...","takeaway":"..."},{"num":4,"title":"...","coreIdea":"...","example":"...","action":"...","mistake":"...","takeaway":"..."},{"num":5,"title":"...","coreIdea":"...","example":"...","action":"...","mistake":"...","takeaway":"...","homework":["Task 1","Task 2"]}]}`;
    // Retry once (real content > filler). A retry also gets a fresh shot at
    // askClaude's session-refresh check above, so a transient 401 self-heals.
    let parsed=null;
    for(let attempt=0; attempt<2 && !parsed; attempt++){
      let raw="";
      try{raw=await withTimeout(askClaude([{role:"user",content:prompt}]), 12000, "");}catch{raw="";}
      if(raw?.trim()){
        try{
          let c=raw.trim().replace(/```json|```/gi,"").replace(/,(\s*[}\]])/g,"$1");
          const m=c.match(/\{[\s\S]*\}/);
          if(m){const p=JSON.parse(m[0]);const a=p.lectures&&Array.isArray(p.lectures)?p.lectures:[];if(a.length>=3)parsed=a;}
        }catch(e){console.warn("Parse failed:",e.message);}
      }
    }
    if(parsed){
      setLectures(parsed);
      if(!isDemo&&user?.id)await saveCachedLectures(user.id,cacheKey,parsed);
      setLoading(false);
      return;
    }
    // Both attempts failed — show an honest error with a retry action instead
    // of silently serving generic filler content (title-only, no real substance).
    setLectureError(true);
    setLoading(false);
  }, [currentMonth, currentWeek, currentDay, isDemo, user?.id, weekTopic, roadmap.title]);

  useEffect(()=>{setLectures(null);setActive(0);setAnswer("");setDayDone(false);setShowTask(false);setTaskSteps({});setTaskSubmitted(false);setTaskFeedback("");loadLectures();},[loadLectures]);

  const submitDoubt=async()=>{if(!doubt.trim()||loadingDoubt)return;setLoadingDoubt(true);setAnswer("");try{const res=await askClaude([{role:"user",content:`${PROFESSOR_SYSTEM}\n\nStudent is learning "${roadmap.title}", this week: "${weekTopic}". Question: "${doubt}"\n\nAnswer clearly and specifically. Under 150 words.`}]);setAnswer(res||"No response. Try again.");}catch{setAnswer("Something went wrong.");}setLoadingDoubt(false);};
  const markDone=()=>{setDayDone(true);if(onUpdateProgress)onUpdateProgress({type:"complete_day"});};

  const getWeeklyTask=()=>{
    const lc=roadmap.title.toLowerCase();
    if(lc.includes("entrepreneur"))return{title:"Build Your Business Concept",description:"Apply today's lectures by designing a mini business concept.",steps:[{id:"problem",label:"The Problem",prompt:"Describe a real problem you've noticed.",placeholder:"e.g. Students have no affordable printing after 8pm..."},{id:"solution",label:"Your Solution",prompt:"What product or service solves this?",placeholder:"e.g. A 24/7 self-service print kiosk..."},{id:"customer",label:"Target Customer",prompt:"Describe your ideal customer.",placeholder:"e.g. Students aged 14-22..."},{id:"money",label:"Revenue Model",prompt:"How does the business make money?",placeholder:"e.g. ₹5 per page..."},{id:"edge",label:"Competitive Advantage",prompt:"What makes you better?",placeholder:"e.g. No competitor offers 24/7..."}]};
    if(lc.includes("cod")||lc.includes("program"))return{title:"Design a Mini Project",description:"Plan a small but complete software project.",steps:[{id:"idea",label:"Project Idea",prompt:"What will you build?",placeholder:"e.g. A habit tracker..."},{id:"features",label:"Core Features",prompt:"List 3-5 essential features.",placeholder:"e.g. Track habits, streak counter..."},{id:"tech",label:"Tech Stack",prompt:"What technologies?",placeholder:"e.g. React, Supabase..."},{id:"data",label:"Data Model",prompt:"What data does your app store?",placeholder:"e.g. User, Habit, Entry..."},{id:"challenge",label:"Biggest Challenge",prompt:"What will be hardest?",placeholder:"e.g. Push notifications..."}]};
    return{title:`Apply ${roadmap.title} Knowledge`,description:"Reflect on and apply what you learned today.",steps:[{id:"learning",label:"Key Learnings",prompt:"What are the 3 most important things?",placeholder:"Write here..."},{id:"apply",label:"Application",prompt:`Where would you use ${weekTopic}?`,placeholder:"Write here..."},{id:"project",label:"Project Idea",prompt:"Design a small project.",placeholder:"Write here..."},{id:"challenge",label:"Challenge",prompt:"What was hardest?",placeholder:"Write here..."},{id:"next",label:"Next Steps",prompt:"What will you explore next?",placeholder:"Write here..."}]};
  };

  const submitTask=async()=>{
    if(isDemo){alert("Sign up to submit tasks.");return;}
    const task=getWeeklyTask();if(!task.steps.every(s=>taskSteps[s.id]?.trim().length>10))return;
    setLoadingFeedback(true);const submission=task.steps.map(s=>`${s.label}: ${taskSteps[s.id]}`).join("\n\n");
    let fb="Good work. Your submission shows clear thinking.";
    try{const res=await askClaude([{role:"user",content:`Student learning "${roadmap.title}" submitted work on "${weekTopic}":\n\n${submission}\n\nGive honest, specific feedback. Around 200 words.`}]);if(res&&res.trim().length>20)fb=res;}catch{fb="Good work. Your submission shows clear thinking.";}
    setTaskFeedback(fb);setTaskSubmitted(true);setLoadingFeedback(false);
    try{await saveTaskSubmission(user.id,{weekKey:`${roadmapSlug(roadmap)}-m${currentMonth}w${currentWeek}d${currentDay}`,career:roadmap.title,taskTitle:getWeeklyTask().title,answers:taskSteps,feedback:fb});}catch{console.warn("Task submission could not be saved.");}
  };

  const submitTaskDoubt=async()=>{
    if(!taskDoubt.trim())return;setLoadingTaskDoubt(true);setTaskDoubtAnswer("");
    try{const task=getWeeklyTask();const ctx=task.steps.map(s=>taskSteps[s.id]?`${s.label}: ${taskSteps[s.id]}`:"").filter(Boolean).join("\n");const res=await askClaude([{role:"user",content:`Student working on "${weekTopic}" task. Work so far:\n${ctx}\nStuck on: "${taskDoubt}"\nGive a direct hint.`}]);setTaskDoubtAnswer(res||"Think from first principles.");}catch{setTaskDoubtAnswer("Break it into smaller parts.");}
    setLoadingTaskDoubt(false);setTaskDoubt("");
  };

  const getTakeaway=(lec)=>lec.keyTakeaway||lec.takeaway||"";

  if(loading)return(
    <div className="learn-loading page container">
      <div className="learn-loading-ring"/>
      <div style={{textAlign:"center"}}>
        <p className="learn-loading-text">Preparing Day {currentDay} lectures…</p>
        <p className="learn-loading-sub">{weekTopic}</p>
      </div>
    </div>
  );

  if(lectureError)return(
    <div className="learn-loading page container">
      <div style={{textAlign:"center"}}>
        <p className="learn-loading-text">Couldn't generate today's lecture.</p>
        <p className="learn-loading-sub">This usually clears up on retry — sometimes a session hiccup or a slow connection.</p>
        <button className="btn btn-primary" style={{marginTop:16}} onClick={loadLectures}>Try again</button>
      </div>
    </div>
  );

  const teachMeTopic = lectures && lectures[active] ? lectures[active].title : weekTopic;
  const lec = lectures?.[active];
  const progressPct = lectures ? Math.round(((active + 1) / lectures.length) * 100) : 0;

  return (
    <div className="page container-wide learn-page">
      {showTeachMe && (
        <TeachMeModal
          onClose={()=>setShowTeachMe(false)}
          lectureContext={teachMeTopic}
          user={user}
          isDemo={isDemo}
        />
      )}

      <div className="learn-header card">
        <div className="learn-header-top">
          <div>
            <div className="row gap-6" style={{flexWrap:"wrap",marginBottom:10}}>
              <span className="badge badge-neutral">Month {currentMonth} · Week {currentWeek}</span>
              <span className="badge badge-blue"><Icon.BookOpen/> Daily Lectures</span>
              <span className="badge badge-gold">Professor Max</span>
            </div>
            <h2 className="learn-header-title">{weekTopic}</h2>
            <p className="learn-header-meta">5 lectures · read at your own pace</p>
          </div>
          <div className="learn-day-ring">
            <span className="learn-day-ring-num">{currentDay}</span>
            <span className="learn-day-ring-label">Day</span>
          </div>
        </div>
        {lectures && (
          <div className="learn-step-dots">
            {lectures.map((_, i) => (
              <button
                key={i}
                className={`learn-step-dot ${i < active ? "done" : ""} ${i === active ? "active" : ""}`}
                onClick={() => setActive(i)}
                aria-label={`Go to lecture ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>

      {lectures && lec && (
        <div className="learn-layout">
          <aside className="learn-sidebar">
            <div className="card learn-sidebar-card">
              <p className="learn-sidebar-label">Today's Lectures</p>
              <div className="stack gap-1">
                {lectures.map((l, i) => (
                  <button
                    key={i}
                    className={`lec-list-item ${i === active ? "active" : ""} ${i < active ? "done" : ""}`}
                    onClick={() => setActive(i)}
                  >
                    <span className="lec-num">{i < active ? "✓" : i + 1}</span>
                    <span className="lec-list-title">{l.title}</span>
                  </button>
                ))}
              </div>
            </div>

            <button className="teach-btn" onClick={() => setShowTeachMe(true)}>
              <ChildBotAvatar size={24} mood="curious" />
              <div style={{ flex: 1, textAlign: "left" }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Teach Me!</div>
                <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--font-mono)", fontWeight: 400 }}>Feynman Technique</div>
              </div>
            </button>

            <ProfJokeSidekick topic={weekTopic} />
          </aside>

          <div style={{ minWidth: 0 }}>
            <div className="lec-pills">
              {lectures.map((l, i) => (
                <button key={i} className={`lec-pill ${i === active ? "active" : ""}`} onClick={() => setActive(i)}>
                  {i + 1}. {l.title.length > 28 ? l.title.slice(0, 28) + "…" : l.title}
                </button>
              ))}
            </div>

            <div className="card card-p-lg lec-content-card" style={{ marginBottom: 16 }}>
              <div className="lec-content-header">
                <div className="lec-content-num">{active + 1}</div>
                <div>
                  <h2 className="lec-content-title">{lec.title}</h2>
                  <p className="lec-content-sub">Lecture {active + 1} of {lectures.length} · {roadmap.title}</p>
                </div>
              </div>

              <div className="lec-sections">
                {lec.coreIdea && (
                  <div className="lec-section">
                    <div className="lec-section-icon lec-section-icon-blue"><Icon.Lightbulb/></div>
                    <div className="lec-section-body">
                      <div className="lec-section-label lec-section-label-blue">Core Concept</div>
                      <p className="lec-text">{lec.coreIdea}</p>
                    </div>
                  </div>
                )}
                {lec.example && (
                  <div className="lec-section">
                    <div className="lec-section-icon lec-section-icon-blue"><Icon.Globe/></div>
                    <div className="lec-section-body">
                      <div className="lec-section-label lec-section-label-blue">Real-World Example</div>
                      <p className="lec-text">{lec.example}</p>
                    </div>
                  </div>
                )}
                {lec.action && (
                  <div className="lec-section">
                    <div className="lec-section-icon lec-section-icon-green"><Icon.Zap/></div>
                    <div className="lec-section-body">
                      <div className="lec-section-label lec-section-label-green">Action Item</div>
                      <p className="lec-text">{lec.action}</p>
                    </div>
                  </div>
                )}
                {lec.mistake && (
                  <div className="lec-section">
                    <div className="lec-section-icon lec-section-icon-red"><Icon.AlertCircle/></div>
                    <div className="lec-section-body">
                      <div className="lec-section-label lec-section-label-red">Common Mistake</div>
                      <p className="lec-text">{lec.mistake}</p>
                    </div>
                  </div>
                )}
              </div>

              {getTakeaway(lec) && (
                <div className="lec-takeaway">
                  <div className="lec-takeaway-icon"><Icon.Star/></div>
                  <div>
                    <p className="lec-takeaway-label">Key Takeaway</p>
                    <p className="lec-takeaway-text">{getTakeaway(lec)}</p>
                  </div>
                </div>
              )}

              {lec.homework && (
                <div className="lec-homework">
                  <p className="lec-homework-label"><Icon.Clipboard/> Homework</p>
                  {lec.homework.map((t, i) => (
                    <div key={i} className="lec-homework-item">
                      <div className="lec-homework-num">{i + 1}</div>
                      <p className="lec-text" style={{ paddingTop: 2 }}>{t}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="lec-nav-row">
                <button className="btn btn-secondary row gap-6" onClick={() => setActive(a => Math.max(0, a - 1))} disabled={active === 0}>
                  <Icon.ChevronLeft/> Previous
                </button>
                {active < lectures.length - 1 ? (
                  <button className="btn btn-primary row gap-6" onClick={() => setActive(a => a + 1)}>
                    Next Lecture <Icon.ChevronRight/>
                  </button>
                ) : (
                  <button
                    className="btn btn-gold row gap-6"
                    onClick={() => { markDone(); setShowTask(true); window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }); }}
                    disabled={dayDone}
                  >
                    {dayDone ? "Done ✓" : "Complete & Task"}
                  </button>
                )}
              </div>
            </div>

            <div className="lec-progress-wrap">
              <div className="lec-progress-meta">
                <span>Lecture progress</span>
                <span>{active + 1} / {lectures.length} · {progressPct}%</span>
              </div>
              <div className="lec-progress-track">
                <div className="lec-progress-fill" style={{ width: `${progressPct}%` }}/>
              </div>
            </div>

            <div className="card card-p prof-ask-card">
              <div className="prof-ask-header">
                <div className="prof-ask-avatar"><ProfessorAvatar size={28} mood="normal"/></div>
                <div>
                  <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 400, marginBottom: 2 }}>Ask Professor Max</h3>
                  <p style={{ fontSize: 12, color: "var(--muted)" }}>Stuck on something? Ask about today's topic.</p>
                </div>
              </div>
              <textarea
                className="input"
                placeholder={`e.g. I don't understand ${weekTopic}...`}
                value={doubt}
                onChange={e => setDoubt(e.target.value)}
                style={{ width: "100%", marginBottom: 10 }}
              />
              <button className="btn btn-primary btn-sm row gap-6" onClick={submitDoubt} disabled={loadingDoubt || !doubt.trim()}>
                {loadingDoubt ? <><Icon.Loader/> Thinking…</> : <><Icon.Send/> Ask Professor</>}
              </button>
              {answer && (
                <div className="answer-box">
                  <p style={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--accent2)", marginBottom: 6, fontFamily: "var(--font-mono)" }}>Professor Max</p>
                  {answer}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showTask&&lectures&&(()=>{
        const task=getWeeklyTask();const allDone=task.steps.every(s=>taskSteps[s.id]?.trim().length>10);
        const colors=["var(--accent2)","#8a5230","var(--emerald)","var(--gold)","var(--ember)"];
        return (
          <div style={{marginTop:28}}>
            <div className="card card-p" style={{marginBottom:16,borderLeft:"2px solid var(--gold)"}}>
              <div className="row gap-7" style={{marginBottom:8}}><span className="badge badge-gold">Daily Task</span><span className="badge badge-neutral">Apply today's lectures</span></div>
              <h2 style={{fontFamily:"var(--font-display)",fontSize:22,fontWeight:400,marginBottom:4}}>{task.title}</h2>
              <p style={{fontSize:13,color:"var(--muted)",lineHeight:1.65}}>{task.description}</p>
            </div>
            {!taskSubmitted?(
              <div className="stack gap-12">
                {task.steps.map((step,si)=>(
                  <div key={step.id} className="card card-p" style={{borderLeft:`2px solid ${colors[si]}`}}>
                    <div className="row gap-8" style={{marginBottom:8}}><div style={{width:24,height:24,borderRadius:6,background:colors[si],color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:600,fontSize:11,flexShrink:0,fontFamily:"var(--font-mono)"}}>{si+1}</div><h3 style={{fontSize:13,fontWeight:500}}>{step.label}</h3></div>
                    <p style={{fontSize:12,color:"var(--muted)",marginBottom:10,lineHeight:1.65}}>{step.prompt}</p>
                    <textarea className="input" value={taskSteps[step.id]||""} onChange={e=>setTaskSteps(p=>({...p,[step.id]:e.target.value}))} placeholder={step.placeholder} style={{width:"100%"}}/>
                    {taskSteps[step.id]?.trim().length>10&&(<div className="row gap-4" style={{marginTop:5}}><Icon.Check style={{color:"var(--emerald)"}}/><span style={{fontSize:11,color:"var(--emerald)",fontFamily:"var(--font-mono)"}}>Looks good</span></div>)}
                  </div>
                ))}
                <div className="card card-p">
                  <div className="row gap-7" style={{marginBottom:7}}><Icon.MessageCircle/><h3 style={{fontSize:13,fontWeight:500}}>Need help?</h3></div>
                  <textarea className="input" value={taskDoubt} onChange={e=>setTaskDoubt(e.target.value)} placeholder="Describe where you're stuck…" style={{width:"100%",marginBottom:8}}/>
                  <button className="btn btn-secondary btn-sm row gap-6" onClick={submitTaskDoubt} disabled={loadingTaskDoubt||!taskDoubt.trim()}>{loadingTaskDoubt?<><Icon.Loader/>Thinking…</>:"Get a Hint"}</button>
                  {taskDoubtAnswer&&<div className="answer-box">{taskDoubtAnswer}</div>}
                </div>
                <button className="btn row gap-8" style={{justifyContent:"center",padding:"11px 20px",background:allDone?"var(--ink)":"var(--surface2)",color:allDone?"var(--bg)":"var(--muted)",border:`1px solid ${allDone?"var(--ink)":"var(--border)"}`,borderRadius:8,cursor:allDone?"pointer":"not-allowed"}} onClick={submitTask} disabled={loadingFeedback||!allDone}>{loadingFeedback?<><Icon.Loader/>Reviewing…</>:"Submit for Feedback"}</button>
                {!allDone&&<p style={{textAlign:"center",fontSize:12,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>Complete all {task.steps.length} fields to submit.</p>}
              </div>
            ):(
              <div className="card card-p">
                <div style={{marginBottom:16}}><div className="row gap-7" style={{marginBottom:4}}><Icon.Award style={{color:"var(--gold)"}}/><span className="badge badge-gold">Task Complete</span></div><h3 style={{fontFamily:"var(--font-display)",fontSize:20,fontWeight:400,marginTop:10,marginBottom:4}}>Professor Max's Feedback</h3></div>
                <div className="answer-box" style={{marginTop:0,marginBottom:20}}>{taskFeedback}</div>
                <div className="stack gap-10">{task.steps.map((step,si)=>(<div key={step.id} style={{paddingBottom:10,borderBottom:si<task.steps.length-1?"1px solid var(--border)":"none"}}><p style={{fontSize:10,fontWeight:500,textTransform:"uppercase",letterSpacing:"0.1em",color:"var(--muted)",marginBottom:3,fontFamily:"var(--font-mono)"}}>{step.label}</p><p style={{fontSize:13,color:"var(--ink2)",lineHeight:1.7}}>{taskSteps[step.id]}</p></div>))}</div>
                <button className="btn btn-secondary btn-sm" style={{marginTop:16}} onClick={()=>{setTaskSubmitted(false);setTaskFeedback("");}}>Revise</button>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

function WeeklyTest({ progress, roadmap }) {
  const{currentWeek=1,currentMonth=1}=progress;
  const month=roadmap.months[currentMonth-1];const week=month?.weeks[currentWeek-1];const topic=week?.testTopic??week?.goal??"Core Concepts";
  const[questions,setQuestions]=useState(null);const[loading,setLoading]=useState(false);const[answers,setAnswers]=useState({});const[submitted,setSubmitted]=useState(false);const[score,setScore]=useState(0);const[currentQ,setCurrentQ]=useState(0);
  const loadTest=async()=>{
    setLoading(true);setSubmitted(false);setAnswers({});setCurrentQ(0);let allQ=[];
    try{const raw=await askClaude([{role:"user",content:`Create 25 multiple choice questions for a student learning about "${topic}".\nReturn ONLY JSON:\n{"questions":[{"q":"Question?","options":["A) answer","B) answer","C) answer","D) answer"],"answer":"A","explanation":"Why"}]}`}]);
      let c=raw.trim().replace(/```json|```/gi,"").replace(/,(\s*[}\]])/g,"$1");const m=c.match(/\{[\s\S]*\}/);if(m){const d=JSON.parse(m[0]);if(d.questions?.length>0)allQ=d.questions.slice(0,25);}
    }catch{allQ=[];}
    if(allQ.length===0)allQ=Array.from({length:25},(_,i)=>({q:`Question ${i+1}: What is an important concept in ${topic}?`,options:["A) Option A","B) Option B","C) Option C","D) Option D"],answer:"A",explanation:`This is a key concept in ${topic}.`}));
    setQuestions(allQ);setLoading(false);
  };
  const submit=()=>{let s=0;questions.forEach((q,i)=>{if(answers[i]===q.answer)s++;});setScore(s);setSubmitted(true);setCurrentQ(0);};
  const pct=questions?Math.round((Object.keys(answers).length/questions.length)*100):0;
  const scorePct=submitted?Math.round(score/questions.length*100):0;
  return (
    <div className="page container" style={{paddingTop:84,paddingBottom:64}}>
      <div className="card card-p" style={{marginBottom:20,borderLeft:"2px solid var(--accent2)"}}>
        <div className="row gap-6" style={{flexWrap:"wrap",marginBottom:6}}><span className="badge badge-neutral">M{currentMonth} · W{currentWeek}</span><span className="badge badge-gold">25 Questions</span></div>
        <h2 style={{fontFamily:"var(--font-display)",fontSize:22,fontWeight:400,marginBottom:2}}>Weekly Assessment</h2>
        <p style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>{topic}</p>
      </div>
      {!questions&&!loading&&(<div style={{textAlign:"center",padding:"60px 20px"}}><div style={{width:60,height:60,borderRadius:12,background:"var(--surface2)",border:"1px solid var(--border2)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",color:"var(--accent2)"}}><Icon.CheckSquare/></div><h3 style={{fontFamily:"var(--font-display)",fontSize:26,fontWeight:400,marginBottom:8}}>Ready to test your knowledge?</h3><p style={{color:"var(--muted)",marginBottom:28,fontSize:13,fontFamily:"var(--font-mono)"}}>25 questions on {topic}. No time limit.</p><button className="btn btn-primary btn-lg" style={{margin:"0 auto"}} onClick={loadTest}>Start Assessment →</button></div>)}
      {loading&&(<div style={{textAlign:"center",padding:"60px 20px"}}><div style={{width:36,height:36,border:"1px solid var(--border2)",borderTop:"1px solid var(--accent2)",borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 14px"}}/><p style={{fontSize:12,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>Generating questions…</p></div>)}
      {questions&&!submitted&&(
        <div>
          <div className="card card-p" style={{marginBottom:14}}>
            <div className="row gap-8" style={{justifyContent:"space-between",marginBottom:7,fontSize:12}}><span style={{fontWeight:500,fontFamily:"var(--font-mono)"}}>Q {currentQ+1} / {questions.length}</span><span style={{color:"var(--muted)",fontFamily:"var(--font-mono)"}}>{Object.keys(answers).length} answered</span></div>
            <div className="progress-track" style={{height:2,marginBottom:12}}><div className="progress-fill progress-fill-gold" style={{width:`${pct}%`}}/></div>
            <div style={{display:"flex",flexWrap:"wrap",gap:4}}>{questions.map((_,i)=>(<button key={i} onClick={()=>setCurrentQ(i)} style={{width:26,height:26,borderRadius:4,border:`1px solid ${i===currentQ?"var(--accent2)":answers[i]?"var(--emerald)":"var(--border)"}`,background:i===currentQ?"var(--accent2)":answers[i]?"rgba(63,92,46,0.1)":"var(--surface2)",color:i===currentQ?"#fff":answers[i]?"var(--emerald)":"var(--muted)",fontWeight:600,fontSize:10,cursor:"pointer",fontFamily:"var(--font-mono)",transition:"all 0.1s"}}>{i+1}</button>))}</div>
          </div>
          <div className="card card-p-lg" style={{marginBottom:14}}>
            <p style={{fontSize:10,fontWeight:500,textTransform:"uppercase",letterSpacing:"0.12em",color:"var(--gold)",marginBottom:10,fontFamily:"var(--font-mono)"}}>Question {currentQ+1}</p>
            <p style={{fontFamily:"var(--font-display)",fontSize:"clamp(16px,2vw,20px)",fontWeight:400,lineHeight:1.6,marginBottom:20,color:"var(--ink)"}}>{questions[currentQ].q}</p>
            <div className="stack gap-7">{questions[currentQ].options.map((opt,j)=>{const letter=["A","B","C","D"][j];const selected=answers[currentQ]===letter;return(<button key={j} className={`mcq-option ${selected?"selected":""}`} onClick={()=>setAnswers(a=>({...a,[currentQ]:letter}))}>{opt}</button>);})}</div>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button className="btn btn-secondary row gap-6" onClick={()=>setCurrentQ(q=>Math.max(0,q-1))} disabled={currentQ===0}><Icon.ChevronLeft/>Prev</button>
            {currentQ<questions.length-1?<button className="btn btn-primary row gap-6" onClick={()=>setCurrentQ(q=>q+1)}>Next<Icon.ChevronRight/></button>:<button className="btn btn-gold" onClick={submit} disabled={Object.keys(answers).length<questions.length}>Submit All</button>}
          </div>
          {Object.keys(answers).length<questions.length&&currentQ===questions.length-1&&(<p style={{color:"var(--ember)",fontSize:12,marginTop:8,fontFamily:"var(--font-mono)"}}>Answer {questions.length-Object.keys(answers).length} more questions first.</p>)}
        </div>
      )}
      {submitted&&(
        <div>
          <div className="card card-p-lg" style={{textAlign:"center",marginBottom:20,background:scorePct>=80?"rgba(63,92,46,0.04)":scorePct>=60?"rgba(138,92,35,0.04)":"rgba(122,59,59,0.04)",border:`1px solid ${scorePct>=80?"rgba(63,92,46,0.15)":scorePct>=60?"rgba(138,92,35,0.15)":"rgba(122,59,59,0.15)"}`}}>
            <h2 style={{fontFamily:"var(--font-display)",fontSize:52,fontWeight:300,fontStyle:"italic",letterSpacing:"-0.02em",marginBottom:4,color:scorePct>=80?"var(--emerald)":scorePct>=60?"var(--gold)":"var(--ember)"}}>{score}/{questions.length}</h2>
            <p style={{fontSize:14,fontWeight:500,marginBottom:4}}>{scorePct}% — {scorePct>=80?"Excellent":scorePct>=60?"Good progress":"Keep studying"}</p>
            <p style={{fontSize:12,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>{score} correct · {questions.length-score} incorrect</p>
          </div>
          <h3 style={{fontFamily:"var(--font-display)",fontSize:22,fontWeight:400,marginBottom:12}}>Full Review</h3>
          <div className="stack gap-8">{questions.map((q,i)=>{const correct=answers[i]===q.answer;return(<div key={i} className="card card-p" style={{borderLeft:`2px solid ${correct?"var(--emerald)":"var(--ember)"}`}}><div className="row gap-8" style={{justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}><p style={{fontWeight:500,fontSize:13,flex:1,lineHeight:1.55}}>{i+1}. {q.q}</p><span className={`badge ${correct?"badge-green":"badge-red"}`} style={{flexShrink:0,marginLeft:8}}>{correct?"✓":"✗"}</span></div><p style={{fontSize:12,color:"var(--muted)",marginBottom:4,fontFamily:"var(--font-mono)"}}>Your: <strong>{answers[i]}</strong> · Correct: <strong style={{color:"var(--emerald)"}}>{q.answer}</strong></p><p style={{fontSize:12,color:"var(--muted)",lineHeight:1.55}}>{q.explanation}</p></div>);})}</div>
          <button className="btn btn-primary" style={{width:"100%",justifyContent:"center",marginTop:16}} onClick={loadTest}>Retake</button>
        </div>
      )}
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────────────
export default function App() {
  const[page,setPage]=useState("loading");
  const[loadTimedOut,setLoadTimedOut]=useState(false);
  const[user,setUser]=useState(null);
  const[profile,setProfile]=useState(null);
  const[roadmap,setRoadmap]=useState(null);
  const[progress,setProgress]=useState(null);
  const[isDemo,setIsDemo]=useState(false);
  const[showEmailSettings,setShowEmailSettings]=useState(false);
  const[streakAlert,setStreakAlert]=useState(null);
  // NEW: welcome screen state
  const[showWelcome,setShowWelcome]=useState(false);
  const[welcomeName,setWelcomeName]=useState("");
  const[pendingTopic,setPendingTopic]=useState("");
  const[pendingTrack,setPendingTrack]=useState(null);
  // Theme: light by default, remembers the user's choice on this device
  const[theme,setTheme]=useState(()=>{
    try{
      const saved=localStorage.getItem("velorn_theme");
      if(saved==="light"||saved==="dark")return saved;
      return window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";
    }catch{return"light";}
  });
  useEffect(()=>{
    document.documentElement.setAttribute("data-theme",theme);
    try{localStorage.setItem("velorn_theme",theme);}catch{/* best-effort only */}
  },[theme]);
  const toggleTheme=()=>setTheme(t=>t==="dark"?"light":"dark");

  useEffect(()=>{if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));},[]);

  useEffect(()=>{
    const init=async()=>{const{data:{session}}=await supabase.auth.getSession();if(session?.user)await loadUserData(session.user);else setPage("landing");};
    init();
    const{data:{subscription}}=supabase.auth.onAuthStateChange(async(_,session)=>{if(session?.user)await loadUserData(session.user);});
    return()=>subscription.unsubscribe();
  },[]);

  const loadUserData=async(authUser)=>{
    setUser(authUser);
    setLoadTimedOut(false);
    // Run these in parallel — previously sequential, which meant up to
    // 3x 8s = 24s of dead time on login under any real backend latency.
    // A distinct sentinel (not null) marks "timed out" so we never confuse
    // a slow response with a genuine "this user has no roadmap yet" answer.
    const TIMEOUT_MARK = "__TIMEOUT__";
    const [prof, rm, pg] = await Promise.all([
      withTimeout(getProfile(authUser.id), 10000, TIMEOUT_MARK),
      withTimeout(getRoadmap(authUser.id), 10000, TIMEOUT_MARK),
      withTimeout(getProgress(authUser.id), 10000, TIMEOUT_MARK),
    ]);
    if(prof===TIMEOUT_MARK || rm===TIMEOUT_MARK || pg===TIMEOUT_MARK){
      // Genuinely unknown state (slow network/backend) — do NOT guess this
      // means "new user". Show a retry instead of silently onboarding them
      // and overwriting real progress.
      setLoadTimedOut(true);
      return;
    }
    setProfile(prof);
    saveKnownDeviceUser(authUser, prof);
    const today=new Date().toISOString().slice(0,10);

    if(rm?.data){
      setRoadmap(rm.data);
      const ap=dbToProgress(pg);setProgress(ap);
      const lv=pg?.last_visit;
      if(lv&&lv!==today){
        const yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10);
        if(lv!==yesterday){setStreakAlert("lost");const rp={...ap,streak:0};setProgress(rp);await upsertProgress(authUser.id,{...progressToDb(rp),streak:0});}
      }
      await upsertProgress(authUser.id,{...progressToDb(ap),last_visit:today});
      setPage("dashboard");
    }else{
      await upsertProgress(authUser.id,{...initialProgressFields(),last_visit:today});
      let activeProfile = prof;
      if(!activeProfile&&authUser.user_metadata?.full_name){
        activeProfile={full_name:authUser.user_metadata.full_name,age:null,grade:null,has_seen_onboarding:false};
        await upsertProfile(authUser.id,activeProfile);setProfile(activeProfile);
      }
      setPage(activeProfile?.has_seen_onboarding ? "onboard" : "feynmanIntro");
    }
  };

  const onAuth=async(au,prof,hasRoadmap)=>{
    setUser(au);setProfile(prof);
    if(hasRoadmap){
      await loadUserData(au);
    } else {
      setPage(prof?.has_seen_onboarding ? "onboard" : "feynmanIntro");
    }
  };

  const handleFeynmanIntroDone=async()=>{
    if(user?.id){
      await markFeynmanOnboardingSeen(user.id);
      setProfile(p=>({...p,has_seen_onboarding:true}));
    }
    setPage("onboard");
  };

  const logout=async()=>{await supabase.auth.signOut();setUser(null);setProfile(null);setRoadmap(null);setProgress(null);setPendingTopic("");setPendingTrack(null);setPage("landing");};
  const startDemo=()=>{setRoadmap(DEMO_ROADMAP);setProgress(DEMO_PROGRESS);setIsDemo(true);setPage("dashboard");};
  const exitDemo=()=>{setIsDemo(false);setRoadmap(null);setProgress(null);setUser(null);setPendingTopic("");setPendingTrack(null);setPage("landing");};
  const startCustomTopic=(topic="")=>{setPendingTopic(topic.trim());setPendingTrack(null);setPage(user?"onboard":"auth");};
  const startSuggestedTrack=(track)=>{setPendingTopic(track.topic);setPendingTrack(track);setPage(user?"onboard":"auth");};

  // Called when onboarding finishes — show welcome screen first
  const handleOnboardingDone = (rm, pg) => {
    setRoadmap(rm);setProgress(pg);
    setPendingTopic("");setPendingTrack(null);
    const name = profile?.full_name || user?.user_metadata?.full_name || "there";
    setWelcomeName(name);
    setShowWelcome(true);
    setPage("dashboard");
  };

  const showNav=page!=="loading";
  const navUser=isDemo?{email:"demo@velorn.app"}:user;

  if(page==="loading"&&loadTimedOut)return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",flexDirection:"column",gap:14,background:"#0e0c0a",padding:24,textAlign:"center"}}>
      <p style={{fontSize:11,color:"#5a5248",fontFamily:"'DM Mono',monospace",letterSpacing:"0.1em",textTransform:"uppercase"}}>Velorn</p>
      <p style={{fontSize:14,color:"#c9c2b6",maxWidth:280}}>Taking longer than usual to load your account.</p>
      <button className="btn btn-primary" onClick={()=>loadUserData(user)}>Try again</button>
    </div>
  );

  if(page==="loading")return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",flexDirection:"column",gap:10,background:"#0e0c0a"}}>
      <div style={{width:32,height:32,border:"1px solid rgba(255,255,255,0.08)",borderTop:"1px solid #8ba86a",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
      <p style={{fontSize:11,color:"#5a5248",fontFamily:"'DM Mono',monospace",letterSpacing:"0.1em",textTransform:"uppercase"}}>Velorn</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <>
      <style>{css}</style>

      {/* ── Welcome Screen (first login only) ── */}
      {showWelcome && (
        <WelcomeScreen
          name={welcomeName}
          onDone={() => setShowWelcome(false)}
        />
      )}

      {streakAlert==="lost"&&(
        <div style={{background:"rgba(122,59,59,0.08)",borderBottom:"1px solid rgba(122,59,59,0.15)",padding:"9px 24px",display:"flex",alignItems:"center",justifyContent:"center",gap:10,fontSize:12,color:"var(--ember)",fontFamily:"var(--font-mono)",position:"fixed",top:60,left:0,right:0,zIndex:190}}>
          <Icon.AlertCircle/><span>You lost your streak. Come back today to start a new one.</span>
          <button style={{background:"none",border:"none",cursor:"pointer",color:"var(--ember)",marginLeft:4}} onClick={()=>setStreakAlert(null)}><Icon.X/></button>
        </div>
      )}

      {showNav&&<Nav user={navUser} onLogout={isDemo?exitDemo:logout} onNav={p=>{if(p==="auth")setPage("auth");else setPage(p);}} page={page} onOpenEmailSettings={()=>setShowEmailSettings(true)} isDemo={isDemo} onSignUp={()=>{exitDemo();setPage("auth");}} theme={theme} onToggleTheme={toggleTheme}/>}

      {isDemo&&(
        <div className="demo-banner">
          <span style={{color:"var(--muted)",fontFamily:"var(--font-mono)",fontSize:10,letterSpacing:"0.1em",textTransform:"uppercase"}}>Demo</span>
          <span>Exploring a sample Entrepreneurship roadmap</span>
          <button className="btn btn-primary btn-sm" onClick={()=>{exitDemo();setPage("auth");}}>Sign Up Free</button>
        </div>
      )}

      {showEmailSettings&&!isDemo&&(
        <EmailSettingsModal
          onClose={()=>setShowEmailSettings(false)}
          userId={user?.id}
          userEmail={user?.email}
          userName={profile?.full_name||user?.user_metadata?.full_name||"Student"}
          roadmap={roadmap}
          progress={progress}
        />
      )}

      {page==="landing"&&<Landing onStart={startCustomTopic} onDemo={startDemo} onTrack={startSuggestedTrack}/>}
      {page==="auth"&&<Auth onAuth={onAuth}/>}
      {page==="feynmanIntro"&&user&&<FeynmanIntro name={profile?.full_name||user?.user_metadata?.full_name||"there"} onDone={handleFeynmanIntroDone}/>}
      {page==="onboard"&&user&&<Onboarding key={`${pendingTopic}-${pendingTrack?.id||"custom"}`} user={user} profile={profile} onDone={handleOnboardingDone} initialTopic={pendingTopic} initialTrack={pendingTrack}/>}
      {page==="dashboard"&&roadmap&&progress&&<Dashboard user={user} roadmap={roadmap} progress={progress} onUpdateProgress={p=>setProgress(p)} onNav={setPage} isDemo={isDemo}/>}
      {page==="learn"&&roadmap&&progress&&<Learn user={user} progress={progress} roadmap={roadmap} onUpdateProgress={p=>setProgress(p)} isDemo={isDemo} onSignUp={()=>{exitDemo();setPage("auth");}}/>}
      {page==="test"&&roadmap&&progress&&<WeeklyTest progress={progress} roadmap={roadmap}/>}
      {page==="friends"&&user&&<Friends user={user} isDemo={isDemo}/>}
    </>
  );
}