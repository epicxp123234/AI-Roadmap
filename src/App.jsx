import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL  = "https://knqclhfxhkishaivowhe.supabase.co";
const SUPABASE_ANON = "sb_publishable_xcwOjTEqwOgX6VHhB2krTA_YI1Swr5_";
// Fixed:
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "velorn-auth",
  }
});

async function askClaude(messages) {
  const userMessage = messages.find(m => m.role === "user")?.content || "";
  try {
    const res = await fetch("https://knqclhfxhkishaivowhe.supabase.co/functions/v1/ask-doubt",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: userMessage }) });
    const data = await res.json();
    if (typeof data.answer === "string") return data.answer;
    if (data.answer?.content) return data.answer.content;
    return JSON.stringify(data);
  } catch (e) { console.error("askClaude error:", e); return ""; }
}

async function getProfile(userId) {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) console.error("Get Profile Error:", error);
  return data;
}
async function upsertProfile(userId, fields) {
  const { error } = await supabase.from("profiles").upsert({ id: userId, ...fields });
  if (error) console.error("Upsert Profile Error:", error);
}
async function getRoadmap(userId) {
  const { data, error } = await supabase.from("roadmaps").select("*").eq("user_id", userId).maybeSingle();
  if (error) console.error("Get Roadmap Error:", error);
  return data;
}
async function upsertRoadmap(userId, roadmapData, meta = {}) {
  const { error } = await supabase.from("roadmaps").upsert({ user_id: userId, title: roadmapData.title, data: roadmapData, ...meta });
  if (error) console.error("Upsert Roadmap Error:", error);
}
async function getProgress(userId) {
  const { data, error } = await supabase.from("progress").select("*").eq("user_id", userId).maybeSingle();
  if (error) console.error("Get Progress Error:", error);
  if (!data) return { current_month: 1, current_week: 1, current_day: 1, streak: 0, completed_days: [], last_visit: new Date().toISOString().slice(0, 10) };
  return data;
}
async function upsertProgress(userId, fields) {
  const { error } = await supabase.from("progress").upsert({ user_id: userId, ...fields, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) console.error("Upsert Progress Error:", error);
}
async function saveTaskSubmission(userId, data) {
  const { error } = await supabase.from("task_submissions").upsert({ user_id: userId, week_key: data.weekKey, career: data.career, task_title: data.taskTitle, answers: data.answers, feedback: data.feedback, submitted_at: new Date().toISOString() }, { onConflict: "user_id,week_key" });
  if (error) console.error("Save Task Submission Error:", error);
}
async function getCachedLectures(userId, key) {
  const { data, error } = await supabase.from("lecture_cache").select("lectures").eq("user_id", userId).eq("roadmap_key", key).maybeSingle();
  if (error) console.error("Cache get error:", error);
  return data?.lectures || null;
}
async function saveCachedLectures(userId, key, lectures) {
  const { error } = await supabase.from("lecture_cache").upsert({ user_id: userId, roadmap_key: key, lectures }, { onConflict: "user_id,roadmap_key" });
  if (error) console.error("Cache save error:", error);
}
function dbToProgress(row) {
  if (!row) return { currentMonth:1, currentWeek:1, currentDay:1, streak:0, completedDays:[] };
  return { currentMonth: row.current_month??1, currentWeek: row.current_week??1, currentDay: row.current_day??1, streak: row.streak??0, completedDays: row.completed_days??[], lastVisit: row.last_visit };
}
function progressToDb(p) { return { current_month: p.currentMonth, current_week: p.currentWeek, current_day: p.currentDay, streak: p.streak, completed_days: p.completedDays, last_visit: new Date().toISOString().slice(0,10) }; }
function getEJS() { try { return { serviceId: localStorage.getItem("ejs_service")||"", templateId: localStorage.getItem("ejs_template")||"", publicKey: localStorage.getItem("ejs_key")||"" }; } catch(e) { return { serviceId:"", templateId:"", publicKey:"" }; } }
const EJS = getEJS();
async function sendStreakLostEmail(userName, userEmail, streak) {
  if (!EJS.serviceId || !EJS.templateId || !EJS.publicKey) return false;
  try {
    if (!window.emailjs) { await new Promise((res,rej)=>{ const s=document.createElement("script"); s.src="https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js"; s.onload=res; s.onerror=rej; document.head.appendChild(s); }); window.emailjs.init(EJS.publicKey); }
    await window.emailjs.send(EJS.serviceId, EJS.templateId, { to_name: userName, to_email: userEmail, streak, app_name:"Velorn", login_url: window.location.href, message:`You had a ${streak}-day streak! Come back today.` });
    return true;
  } catch(e) { return false; }
}

const Icon = {
  Map: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>,
  BookOpen: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
  Brain: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/></svg>,
  CheckSquare: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  BarChart: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  Flame: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>,
  ArrowRight: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
  ChevronLeft: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>,
  ChevronRight: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>,
  MessageCircle: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  Send: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  X: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Bell: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  Check: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  AlertCircle: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  LogOut: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  Eye: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  Award: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>,
  Loader: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{animation:"spin 1s linear infinite"}}><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>,
};

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&family=Geist:wght@300;400;500;600;700;800;900&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  :root{
    --bg:#0a0a0f;--bg2:#0f0f18;--surface:#13131f;--surface2:#1a1a28;--surface3:#222234;
    --border:rgba(255,255,255,0.06);--border2:rgba(255,255,255,0.10);--border3:rgba(255,255,255,0.16);
    --ink:#f0f0ff;--ink2:#a0a0c0;--muted:#606080;--subtle:#404060;
    --accent:#6366f1;--accent2:#818cf8;--accent3:#4f46e5;
    --gold:#f59e0b;--gold2:#fbbf24;--emerald:#10b981;--ember:#ef4444;
    --gold-light:rgba(245,158,11,0.10);--gold-border:rgba(245,158,11,0.25);
    --emerald-light:rgba(16,185,129,0.10);--ember-light:rgba(239,68,68,0.10);--blue-light:rgba(99,102,241,0.10);
    --r:10px;--font:'Geist',system-ui,sans-serif;--font-display:'Instrument Serif',Georgia,serif;--font-mono:'Geist Mono',monospace;
  }
  body{font-family:var(--font);background:var(--bg);color:var(--ink);min-height:100vh;width:100%;overflow-x:hidden;-webkit-font-smoothing:antialiased;}
  body::before{content:'';position:fixed;inset:0;z-index:0;background-image:linear-gradient(rgba(99,102,241,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(99,102,241,0.03) 1px,transparent 1px);background-size:48px 48px;pointer-events:none;}
  #root{width:100%;position:relative;z-index:1;}
  h1,h2,h3{letter-spacing:-0.02em;}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
  @keyframes float3d{0%,100%{transform:translateY(0) rotateX(0deg) rotateY(0deg)}33%{transform:translateY(-15px) rotateX(5deg) rotateY(3deg)}66%{transform:translateY(-8px) rotateX(-3deg) rotateY(-5deg)}}
  @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
  @keyframes pulse-glow{0%,100%{opacity:0.5;transform:scale(1)}50%{opacity:0.8;transform:scale(1.05)}}
  .page{animation:fadeUp 0.4s cubic-bezier(0.22,1,0.36,1) both;}
  .nav{position:sticky;top:16px;z-index:100;margin:16px auto;width:calc(100% - 48px);max-width:860px;height:52px;padding:0 20px;background:rgba(19,19,31,0.85);backdrop-filter:blur(20px);border:1px solid var(--border2);border-radius:14px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 4px 24px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.05);}
  .nav-logo{font-family:var(--font);font-weight:700;font-size:15px;color:var(--ink);letter-spacing:-0.3px;display:flex;align-items:center;gap:8px;}
  .nav-logo-dot{width:7px;height:7px;background:var(--accent);border-radius:50%;box-shadow:0 0 10px var(--accent);}
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;font-family:var(--font);font-size:13px;font-weight:500;cursor:pointer;transition:all 0.18s cubic-bezier(0.22,1,0.36,1);border:none;border-radius:8px;outline:none;white-space:nowrap;letter-spacing:-0.01em;}
  .btn:disabled{opacity:0.35;cursor:not-allowed;}
  .btn-primary{background:var(--accent);color:#fff;padding:9px 18px;box-shadow:0 0 20px rgba(99,102,241,0.3);border:1px solid rgba(129,140,248,0.3);}
  .btn-primary:hover:not(:disabled){background:var(--accent2);transform:translateY(-1px);box-shadow:0 4px 24px rgba(99,102,241,0.45);}
  .btn-secondary{background:var(--surface2);color:var(--ink2);padding:9px 18px;border:1px solid var(--border2);}
  .btn-secondary:hover:not(:disabled){background:var(--surface3);border-color:var(--border3);color:var(--ink);transform:translateY(-1px);}
  .btn-ghost{background:transparent;color:var(--muted);padding:7px 11px;border-radius:7px;}
  .btn-ghost:hover:not(:disabled){background:var(--surface2);color:var(--ink2);}
  .btn-gold{background:var(--gold);color:#000;padding:9px 18px;font-weight:600;box-shadow:0 0 20px rgba(245,158,11,0.25);}
  .btn-gold:hover:not(:disabled){background:var(--gold2);transform:translateY(-1px);}
  .btn-lg{padding:12px 24px;font-size:14px;border-radius:10px;}
  .btn-sm{padding:6px 13px;font-size:12px;}
  .btn-icon{padding:7px;border-radius:7px;}
  .card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);transition:border-color 0.2s,background 0.2s;}
  .card:hover{border-color:var(--border2);}
  .card-p{padding:22px;}
  .card-p-lg{padding:28px;}
  .field{display:flex;flex-direction:column;gap:6px;}
  .label{font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.07em;}
  .input{border:1px solid var(--border2);border-radius:8px;padding:9px 13px;font-family:var(--font);font-size:14px;color:var(--ink);background:var(--surface2);outline:none;transition:all 0.15s;}
  .input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(99,102,241,0.12);background:var(--surface3);}
  .input::placeholder{color:var(--subtle);}
  textarea.input{resize:vertical;min-height:88px;line-height:1.6;}
  select.input{cursor:pointer;}
  select.input option{background:var(--surface2);color:var(--ink);}
  .badge{display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:500;font-family:var(--font-mono);}
  .badge-gold{background:var(--gold-light);color:var(--gold);border:1px solid var(--gold-border);}
  .badge-green{background:var(--emerald-light);color:var(--emerald);border:1px solid rgba(16,185,129,0.2);}
  .badge-red{background:var(--ember-light);color:var(--ember);border:1px solid rgba(239,68,68,0.2);}
  .badge-blue{background:var(--blue-light);color:var(--accent2);border:1px solid rgba(99,102,241,0.2);}
  .badge-neutral{background:var(--surface2);color:var(--ink2);border:1px solid var(--border2);}
  .progress-track{background:var(--surface2);border-radius:999px;overflow:hidden;}
  .progress-fill{height:100%;border-radius:999px;background:var(--accent);transition:width 0.6s cubic-bezier(0.22,1,0.36,1);box-shadow:0 0 8px rgba(99,102,241,0.5);}
  .progress-fill-gold{background:var(--gold);box-shadow:0 0 8px rgba(245,158,11,0.5);}
  .progress-fill-green{background:var(--emerald);box-shadow:0 0 8px rgba(16,185,129,0.5);}
  .container{max-width:860px;margin:0 auto;padding:0 24px;}
  .stack{display:flex;flex-direction:column;}
  .row{display:flex;align-items:center;}
  .gap-2{gap:2px}.gap-4{gap:4px}.gap-6{gap:6px}.gap-7{gap:7px}.gap-8{gap:8px}.gap-10{gap:10px}.gap-11{gap:11px}.gap-12{gap:12px}.gap-14{gap:14px}.gap-16{gap:16px}.gap-20{gap:20px}.gap-24{gap:24px}.gap-28{gap:28px}.gap-32{gap:32px}
  .divider{display:flex;align-items:center;gap:12px;color:var(--muted);font-size:13px;}
  .divider::before,.divider::after{content:"";flex:1;height:1px;background:var(--border);}
  .skeleton{background:linear-gradient(90deg,var(--surface2) 25%,var(--surface3) 50%,var(--surface2) 75%);background-size:200% 100%;animation:shimmer 1.5s infinite;border-radius:6px;}
  .stat-card{padding:20px 22px;}
  .stat-label{font-size:10px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;font-family:var(--font-mono);}
  .stat-value{font-size:32px;font-weight:800;color:var(--ink);letter-spacing:-0.04em;line-height:1;}
  .stat-sub{font-size:12px;color:var(--muted);margin-top:4px;font-family:var(--font-mono);}
  .lec-block{padding:14px 18px;border-radius:8px;border:1px solid var(--border);margin-bottom:10px;}
  .lec-block-green{background:rgba(16,185,129,0.05);border-color:rgba(16,185,129,0.15);}
  .lec-block-red{background:rgba(239,68,68,0.05);border-color:rgba(239,68,68,0.15);}
  .lec-block-blue{background:rgba(99,102,241,0.05);border-color:rgba(99,102,241,0.15);}
  .lec-block-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:7px;font-family:var(--font-mono);}
  .lec-block-label-green{color:var(--emerald);}
  .lec-block-label-red{color:var(--ember);}
  .lec-block-label-blue{color:var(--accent2);}
  .lec-block-label-gold{color:var(--gold);}
  .lec-text{font-size:14px;line-height:1.75;color:var(--ink2);}
  .answer-box{margin-top:14px;padding:14px 18px;background:var(--surface2);border:1px solid var(--border);border-left:2px solid var(--accent);border-radius:8px;font-size:14px;line-height:1.75;color:var(--ink2);white-space:pre-wrap;}
  .nav-link{font-size:13px;font-weight:400;color:var(--muted);background:none;border:none;cursor:pointer;padding:5px 10px;border-radius:7px;font-family:var(--font);transition:all 0.15s;}
  .nav-link:hover{color:var(--ink);background:var(--surface2);}
  .nav-link.active{color:var(--ink);font-weight:500;background:var(--surface2);border:1px solid var(--border2);}
  .mcq-option{display:block;width:100%;text-align:left;padding:11px 15px;border:1px solid var(--border);border-radius:8px;background:var(--surface2);font-family:var(--font);font-size:13px;color:var(--ink2);cursor:pointer;transition:all 0.12s;}
  .mcq-option:hover{border-color:var(--accent);color:var(--ink);background:var(--surface3);}
  .mcq-option.selected{border-color:var(--accent);background:rgba(99,102,241,0.08);color:var(--ink);font-weight:500;}
  .mcq-option.correct{border-color:var(--emerald);background:var(--emerald-light);color:var(--emerald);}
  .mcq-option.wrong{border-color:var(--ember);background:var(--ember-light);color:var(--ember);}
  .lec-list-item{display:flex;align-items:flex-start;gap:9px;padding:9px 10px;border-radius:7px;cursor:pointer;transition:all 0.12s;font-size:12px;color:var(--muted);border:1px solid transparent;text-align:left;background:none;width:100%;font-family:var(--font);}
  .lec-list-item:hover{background:var(--surface2);color:var(--ink2);}
  .lec-list-item.active{background:var(--surface2);border-color:var(--border2);color:var(--ink);font-weight:500;}
  .lec-num{width:20px;height:20px;border-radius:50%;background:var(--surface3);border:1px solid var(--border2);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;color:var(--muted);flex-shrink:0;font-family:var(--font-mono);}
  .lec-list-item.active .lec-num{background:var(--accent);border-color:var(--accent);color:#fff;}
  .btn-google{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:10px 18px;background:var(--surface2);border:1px solid var(--border2);border-radius:8px;font-family:var(--font);font-size:13px;font-weight:500;color:var(--ink2);cursor:pointer;transition:all 0.15s;}
  .btn-google:hover{background:var(--surface3);border-color:var(--border3);color:var(--ink);}
  .demo-banner{background:var(--surface);border-bottom:1px solid var(--border);padding:9px 24px;display:flex;align-items:center;justify-content:center;gap:14px;font-size:12px;color:var(--ink2);}
  .shape{position:absolute;border-radius:50%;filter:blur(80px);pointer-events:none;opacity:0.5;}
  .shape-1{width:350px;height:350px;background:rgba(99,102,241,0.25);top:-80px;right:-80px;animation:pulse-glow 6s ease-in-out infinite;}
  .shape-2{width:280px;height:280px;background:rgba(139,92,246,0.2);bottom:0;left:-60px;animation:pulse-glow 8s ease-in-out infinite 2s;}
  .shape-3{width:200px;height:200px;background:rgba(6,182,212,0.12);top:40%;right:10%;animation:pulse-glow 10s ease-in-out infinite 4s;}
  .float-card{position:absolute;border:1px solid var(--border2);border-radius:14px;background:var(--surface);pointer-events:none;animation:float3d 8s ease-in-out infinite;}
  .float-card-1{width:110px;height:80px;top:20%;right:8%;animation-delay:0s;opacity:0.4;}
  .float-card-2{width:80px;height:60px;top:55%;right:15%;animation-delay:-3s;opacity:0.3;}
  .float-card-3{width:90px;height:70px;top:35%;left:5%;animation-delay:-5s;opacity:0.25;}
  .tag{display:inline-flex;align-items:center;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:500;background:var(--surface2);border:1px solid var(--border2);color:var(--ink2);font-family:var(--font-mono);transition:all 0.15s;}
  .tag:hover{border-color:var(--accent);color:var(--accent2);background:rgba(99,102,241,0.08);}
  @media(max-width:768px){.nav{width:calc(100% - 32px);top:12px;margin:12px auto;}.container{padding:0 16px;}.card-p-lg{padding:20px;}.shape{display:none;}.float-card{display:none;}}
  @media(max-width:480px){.stat-value{font-size:26px;}}
`;

function buildFallback(form) {
  const career=form.career||"your chosen field"; const lc=career.toLowerCase();
  const careerThemes={entrepreneur:["Business Foundations","Market Research","Building Your Product","Marketing & Sales","Finance & Operations","Scaling & Growth"],coding:["Programming Basics","Data Structures","Web Development","Databases & APIs","Projects & Portfolio","Job Preparation"],chess:["Chess Basics","Tactics & Puzzles","Opening Principles","Middlegame Strategy","Endgame Mastery","Tournament Preparation"],art:["Drawing Fundamentals","Color Theory","Digital Art","Illustration","Style Development","Portfolio & Career"],music:["Music Theory Basics","Instrument Fundamentals","Scales & Chords","Composition","Production","Performance & Career"]};
  let themes=null; for(const [k,v] of Object.entries(careerThemes)){if(lc.includes(k)){themes=v;break;}}
  if(!themes)themes=[`${career} Fundamentals`,`Core ${career} Skills`,`${career} in Practice`,`Advanced ${career} Concepts`,`Real-world ${career} Projects`,`${career} Mastery & Career`];
  const wt={0:["Getting Started","Core Basics","Key Concepts","First Project"],1:["Deep Dive","Practical Skills","Real Examples","Week Review"],2:["Advanced Topics","Case Studies","Hands-on Practice","Assessment"],3:["Expert Techniques","Industry Insights","Build Something","Milestone Review"],4:["Refinement","Problem Solving","Creative Application","Progress Check"],5:["Mastery","Portfolio Work","Final Project","Graduation"]};
  return {title:`6-Month ${career} Roadmap`,months:themes.map((theme,mi)=>({month:mi+1,theme,focus:`Month ${mi+1}: ${theme}`,weeks:[1,2,3,4].map(wi=>({week:wi,goal:`${wt[mi]?.[wi-1]||"Weekly Goals"} — ${theme}`,days:[1,2,3,4,5,6,7].map(di=>({day:di,task:di===7?`Review ${theme}`:`${theme}: sub-topic ${di}`})),testTopic:theme}))}))};
}

const DEMO_THEMES=["Business Foundations","Market Research","Building Your Product","Marketing & Sales","Finance & Operations","Scaling & Growth"];
const DEMO_ROADMAP={title:"Entrepreneurship — Demo Roadmap",months:Array.from({length:6},(_,mi)=>({month:mi+1,theme:DEMO_THEMES[mi],focus:`Month ${mi+1}: ${DEMO_THEMES[mi]}`,weeks:Array.from({length:4},(_,wi)=>({week:wi+1,goal:`Week ${wi+1} — ${DEMO_THEMES[mi]}`,days:Array.from({length:7},(_,di)=>({day:di+1,task:di===6?`Review Week ${wi+1}`:`${DEMO_THEMES[mi]}: sub-topic ${di+1}`})),testTopic:DEMO_THEMES[mi]}))}))};
const DEMO_PROGRESS={currentMonth:1,currentWeek:1,currentDay:1,streak:3,completedDays:["m1w1d1","m1w1d2","m1w1d3"]};

function EmailSettingsModal({ onClose }) {
  const [svc,setSvc]=useState(localStorage.getItem("ejs_service")||"");
  const [tpl,setTpl]=useState(localStorage.getItem("ejs_template")||"");
  const [key,setKey]=useState(localStorage.getItem("ejs_key")||"");
  const [saved,setSaved]=useState(false);
  const save=()=>{localStorage.setItem("ejs_service",svc);localStorage.setItem("ejs_template",tpl);localStorage.setItem("ejs_key",key);EJS.serviceId=svc;EJS.templateId=tpl;EJS.publicKey=key;setSaved(true);setTimeout(()=>setSaved(false),2000);};
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:20,backdropFilter:"blur(8px)"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="card card-p-lg" style={{width:"100%",maxWidth:440}}>
        <div className="row gap-8" style={{justifyContent:"space-between",marginBottom:20}}>
          <div><h3 style={{fontSize:15,fontWeight:600,marginBottom:2}}>Email Reminders</h3><p style={{fontSize:12,color:"var(--muted)"}}>Get notified when you miss a day</p></div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><Icon.X/></button>
        </div>
        <div className="stack gap-12">
          <div className="field"><label className="label">Service ID</label><input className="input" placeholder="service_abc123" value={svc} onChange={e=>setSvc(e.target.value)}/></div>
          <div className="field"><label className="label">Template ID</label><input className="input" placeholder="template_xyz789" value={tpl} onChange={e=>setTpl(e.target.value)}/></div>
          <div className="field"><label className="label">Public Key</label><input className="input" placeholder="AbCdEfGhIj" value={key} onChange={e=>setKey(e.target.value)}/></div>
        </div>
        <div className="row gap-8" style={{marginTop:20}}>
          <button className="btn btn-primary" onClick={save} style={{flex:1}}>{saved?"✓ Saved":"Save"}</button>
          <button className="btn btn-secondary" onClick={onClose} style={{flex:1}}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function Nav({ user, onLogout, onNav, page, onOpenEmailSettings, emailConfigured, isDemo, onSignUp }) {
  return (
    <nav className="nav">
      <div className="row gap-8"><div className="nav-logo-dot"/><span className="nav-logo">Velorn</span></div>
      {user && (<div className="row gap-4">{["dashboard","learn","test"].map(p=>(<button key={p} onClick={()=>onNav(p)} className={`nav-link ${page===p?"active":""}`}>{p==="learn"?"Learn":p==="test"?"Test":"Dashboard"}</button>))}</div>)}
      {user && (<div className="row gap-6">
        {!isDemo && <button onClick={onOpenEmailSettings} className="btn btn-ghost btn-sm row gap-6"><Icon.Bell/></button>}
        {isDemo ? <button className="btn btn-primary btn-sm" onClick={onSignUp}>Sign Up Free</button> : <button className="btn btn-ghost btn-sm btn-icon" onClick={onLogout} title="Sign out"><Icon.LogOut/></button>}
      </div>)}
    </nav>
  );
}

function Landing({ onStart, onDemo }) {
  const [focused,setFocused]=useState(false);
  const [typed,setTyped]=useState("");
  const examples=["Chess","Web Development","Digital Art","Entrepreneurship","Music Production"];
  const [exIdx,setExIdx]=useState(0);
  useEffect(()=>{const t=setInterval(()=>setExIdx(i=>(i+1)%examples.length),2400);return()=>clearInterval(t);},[]);
  const features=[
    {icon:<Icon.Map/>,tag:"Roadmap",title:"Know what to study every day",desc:"A structured 6-month plan built around your specific goal."},
    {icon:<Icon.BookOpen/>,tag:"Lectures",title:"5 focused lessons daily",desc:"Each lecture is short, specific, and built for how you actually learn."},
    {icon:<Icon.Brain/>,tag:"AI Tutor",title:"Ask anything, get real answers",desc:"Professor Max explains like a knowledgeable friend, not a textbook."},
    {icon:<Icon.CheckSquare/>,tag:"Tests",title:"Prove what you know",desc:"25-question weekly assessments to show you exactly where you stand."},
    {icon:<Icon.BarChart/>,tag:"Progress",title:"See yourself improving",desc:"Visual streaks and milestones that actually mean something."},
    {icon:<Icon.Flame/>,tag:"Streaks",title:"Build a habit that sticks",desc:"Momentum, structure, and reminders that keep you coming back."},
  ];
  return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",background:"var(--bg)",overflow:"hidden",paddingTop:80}}>
      <div style={{width:"100%",maxWidth:900,padding:"60px 24px 80px",display:"flex",flexDirection:"column",alignItems:"center",textAlign:"center",position:"relative"}}>
        <div className="shape shape-1"/><div className="shape shape-2"/><div className="shape shape-3"/>
        <div className="float-card float-card-1"/><div className="float-card float-card-2"/><div className="float-card float-card-3"/>
        <div style={{display:"inline-flex",alignItems:"center",gap:8,padding:"5px 14px",borderRadius:999,background:"var(--surface)",border:"1px solid var(--border2)",fontSize:12,color:"var(--ink2)",marginBottom:32,position:"relative",zIndex:1,fontFamily:"var(--font-mono)"}}>
          <span style={{width:6,height:6,borderRadius:"50%",background:"var(--emerald)",display:"inline-block",boxShadow:"0 0 8px var(--emerald)"}}/>
          Free for students aged 13–18
        </div>
        <h1 style={{fontFamily:"var(--font-display)",fontSize:"clamp(40px,6vw,80px)",fontWeight:400,lineHeight:1.05,color:"var(--ink)",maxWidth:700,marginBottom:20,letterSpacing:"-0.025em",position:"relative",zIndex:1}}>
          Go from curious<br/>to <em style={{fontStyle:"italic",color:"var(--accent2)"}}>capable</em> in 6 months
        </h1>
        <p style={{fontSize:"clamp(14px,2vw,17px)",color:"var(--muted)",maxWidth:460,lineHeight:1.75,marginBottom:44,position:"relative",zIndex:1}}>
          Pick anything you want to learn. Velorn builds a complete roadmap — daily lessons, weekly tests, and an AI tutor around you.
        </p>
        <div style={{width:"100%",maxWidth:500,position:"relative",zIndex:1,marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",background:"var(--surface)",border:`1px solid ${focused?"var(--accent)":"var(--border2)"}`,borderRadius:12,boxShadow:focused?"0 0 0 3px rgba(99,102,241,0.12)":"0 4px 24px rgba(0,0,0,0.3)",transition:"all 0.2s",overflow:"hidden"}}>
            <input value={typed} onChange={e=>setTyped(e.target.value)} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} placeholder={`e.g. ${examples[exIdx]}`} style={{flex:1,padding:"13px 18px",border:"none",outline:"none",fontSize:14,fontFamily:"var(--font)",background:"transparent",color:"var(--ink)"}}/>
            <button className="btn btn-primary" style={{margin:5,borderRadius:8,padding:"9px 16px",flexShrink:0,fontSize:13}} onClick={onStart}>Build Roadmap →</button>
          </div>
          <p style={{fontSize:11,color:"var(--subtle)",marginTop:8,textAlign:"center",fontFamily:"var(--font-mono)"}}>No credit card · 30 seconds to set up</p>
        </div>
        <button className="btn btn-ghost btn-sm row gap-6" onClick={onDemo} style={{color:"var(--muted)",position:"relative",zIndex:1}}><Icon.Eye/> See how it works</button>
      </div>
      <div style={{width:"100%",maxWidth:820,padding:"0 24px 72px"}}>
        <div style={{borderTop:"1px solid var(--border)",paddingTop:56}}>
          <p style={{fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.12em",color:"var(--muted)",textAlign:"center",marginBottom:40,fontFamily:"var(--font-mono)"}}>How it works</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:28}}>
            {[{n:"01",title:"Tell us what to learn",desc:"Type any skill or goal — chess, coding, design, anything."},{n:"02",title:"Get your roadmap",desc:"AI generates 6 months of structured daily tasks tailored to you."},{n:"03",title:"Learn with Professor Max",desc:"5 lectures daily, weekly tests, 24/7 AI tutor available."}].map(s=>(
              <div key={s.n} style={{display:"flex",flexDirection:"column",gap:10}}>
                <span style={{fontFamily:"var(--font-mono)",fontSize:28,fontWeight:700,color:"var(--surface3)",letterSpacing:"-0.04em"}}>{s.n}</span>
                <h3 style={{fontSize:14,fontWeight:600,color:"var(--ink)",lineHeight:1.4}}>{s.title}</h3>
                <p style={{fontSize:13,color:"var(--muted)",lineHeight:1.65}}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{width:"100%",maxWidth:820,padding:"0 24px 80px"}}>
        <p style={{fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.12em",color:"var(--muted)",textAlign:"center",marginBottom:32,fontFamily:"var(--font-mono)"}}>Everything you need</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:1,background:"var(--border)",border:"1px solid var(--border)",borderRadius:12,overflow:"hidden"}}>
          {features.map(f=>(
            <div key={f.title} style={{padding:"24px",background:"var(--surface)",transition:"background 0.15s",cursor:"default"}} onMouseEnter={e=>e.currentTarget.style.background="var(--surface2)"} onMouseLeave={e=>e.currentTarget.style.background="var(--surface)"}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
                <div style={{width:32,height:32,borderRadius:8,background:"var(--surface2)",border:"1px solid var(--border2)",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--accent2)"}}>{f.icon}</div>
                <span className="tag">{f.tag}</span>
              </div>
              <h4 style={{fontSize:13,fontWeight:600,color:"var(--ink)",marginBottom:5,lineHeight:1.4}}>{f.title}</h4>
              <p style={{fontSize:12,color:"var(--muted)",lineHeight:1.6}}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
      <div style={{width:"100%",background:"var(--surface)",borderTop:"1px solid var(--border)",borderBottom:"1px solid var(--border)",padding:"48px 24px"}}>
        <div style={{maxWidth:820,margin:"0 auto"}}>
          <p style={{fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.12em",color:"var(--muted)",textAlign:"center",marginBottom:28,fontFamily:"var(--font-mono)"}}>Student stories</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:12}}>
            {[{q:"Velorn is the only app where I actually knew what to do next every single day.",name:"Riya, 16",tag:"Web Dev"},{q:"Professor Max explained recursion better in 2 minutes than my teacher did in 2 weeks.",name:"Arjun, 17",tag:"Programming"},{q:"I went from zero chess to beating my dad in 3 months. The roadmap actually works.",name:"Sana, 15",tag:"Chess"}].map(t=>(
              <div key={t.name} style={{padding:"18px 20px",background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:10}}>
                <p style={{fontSize:13,color:"var(--ink2)",lineHeight:1.7,marginBottom:12}}>"{t.q}"</p>
                <div style={{display:"flex",alignItems:"center",gap:8}}><p style={{fontSize:12,fontWeight:600,color:"var(--ink)"}}>{t.name}</p><span className="tag">{t.tag}</span></div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{padding:"72px 24px",textAlign:"center"}}>
        <h2 style={{fontFamily:"var(--font-display)",fontSize:"clamp(28px,4vw,48px)",fontWeight:400,fontStyle:"italic",marginBottom:14,letterSpacing:"-0.02em",color:"var(--ink)"}}>Ready to start?</h2>
        <p style={{fontSize:14,color:"var(--muted)",marginBottom:28,fontFamily:"var(--font-mono)"}}>Build real skills. One day at a time.</p>
        <button className="btn btn-primary btn-lg row gap-8" style={{margin:"0 auto"}} onClick={onStart}>Build My Roadmap <Icon.ArrowRight/></button>
      </div>
    </div>
  );
}

function Auth({ onAuth }) {
  const [mode,setMode]=useState("signup");
  const [form,setForm]=useState({name:"",age:"",grade:"",email:"",password:""});
  const [err,setErr]=useState("");const [loading,setLoading]=useState(false);
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const handleGoogle=async()=>{setLoading(true);setErr("");const redirectTo=window.location.hostname==="localhost"?"http://localhost:5173":"https://velorn.vercel.app";const{error}=await supabase.auth.signInWithOAuth({provider:"google",options:{redirectTo}});if(error){setErr(error.message);setLoading(false);}};
  const handleSubmit=async()=>{
    setErr("");setLoading(true);
    if(mode==="signup"){
      if(!form.name||!form.age||!form.grade||!form.email||!form.password){setErr("All fields required.");setLoading(false);return;}
      const{data,error}=await supabase.auth.signUp({email:form.email,password:form.password,options:{data:{full_name:form.name}}});
      if(error){setErr(error.message);setLoading(false);return;}
      if(data.user){await upsertProfile(data.user.id,{full_name:form.name,age:parseInt(form.age),grade:form.grade});onAuth(data.user,{full_name:form.name,age:form.age,grade:form.grade},false);}
    }else{
      const{data,error}=await supabase.auth.signInWithPassword({email:form.email,password:form.password});
      if(error){setErr("Invalid email or password.");setLoading(false);return;}
      const profile=await getProfile(data.user.id);onAuth(data.user,profile,true);
    }
    setLoading(false);
  };
  return (
    <div className="page container" style={{paddingTop:60,paddingBottom:60,marginTop:80}}>
      <div className="card card-p-lg" style={{maxWidth:400,margin:"0 auto"}}>
        <div style={{marginBottom:22}}>
          <h2 style={{fontSize:20,fontWeight:700,marginBottom:3}}>{mode==="signup"?"Create account":"Welcome back"}</h2>
          <p style={{fontSize:13,color:"var(--muted)"}}>{mode==="signup"?"Start your learning journey":"Continue your roadmap"}</p>
        </div>
        <button className="btn-google" onClick={handleGoogle} disabled={loading}>
          <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
          Continue with Google
        </button>
        <div className="divider" style={{margin:"14px 0"}}>or</div>
        {err&&<div style={{marginBottom:12,padding:"8px 12px",background:"var(--ember-light)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:7,fontSize:12,color:"var(--ember)",display:"flex",gap:6,alignItems:"center"}}><Icon.AlertCircle/>{err}</div>}
        <div className="stack gap-11">
          {mode==="signup"&&<><div className="field"><label className="label">Full Name</label><input className="input" placeholder="Your name" value={form.name} onChange={e=>set("name",e.target.value)}/></div><div className="row gap-10"><div className="field" style={{flex:1}}><label className="label">Age</label><input className="input" type="number" min="13" max="18" placeholder="15" value={form.age} onChange={e=>set("age",e.target.value)}/></div><div className="field" style={{flex:1}}><label className="label">Grade</label><input className="input" placeholder="Grade 10" value={form.grade} onChange={e=>set("grade",e.target.value)}/></div></div></>}
          <div className="field"><label className="label">Email</label><input className="input" type="email" placeholder="you@email.com" value={form.email} onChange={e=>set("email",e.target.value)}/></div>
          <div className="field"><label className="label">Password</label><input className="input" type="password" placeholder="••••••••" value={form.password} onChange={e=>set("password",e.target.value)}/></div>
          <button className="btn btn-primary" style={{width:"100%",justifyContent:"center",marginTop:4}} onClick={handleSubmit} disabled={loading}>{loading?<span className="row gap-8"><Icon.Loader/> Please wait</span>:mode==="signup"?"Create Account":"Sign In"}</button>
          <p style={{textAlign:"center",fontSize:12,color:"var(--muted)"}}>{mode==="signup"?"Already have an account? ":"New here? "}<span style={{color:"var(--accent2)",cursor:"pointer",fontWeight:500}} onClick={()=>{setMode(m=>m==="signup"?"login":"signup");setErr("");}}>{mode==="signup"?"Sign in":"Create account"}</span></p>
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
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:40,background:"var(--bg)"}}>
      <div style={{width:400,textAlign:"center"}}>
        <div style={{width:44,height:44,border:"1px solid var(--border2)",borderTop:"1px solid var(--accent)",borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 28px",boxShadow:"0 0 20px rgba(99,102,241,0.2)"}}/>
        <h2 style={{fontSize:18,fontWeight:600,marginBottom:6}}>Building Your Roadmap</h2>
        <p style={{fontSize:13,color:"var(--muted)",marginBottom:28,minHeight:20,fontFamily:"var(--font-mono)"}}>{LOADING_STEPS[step]}</p>
        <div style={{background:"var(--surface2)",borderRadius:999,height:3,marginBottom:10,overflow:"hidden"}}><div style={{height:"100%",borderRadius:999,background:"var(--accent)",width:`${pct}%`,transition:"width 0.3s",boxShadow:"0 0 8px rgba(99,102,241,0.5)"}}/></div>
        <p style={{fontSize:11,color:"var(--subtle)",fontFamily:"var(--font-mono)"}}>{pct}%</p>
      </div>
    </div>
  );
}

function Onboarding({ user, profile, onDone }) {
  const [form,setForm]=useState({career:"",level:"Beginner",time:"1 hour",goal:"Strong foundation"});
  const [loading,setLoading]=useState(false);
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const generate=async()=>{
    if(!form.career.trim()){alert("Please enter what you want to learn.");return;}
    setLoading(true);
    const name=profile?.full_name||user?.user_metadata?.full_name||user?.email||"Student";
    const age=profile?.age||"15";const grade=profile?.grade||"High School";
    const prompt=`Create a 6-month learning roadmap. Student: Name ${name}, Age ${age}, Grade ${grade}, Topic "${form.career}", Level ${form.level}, Time ${form.time}, Goal ${form.goal}.\nReturn ONLY valid JSON no markdown:\n{"title":"6-Month ${form.career} Roadmap","months":[{"month":1,"theme":"Theme","focus":"Focus","weeks":[{"week":1,"goal":"Goal","days":[{"day":1,"task":"Task"},{"day":2,"task":"Task"},{"day":3,"task":"Task"},{"day":4,"task":"Task"},{"day":5,"task":"Task"},{"day":6,"task":"Project"},{"day":7,"task":"Review"}],"testTopic":"Topic"}]}]}\nGenerate ALL 6 months ALL 4 weeks. Every task specific to "${form.career}".`;
    try {
      const raw=await askClaude([{role:"user",content:prompt}]);
      const jsonMatch=raw.match(/\{[\s\S]*\}/);if(!jsonMatch)throw new Error("No JSON");
      const roadmap=JSON.parse(jsonMatch[0]);
      await upsertRoadmap(user.id,roadmap,{career:form.career,level:form.level,daily_time:form.time,goal:form.goal});
      const ip={current_month:1,current_week:1,current_day:1,streak:0,completed_days:[],last_visit:new Date().toISOString().slice(0,10)};
      await upsertProgress(user.id,ip);onDone(roadmap,dbToProgress(ip));
    } catch(e) {
      const fallback=buildFallback(form);
      await upsertRoadmap(user.id,fallback,{career:form.career,level:form.level,daily_time:form.time,goal:form.goal});
      const ip={current_month:1,current_week:1,current_day:1,streak:0,completed_days:[],last_visit:new Date().toISOString().slice(0,10)};
      await upsertProgress(user.id,ip);onDone(fallback,dbToProgress(ip));
    }
    setLoading(false);
  };
  if(loading)return <RoadmapLoader/>;
  const name=profile?.full_name||user?.user_metadata?.full_name||"there";
  return (
    <div className="page container" style={{paddingTop:60,paddingBottom:60,marginTop:80}}>
      <div className="card card-p-lg" style={{maxWidth:500,margin:"0 auto"}}>
        <div style={{marginBottom:24}}>
          <p style={{fontSize:12,color:"var(--muted)",marginBottom:3,fontFamily:"var(--font-mono)"}}>Welcome, {name}</p>
          <h2 style={{fontSize:20,fontWeight:700,marginBottom:5}}>Set up your learning path</h2>
          <p style={{fontSize:13,color:"var(--muted)"}}>Tell us what to learn — we'll build your personalized 6-month roadmap.</p>
        </div>
        <div className="stack gap-14">
          <div className="field"><label className="label">What do you want to learn?</label><input className="input" placeholder="e.g. Chess, Web Development, Digital Art, Entrepreneurship" value={form.career} onChange={e=>set("career",e.target.value)}/></div>
          <div className="row gap-10">
            <div className="field" style={{flex:1}}><label className="label">Level</label><select className="input" value={form.level} onChange={e=>set("level",e.target.value)}><option>Beginner</option><option>Intermediate</option></select></div>
            <div className="field" style={{flex:1}}><label className="label">Daily Time</label><select className="input" value={form.time} onChange={e=>set("time",e.target.value)}><option>1 hour</option><option>2 hours</option><option>3+ hours</option></select></div>
          </div>
          <div className="field"><label className="label">Goal</label><select className="input" value={form.goal} onChange={e=>set("goal",e.target.value)}><option>Strong foundation</option><option>Job ready</option><option>Build projects</option></select></div>
          <button className="btn btn-primary row gap-8" style={{justifyContent:"center",padding:"11px 20px"}} onClick={generate}>Generate My Roadmap <Icon.ArrowRight/></button>
        </div>
      </div>
    </div>
  );
}

function Dashboard({ user, roadmap, progress, onUpdateProgress, onNav, isDemo }) {
  const{currentMonth=1,currentWeek=1,currentDay=1,streak=0,completedDays=[]}=progress;
  const totalDays=180;const pct=Math.min(100,Math.round((completedDays.length/totalDays)*100));
  const month=roadmap.months[currentMonth-1];const week=month?.weeks[currentWeek-1];
  const todayTask=week?.days[currentDay-1]?.task??"All caught up.";
  const markDone=async()=>{
    if(isDemo){alert("Sign up to track your progress.");return;}
    const key=`m${currentMonth}w${currentWeek}d${currentDay}`;if(completedDays.includes(key))return;
    const newCompleted=[...completedDays,key];let nd=currentDay+1,nw=currentWeek,nm=currentMonth;
    if(nd>7){nd=1;nw++;}if(nw>4){nw=1;nm++;}if(nm>6)nm=6;
    const next={...progress,completedDays:newCompleted,streak:streak+1,currentDay:nd,currentWeek:nw,currentMonth:nm};
    await upsertProgress(user.id,progressToDb(next));onUpdateProgress(next);
  };
  return (
    <div className="page container" style={{paddingTop:32,paddingBottom:64,marginTop:80}}>
      <div style={{marginBottom:28}}>
        <p style={{fontSize:11,color:"var(--muted)",marginBottom:3,fontFamily:"var(--font-mono)",textTransform:"uppercase",letterSpacing:"0.08em"}}>{roadmap.title}</p>
        <h2 style={{fontSize:24,fontWeight:700}}>Dashboard</h2>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginBottom:20}}>
        {[{label:"Month",value:`${currentMonth}`,sub:"of 6"},{label:"Week",value:`${currentWeek}`,sub:"of 4"},{label:"Streak",value:`${streak}`,sub:"days"},{label:"Complete",value:`${pct}%`,sub:`${completedDays.length}/${totalDays} days`}].map(s=>(
          <div key={s.label} className="card stat-card" style={{position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",top:0,left:0,right:0,height:"2px",background:"linear-gradient(90deg, var(--accent), transparent)"}}/>
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
        <div className="progress-track" style={{height:4}}><div className="progress-fill progress-fill-gold" style={{width:`${pct}%`}}/></div>
      </div>
      <div className="card card-p" style={{marginBottom:12,borderLeft:"2px solid var(--accent)"}}>
        <div className="row gap-8" style={{marginBottom:10}}><span className="badge badge-neutral">Day {currentDay} · Today</span></div>
        <p style={{fontSize:14,lineHeight:1.65,color:"var(--ink2)",marginBottom:18}}>{todayTask}</p>
        <div className="row gap-8">
          <button className="btn btn-primary row gap-6" onClick={()=>onNav("learn")}>Start Learning <Icon.ArrowRight/></button>
          <button className="btn btn-secondary" onClick={markDone}>Mark Done</button>
        </div>
      </div>
      {week&&(
        <div className="card card-p">
          <p style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.1em",color:"var(--muted)",marginBottom:7,fontFamily:"var(--font-mono)"}}>Week {currentWeek} Goal</p>
          <p style={{fontSize:14,color:"var(--ink2)",lineHeight:1.65,marginBottom:14}}>{week.goal}</p>
          <div className="row gap-8"><span className="tag">{week.testTopic}</span><button className="btn btn-secondary btn-sm" onClick={()=>onNav("test")}>Take Test</button></div>
        </div>
      )}
    </div>
  );
}

const PROFESSOR_SYSTEM=`You are Professor Max — a clear, direct, knowledgeable mentor for teenagers. Write concisely. Use short paragraphs. Speak directly to "you". Never write like a textbook.`;

function Learn({ progress, roadmap, onUpdateProgress, user, isDemo, onSignUp }) {
  const{currentMonth=1,currentWeek=1,currentDay=1}=progress;
  const month=roadmap.months[currentMonth-1];const week=month?.weeks[currentWeek-1];const weekTopic=week?.goal??"Core Concepts";
  const[lectures,setLectures]=useState(null);const[active,setActive]=useState(0);const[loading,setLoading]=useState(false);
  const[doubt,setDoubt]=useState("");const[answer,setAnswer]=useState("");const[loadingDoubt,setLoadingDoubt]=useState(false);
  const[dayDone,setDayDone]=useState(false);const[showTask,setShowTask]=useState(false);const[taskSteps,setTaskSteps]=useState({});
  const[taskSubmitted,setTaskSubmitted]=useState(false);const[taskFeedback,setTaskFeedback]=useState("");const[loadingFeedback,setLoadingFeedback]=useState(false);
  const[taskDoubt,setTaskDoubt]=useState("");const[taskDoubtAnswer,setTaskDoubtAnswer]=useState("");const[loadingTaskDoubt,setLoadingTaskDoubt]=useState(false);

  useEffect(()=>{setLectures(null);setActive(0);setAnswer("");setDayDone(false);setShowTask(false);setTaskSteps({});setTaskSubmitted(false);setTaskFeedback("");loadLectures();},[currentMonth,currentWeek,currentDay]);

  const loadLectures=async()=>{
    setLoading(true);
    const cacheKey=`m${currentMonth}w${currentWeek}d${currentDay}`;
    if(!isDemo&&user?.id){const cached=await getCachedLectures(user.id,cacheKey);if(cached&&cached.length>=3){setLectures(cached);setLoading(false);return;}}
    const prompt=`You are a world-class mentor teaching a 14-year-old beginner.\nWeek topic: "${weekTopic}"\nSubject: "${roadmap.title}"\nToday is Day ${currentDay} of 7 this week.\nEach day covers different sub-topics. Day 1 = basics, Day 2 = deeper, Day 3 = application, Day 4 = advanced, Day 5 = mastery.\nFor Day ${currentDay}, cover sub-topics ${(currentDay-1)*5+1} to ${currentDay*5} of "${weekTopic}". Do NOT repeat previous days.\nGenerate EXACTLY 5 lectures. Return ONLY valid JSON. No markdown, no backticks.\n{"lectures":[{"num":1,"title":"Clear concise title","coreIdea":"2-3 sentences explaining the concept simply","example":"Real-world example specific to ${roadmap.title}","action":"One concrete task the student can do today","mistake":"One common beginner mistake","takeaway":"One memorable sentence"},{"num":2,"title":"...","coreIdea":"...","example":"...","action":"...","mistake":"...","takeaway":"..."},{"num":3,"title":"...","coreIdea":"...","example":"...","action":"...","mistake":"...","takeaway":"..."},{"num":4,"title":"...","coreIdea":"...","example":"...","action":"...","mistake":"...","takeaway":"..."},{"num":5,"title":"...","coreIdea":"...","example":"...","action":"...","mistake":"...","takeaway":"...","homework":["Task 1","Task 2"]}]}`;
    let raw="";
    try{raw=await askClaude([{role:"user",content:prompt}]);}catch(e){raw="";}
    if(raw?.trim()){
      try{let c=raw.trim().replace(/```json|```/gi,"").replace(/,(\s*[}\]])/g,"$1");const m=c.match(/\{[\s\S]*\}/);
        if(m){const p=JSON.parse(m[0]);const a=p.lectures&&Array.isArray(p.lectures)?p.lectures:[];if(a.length>=3){setLectures(a);if(!isDemo&&user?.id)await saveCachedLectures(user.id,cacheKey,a);setLoading(false);return;}}
      }catch(e){console.warn("Parse failed:",e.message);}
    }
    setLectures(Array.from({length:5},(_,i)=>({num:i+1,title:`${weekTopic} — Part ${i+1}`,coreIdea:`This section covers a key aspect of ${weekTopic} within ${roadmap.title}.`,example:`In ${roadmap.title}, this concept appears when working on real projects.`,action:`Spend 10 minutes applying this to something concrete today.`,mistake:`Beginners often skip this step — don't.`,takeaway:`Mastering this gives you a real edge in ${roadmap.title}.`,homework:i===4?[`Find an example of ${weekTopic} in the real world`,`Apply today's concepts to a small exercise`]:null})));
    setLoading(false);
  };

  const submitDoubt=async()=>{if(!doubt.trim()||loadingDoubt)return;setLoadingDoubt(true);setAnswer("");try{const res=await askClaude([{role:"user",content:`${PROFESSOR_SYSTEM}\n\nStudent is learning "${roadmap.title}", this week: "${weekTopic}". Question: "${doubt}"\n\nAnswer clearly and specifically. Under 150 words.`}]);setAnswer(res||"No response. Try again.");}catch{setAnswer("Something went wrong.");}setLoadingDoubt(false);};
  const markDone=()=>{setDayDone(true);if(onUpdateProgress)onUpdateProgress({type:"complete_day"});};
  const getWeeklyTask=()=>{
    const lc=roadmap.title.toLowerCase();
    if(lc.includes("entrepreneur"))return{title:"Build Your Business Concept",description:"Apply today's lectures by designing a mini business concept.",steps:[{id:"problem",label:"The Problem",prompt:"Describe a real problem you've noticed.",placeholder:"e.g. Students have no affordable printing after 8pm..."},{id:"solution",label:"Your Solution",prompt:"What product or service solves this?",placeholder:"e.g. A 24/7 self-service print kiosk..."},{id:"customer",label:"Target Customer",prompt:"Describe your ideal customer.",placeholder:"e.g. Students aged 14-22..."},{id:"money",label:"Revenue Model",prompt:"How does the business make money?",placeholder:"e.g. ₹5 per page..."},{id:"edge",label:"Competitive Advantage",prompt:"What makes you better than alternatives?",placeholder:"e.g. No competitor offers 24/7..."}]};
    if(lc.includes("art"))return{title:"Design a Concept Artwork",description:"Apply today's principles to a complete artwork concept.",steps:[{id:"concept",label:"Concept",prompt:"What is your artwork about?",placeholder:"e.g. The loneliness of a city at night..."},{id:"composition",label:"Composition",prompt:"How will you arrange elements?",placeholder:"e.g. A lone figure at bottom-left..."},{id:"color",label:"Color Palette",prompt:"What colors and why?",placeholder:"e.g. Deep blues, single warm streetlamp..."},{id:"light",label:"Light & Shadow",prompt:"Where is your light source?",placeholder:"e.g. Single overhead streetlamp..."},{id:"style",label:"Style",prompt:"What medium or visual style?",placeholder:"e.g. Digital painting..."}]};
    if(lc.includes("cod")||lc.includes("program"))return{title:"Design a Mini Project",description:"Plan a small but complete software project.",steps:[{id:"idea",label:"Project Idea",prompt:"What will you build?",placeholder:"e.g. A habit tracker..."},{id:"features",label:"Core Features",prompt:"List 3-5 essential features.",placeholder:"e.g. Track habits, streak counter..."},{id:"tech",label:"Tech Stack",prompt:"What technologies?",placeholder:"e.g. React, Supabase..."},{id:"data",label:"Data Model",prompt:"What data does your app store?",placeholder:"e.g. User, Habit, Entry..."},{id:"challenge",label:"Biggest Challenge",prompt:"What will be hardest?",placeholder:"e.g. Push notifications..."}]};
    return{title:`Apply ${roadmap.title} Knowledge`,description:"Reflect on and apply what you learned today.",steps:[{id:"learning",label:"Key Learnings",prompt:"What are the 3 most important things from today?",placeholder:"Write here..."},{id:"apply",label:"Real-World Application",prompt:`Where would you use ${weekTopic}?`,placeholder:"Write here..."},{id:"project",label:"Project Idea",prompt:`Design a small project practicing ${weekTopic}.`,placeholder:"Write here..."},{id:"challenge",label:"Biggest Challenge",prompt:"What was hardest to understand?",placeholder:"Write here..."},{id:"next",label:"Next Steps",prompt:"What will you explore next?",placeholder:"Write here..."}]};
  };
  const submitTask=async()=>{
    if(isDemo){alert("Sign up to submit tasks and get AI feedback.");return;}
    const task=getWeeklyTask();if(!task.steps.every(s=>taskSteps[s.id]?.trim().length>10))return;
    setLoadingFeedback(true);const submission=task.steps.map(s=>`${s.label}: ${taskSteps[s.id]}`).join("\n\n");
    let fb="Good work completing the task. Your submission shows clear thinking.";
    try{const res=await askClaude([{role:"user",content:`Student learning "${roadmap.title}" submitted work on "${weekTopic}":\n\n${submission}\n\nGive honest, specific feedback: strengths, what to improve, 2-3 concrete suggestions. Around 200 words.`}]);if(res&&res.trim().length>20)fb=res;}catch{}
    setTaskFeedback(fb);setTaskSubmitted(true);setLoadingFeedback(false);
    try{await saveTaskSubmission(user.id,{weekKey:`m${currentMonth}w${currentWeek}d${currentDay}`,career:roadmap.title,taskTitle:getWeeklyTask().title,answers:taskSteps,feedback:fb});}catch{}
  };
  const submitTaskDoubt=async()=>{
    if(!taskDoubt.trim())return;setLoadingTaskDoubt(true);setTaskDoubtAnswer("");
    try{const task=getWeeklyTask();const ctx=task.steps.map(s=>taskSteps[s.id]?`${s.label}: ${taskSteps[s.id]}`:"").filter(Boolean).join("\n");const res=await askClaude([{role:"user",content:`Student working on "${roadmap.title}" task (${weekTopic}).\nWork so far:\n${ctx}\nStuck on: "${taskDoubt}"\nGive a direct, concrete hint. Don't give away the full answer.`}]);setTaskDoubtAnswer(res||"Think from first principles — what outcome are you trying to achieve?");}catch{setTaskDoubtAnswer("Break it into smaller parts and tackle each one.");}
    setLoadingTaskDoubt(false);setTaskDoubt("");
  };
  const getTakeaway=(lec)=>lec.keyTakeaway||lec.takeaway||"";

  if(loading)return(<div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"60vh",flexDirection:"column",gap:14,marginTop:80}}><div style={{width:36,height:36,border:"1px solid var(--border2)",borderTop:"1px solid var(--accent)",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/><p style={{fontSize:13,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>Loading Day {currentDay} lectures…</p></div>);

  return (
    <div className="page container" style={{paddingTop:24,paddingBottom:64,marginTop:80}}>
      <div className="card card-p" style={{marginBottom:20,borderLeft:"2px solid var(--accent)"}}>
        <div className="row gap-6" style={{flexWrap:"wrap",marginBottom:6}}>
          <span className="badge badge-neutral">M{currentMonth} · W{currentWeek} · D{currentDay}</span>
          <span className="badge badge-gold">Professor Max</span>
        </div>
        <h2 style={{fontSize:16,fontWeight:600,marginBottom:2}}>{weekTopic}</h2>
        <p style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>5 lectures · read at your own pace</p>
      </div>
      {lectures && (
        <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
          <div style={{width:220,flexShrink:0}}>
            <div className="card card-p" style={{padding:10}}>
              <p style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.1em",color:"var(--muted)",marginBottom:8,fontFamily:"var(--font-mono)"}}>Lectures</p>
              <div className="stack gap-1">{lectures.map((l,i)=>(<button key={i} className={`lec-list-item ${i===active?"active":""}`} onClick={()=>setActive(i)}><span className="lec-num">{i+1}</span><span style={{lineHeight:1.4}}>{l.title}</span></button>))}</div>
            </div>
          </div>
          <div style={{flex:1,minWidth:280}}>
            <div className="card card-p-lg" style={{marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20,paddingBottom:16,borderBottom:"1px solid var(--border)"}}>
                <div style={{width:32,height:32,borderRadius:7,background:"var(--accent)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:13,color:"#fff",flexShrink:0,fontFamily:"var(--font-mono)"}}>{active+1}</div>
                <h2 style={{fontSize:16,fontWeight:600,lineHeight:1.3}}>{lectures[active].title}</h2>
              </div>
              <div style={{marginBottom:18}}>
                {lectures[active].coreIdea&&(<div className="lec-block"><div className="lec-block-label lec-block-label-blue">Core Concept</div><p className="lec-text">{lectures[active].coreIdea}</p></div>)}
                {lectures[active].example&&(<div className="lec-block lec-block-blue"><div className="lec-block-label lec-block-label-blue">Real-World Example</div><p className="lec-text">{lectures[active].example}</p></div>)}
                {lectures[active].action&&(<div className="lec-block lec-block-green"><div className="lec-block-label lec-block-label-green">Action Item</div><p className="lec-text">{lectures[active].action}</p></div>)}
                {lectures[active].mistake&&(<div className="lec-block lec-block-red"><div className="lec-block-label lec-block-label-red">Common Mistake</div><p className="lec-text">{lectures[active].mistake}</p></div>)}
              </div>
              {getTakeaway(lectures[active])&&(<div style={{background:"rgba(245,158,11,0.06)",border:"1px solid var(--gold-border)",borderRadius:8,padding:"12px 16px",marginBottom:18}}><p style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.1em",color:"var(--gold)",marginBottom:5,fontFamily:"var(--font-mono)"}}>Key Takeaway</p><p style={{fontSize:14,fontWeight:500,color:"var(--ink)",lineHeight:1.55}}>{getTakeaway(lectures[active])}</p></div>)}
              {lectures[active].homework&&(<div style={{background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:8,padding:"14px 16px",marginBottom:18}}><p style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.1em",color:"var(--muted)",marginBottom:10,fontFamily:"var(--font-mono)"}}>Homework</p>{lectures[active].homework.map((t,i)=>(<div key={i} style={{display:"flex",gap:8,alignItems:"flex-start",marginBottom:i<lectures[active].homework.length-1?8:0}}><div style={{width:18,height:18,borderRadius:4,background:"var(--accent)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:"#fff",flexShrink:0,fontFamily:"var(--font-mono)"}}>{i+1}</div><p style={{fontSize:13,lineHeight:1.6,color:"var(--ink2)"}}>{t}</p></div>))}</div>)}
              <div style={{display:"flex",gap:8,justifyContent:"space-between"}}>
                <button className="btn btn-secondary row gap-6" onClick={()=>setActive(a=>Math.max(0,a-1))} disabled={active===0}><Icon.ChevronLeft/> Prev</button>
                {active<lectures.length-1?<button className="btn btn-primary row gap-6" onClick={()=>setActive(a=>a+1)}>Next <Icon.ChevronRight/></button>:<button className="btn btn-gold row gap-6" onClick={()=>{markDone();setShowTask(true);window.scrollTo({top:document.body.scrollHeight,behavior:"smooth"});}} disabled={dayDone}>{dayDone?"Done ✓":"Complete & Task"}</button>}
              </div>
            </div>
            <div style={{marginBottom:20}}>
              <div className="row gap-8" style={{justifyContent:"space-between",marginBottom:5,fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}><span>Progress</span><span>{active+1}/{lectures.length}</span></div>
              <div className="progress-track" style={{height:3}}><div className="progress-fill" style={{width:`${((active+1)/lectures.length)*100}%`}}/></div>
            </div>
            <div className="card card-p">
              <div className="row gap-7" style={{marginBottom:3}}><Icon.MessageCircle/><h3 style={{fontSize:14,fontWeight:600}}>Ask Professor Max</h3></div>
              <p style={{fontSize:12,color:"var(--muted)",marginBottom:12}}>Ask anything about today's topic.</p>
              <textarea className="input" placeholder={`e.g. I don't understand ${weekTopic}...`} value={doubt} onChange={e=>setDoubt(e.target.value)} style={{width:"100%",marginBottom:8}}/>
              <button className="btn btn-primary btn-sm row gap-6" onClick={submitDoubt} disabled={loadingDoubt||!doubt.trim()}>{loadingDoubt?<><Icon.Loader/>Thinking…</>:<><Icon.Send/>Ask</>}</button>
              {answer&&(<div className="answer-box"><p style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em",color:"var(--accent2)",marginBottom:6,fontFamily:"var(--font-mono)"}}>Professor Max</p>{answer}</div>)}
            </div>
          </div>
        </div>
      )}
      {showTask&&lectures&&(()=>{
        const task=getWeeklyTask();const allDone=task.steps.every(s=>taskSteps[s.id]?.trim().length>10);
        const colors=["var(--accent)","#8b5cf6","var(--emerald)","var(--gold)","var(--ember)"];
        return (
          <div style={{marginTop:28}}>
            <div className="card card-p" style={{marginBottom:16,borderLeft:"2px solid var(--gold)"}}>
              <div className="row gap-7" style={{marginBottom:7}}><span className="badge badge-gold">Daily Task</span><span className="badge badge-neutral">Apply today's lectures</span></div>
              <h2 style={{fontSize:16,fontWeight:600,marginBottom:3}}>{task.title}</h2>
              <p style={{fontSize:13,color:"var(--muted)",lineHeight:1.55}}>{task.description}</p>
            </div>
            {!taskSubmitted?(
              <div className="stack gap-12">
                {task.steps.map((step,si)=>(
                  <div key={step.id} className="card card-p" style={{borderLeft:`2px solid ${colors[si]}`}}>
                    <div className="row gap-8" style={{marginBottom:8}}><div style={{width:24,height:24,borderRadius:6,background:colors[si],color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:11,flexShrink:0,fontFamily:"var(--font-mono)"}}>{si+1}</div><h3 style={{fontSize:13,fontWeight:600}}>{step.label}</h3></div>
                    <p style={{fontSize:12,color:"var(--muted)",marginBottom:10,lineHeight:1.6}}>{step.prompt}</p>
                    <textarea className="input" value={taskSteps[step.id]||""} onChange={e=>setTaskSteps(p=>({...p,[step.id]:e.target.value}))} placeholder={step.placeholder} style={{width:"100%"}}/>
                    {taskSteps[step.id]?.trim().length>10&&(<div className="row gap-4" style={{marginTop:5}}><Icon.Check style={{color:"var(--emerald)"}}/><span style={{fontSize:11,color:"var(--emerald)",fontFamily:"var(--font-mono)"}}>Looks good</span></div>)}
                  </div>
                ))}
                <div className="card card-p">
                  <div className="row gap-7" style={{marginBottom:7}}><Icon.MessageCircle/><h3 style={{fontSize:13,fontWeight:600}}>Need help?</h3></div>
                  <textarea className="input" value={taskDoubt} onChange={e=>setTaskDoubt(e.target.value)} placeholder="Describe where you're stuck…" style={{width:"100%",marginBottom:8}}/>
                  <button className="btn btn-secondary btn-sm row gap-6" onClick={submitTaskDoubt} disabled={loadingTaskDoubt||!taskDoubt.trim()}>{loadingTaskDoubt?<><Icon.Loader/>Thinking…</>:"Get a Hint"}</button>
                  {taskDoubtAnswer&&<div className="answer-box">{taskDoubtAnswer}</div>}
                </div>
                <button className="btn row gap-8" style={{justifyContent:"center",padding:"11px 20px",background:allDone?"var(--accent)":"var(--surface2)",color:allDone?"#fff":"var(--muted)",border:`1px solid ${allDone?"var(--accent)":"var(--border)"}`,borderRadius:8,cursor:allDone?"pointer":"not-allowed",boxShadow:allDone?"0 0 20px rgba(99,102,241,0.3)":"none"}} onClick={submitTask} disabled={loadingFeedback||!allDone}>{loadingFeedback?<><Icon.Loader/>Reviewing…</>:"Submit for Feedback"}</button>
                {!allDone&&<p style={{textAlign:"center",fontSize:12,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>Complete all {task.steps.length} fields to submit.</p>}
              </div>
            ):(
              <div className="card card-p">
                <div style={{marginBottom:16}}><div className="row gap-7" style={{marginBottom:3}}><Icon.Award style={{color:"var(--gold)"}}/><span className="badge badge-gold">Task Complete</span></div><h3 style={{fontSize:15,fontWeight:600,marginTop:10,marginBottom:3}}>Professor Max's Feedback</h3></div>
                <div className="answer-box" style={{marginTop:0,marginBottom:20}}>{taskFeedback}</div>
                <div className="stack gap-10">{task.steps.map((step,si)=>(<div key={step.id} style={{paddingBottom:10,borderBottom:si<task.steps.length-1?"1px solid var(--border)":"none"}}><p style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em",color:"var(--muted)",marginBottom:3,fontFamily:"var(--font-mono)"}}>{step.label}</p><p style={{fontSize:13,color:"var(--ink2)",lineHeight:1.65}}>{taskSteps[step.id]}</p></div>))}</div>
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
    setLoading(true);setSubmitted(false);setAnswers({});setCurrentQ(0);let allQuestions=[];
    try{
      const prompt=`Create 25 multiple choice questions for a student learning about "${topic}".\nRules: Questions must be specific to "${topic}". 4 options labeled A, B, C, D. Mix easy, medium, hard difficulty.\nReturn ONLY this JSON structure, nothing else:\n{"questions":[{"q":"Question?","options":["A) answer","B) answer","C) answer","D) answer"],"answer":"A","explanation":"Why this is correct"}]}`;
      const raw=await askClaude([{role:"user",content:prompt}]);
      let cleaned=raw.trim().replace(/```json|```/gi,"").replace(/,(\s*[}\]])/g,"$1");
      const m=cleaned.match(/\{[\s\S]*\}/);
      if(m){const d=JSON.parse(m[0]);if(d.questions&&Array.isArray(d.questions)&&d.questions.length>0){allQuestions=d.questions.slice(0,25);}}
    }catch(e){console.warn("Test parse failed:",e.message);}
    if(allQuestions.length===0){allQuestions=Array.from({length:25},(_,i)=>({q:`Question ${i+1}: What is an important concept in ${topic}?`,options:["A) Option A","B) Option B","C) Option C","D) Option D"],answer:"A",explanation:`This is a key concept in ${topic}.`}));}
    setQuestions(allQuestions);setLoading(false);
  };
  const submit=()=>{let s=0;questions.forEach((q,i)=>{if(answers[i]===q.answer)s++;});setScore(s);setSubmitted(true);setCurrentQ(0);};
  const pct=questions?Math.round((Object.keys(answers).length/questions.length)*100):0;
  const scorePct=submitted?Math.round(score/questions.length*100):0;
  return (
    <div className="page container" style={{paddingTop:24,paddingBottom:64,marginTop:80}}>
      <div className="card card-p" style={{marginBottom:20,borderLeft:"2px solid var(--accent)"}}>
        <div className="row gap-6" style={{flexWrap:"wrap",marginBottom:6}}><span className="badge badge-neutral" style={{fontFamily:"var(--font-mono)"}}>M{currentMonth} · W{currentWeek}</span><span className="badge badge-gold">25 Questions</span></div>
        <h2 style={{fontSize:16,fontWeight:600,marginBottom:2}}>Weekly Assessment</h2>
        <p style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>{topic}</p>
      </div>
      {!questions&&!loading&&(
        <div style={{textAlign:"center",padding:"60px 20px"}}>
          <div style={{width:56,height:56,borderRadius:12,background:"var(--surface2)",border:"1px solid var(--border2)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",color:"var(--accent2)"}}><Icon.CheckSquare/></div>
          <h3 style={{fontSize:18,fontWeight:700,marginBottom:6}}>Ready to test your knowledge?</h3>
          <p style={{color:"var(--muted)",marginBottom:24,fontSize:13,fontFamily:"var(--font-mono)"}}>25 questions on {topic}. No time limit.</p>
          <button className="btn btn-primary btn-lg row gap-8" style={{margin:"0 auto"}} onClick={loadTest}>Start Assessment <Icon.ArrowRight/></button>
        </div>
      )}
      {loading&&(<div style={{textAlign:"center",padding:"60px 20px"}}><div style={{width:36,height:36,border:"1px solid var(--border2)",borderTop:"1px solid var(--accent)",borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 14px"}}/><p style={{fontSize:13,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>Generating {topic} questions…</p></div>)}
      {questions&&!submitted&&(
        <div>
          <div className="card card-p" style={{marginBottom:14}}>
            <div className="row gap-8" style={{justifyContent:"space-between",marginBottom:7,fontSize:12}}><span style={{fontWeight:500,fontFamily:"var(--font-mono)"}}>Q {currentQ+1} / {questions.length}</span><span style={{color:"var(--muted)",fontFamily:"var(--font-mono)"}}>{Object.keys(answers).length} answered</span></div>
            <div className="progress-track" style={{height:3,marginBottom:10}}><div className="progress-fill progress-fill-gold" style={{width:`${pct}%`}}/></div>
            <div style={{display:"flex",flexWrap:"wrap",gap:4}}>{questions.map((_,i)=>(<button key={i} onClick={()=>setCurrentQ(i)} style={{width:26,height:26,borderRadius:5,border:`1px solid ${i===currentQ?"var(--accent)":answers[i]?"var(--emerald)":"var(--border)"}`,background:i===currentQ?"var(--accent)":answers[i]?"rgba(16,185,129,0.1)":"var(--surface2)",color:i===currentQ?"#fff":answers[i]?"var(--emerald)":"var(--muted)",fontWeight:600,fontSize:10,cursor:"pointer",fontFamily:"var(--font-mono)",transition:"all 0.1s"}}>{i+1}</button>))}</div>
          </div>
          <div className="card card-p-lg" style={{marginBottom:14}}>
            <p style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.1em",color:"var(--gold)",marginBottom:10,fontFamily:"var(--font-mono)"}}>Question {currentQ+1}</p>
            <p style={{fontSize:15,fontWeight:500,lineHeight:1.65,marginBottom:18,color:"var(--ink)"}}>{questions[currentQ].q}</p>
            <div className="stack gap-7">{questions[currentQ].options.map((opt,j)=>{const letter=["A","B","C","D"][j];const selected=answers[currentQ]===letter;return(<button key={j} className={`mcq-option ${selected?"selected":""}`} onClick={()=>setAnswers(a=>({...a,[currentQ]:letter}))}>{opt}</button>);})}</div>
          </div>
          <div className="row gap-8">
            <button className="btn btn-secondary row gap-6" onClick={()=>setCurrentQ(q=>Math.max(0,q-1))} disabled={currentQ===0}><Icon.ChevronLeft/>Prev</button>
            {currentQ<questions.length-1?<button className="btn btn-primary row gap-6" onClick={()=>setCurrentQ(q=>q+1)}>Next<Icon.ChevronRight/></button>:<button className="btn btn-gold" onClick={submit} disabled={Object.keys(answers).length<questions.length}>Submit All</button>}
          </div>
          {Object.keys(answers).length<questions.length&&currentQ===questions.length-1&&(<p style={{textAlign:"center",color:"var(--ember)",fontSize:12,marginTop:8,fontFamily:"var(--font-mono)"}}>Answer {questions.length-Object.keys(answers).length} more questions first.</p>)}
        </div>
      )}
      {submitted&&(
        <div>
          <div className="card card-p-lg" style={{textAlign:"center",marginBottom:20,background:scorePct>=80?"rgba(16,185,129,0.05)":scorePct>=60?"rgba(245,158,11,0.05)":"rgba(239,68,68,0.05)",border:`1px solid ${scorePct>=80?"rgba(16,185,129,0.15)":scorePct>=60?"rgba(245,158,11,0.15)":"rgba(239,68,68,0.15)"}`}}>
            <h2 style={{fontSize:40,fontWeight:800,letterSpacing:"-0.05em",marginBottom:4,fontFamily:"var(--font-mono)",color:scorePct>=80?"var(--emerald)":scorePct>=60?"var(--gold)":"var(--ember)"}}>{score}/{questions.length}</h2>
            <p style={{fontSize:14,fontWeight:500,marginBottom:4}}>{scorePct}% — {scorePct>=80?"Excellent":scorePct>=60?"Good progress":"Keep studying"}</p>
            <p style={{fontSize:12,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>{score} correct · {questions.length-score} incorrect</p>
          </div>
          <h3 style={{fontSize:14,fontWeight:600,marginBottom:12}}>Full Review</h3>
          <div className="stack gap-8">{questions.map((q,i)=>{const correct=answers[i]===q.answer;return(<div key={i} className="card card-p" style={{borderLeft:`2px solid ${correct?"var(--emerald)":"var(--ember)"}`}}><div className="row gap-8" style={{justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}><p style={{fontWeight:500,fontSize:13,flex:1,lineHeight:1.55}}>{i+1}. {q.q}</p><span className={`badge ${correct?"badge-green":"badge-red"}`} style={{flexShrink:0,marginLeft:8}}>{correct?"✓":"✗"}</span></div><p style={{fontSize:12,color:"var(--muted)",marginBottom:4,fontFamily:"var(--font-mono)"}}>Your: <strong>{answers[i]}</strong> · Correct: <strong style={{color:"var(--emerald)"}}>{q.answer}</strong></p><p style={{fontSize:12,color:"var(--muted)",lineHeight:1.55}}>{q.explanation}</p></div>);})}</div>
          <button className="btn btn-primary" style={{width:"100%",justifyContent:"center",marginTop:16}} onClick={loadTest}>Retake</button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const[page,setPage]=useState("loading");const[user,setUser]=useState(null);const[profile,setProfile]=useState(null);const[roadmap,setRoadmap]=useState(null);const[progress,setProgress]=useState(null);const[isDemo,setIsDemo]=useState(false);
  const[showEmailSettings,setShowEmailSettings]=useState(false);const[emailConfigured,setEmailConfigured]=useState(()=>{try{return!!(localStorage.getItem("ejs_service")&&localStorage.getItem("ejs_key"));}catch{return false;}});const[streakAlert,setStreakAlert]=useState(null);
  useEffect(()=>{if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));},[]);
  useEffect(()=>{
    const init=async()=>{const{data:{session}}=await supabase.auth.getSession();if(session?.user)await loadUserData(session.user);else setPage("landing");};
    init();
    const{data:{subscription}}=supabase.auth.onAuthStateChange(async(_,session)=>{if(session?.user)await loadUserData(session.user);});
    return()=>subscription.unsubscribe();
  },[]);
  const loadUserData=async(authUser)=>{
    setUser(authUser);const prof=await getProfile(authUser.id);setProfile(prof);const rm=await getRoadmap(authUser.id);const pg=await getProgress(authUser.id);
    if(rm?.data){
      setRoadmap(rm.data);const ap=dbToProgress(pg);setProgress(ap);
      const today=new Date().toISOString().slice(0,10);const lv=pg?.last_visit;
      if(lv&&lv!==today){const yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10);if(lv!==yesterday){setStreakAlert("lost");const rp={...ap,streak:0};setProgress(rp);await upsertProgress(authUser.id,{...progressToDb(rp),streak:0});sendStreakLostEmail(prof?.full_name||authUser.user_metadata?.full_name||"Student",authUser.email,ap.streak);}}
      await upsertProgress(authUser.id,{last_visit:today});setPage("dashboard");
    }else{
      if(!prof&&authUser.user_metadata?.full_name){await upsertProfile(authUser.id,{full_name:authUser.user_metadata.full_name,age:null,grade:null});setProfile({full_name:authUser.user_metadata.full_name});}
      setPage("onboard");
    }
  };
  const onAuth=async(au,prof,has)=>{setUser(au);setProfile(prof);if(has)await loadUserData(au);else setPage("onboard");};
  const logout=async()=>{await supabase.auth.signOut();setUser(null);setProfile(null);setRoadmap(null);setProgress(null);setPage("landing");};
  const startDemo=()=>{setRoadmap(DEMO_ROADMAP);setProgress(DEMO_PROGRESS);setIsDemo(true);setPage("dashboard");};
  const exitDemo=()=>{setIsDemo(false);setRoadmap(null);setProgress(null);setUser(null);setPage("landing");};
  const showNav=["dashboard","learn","test"].includes(page);const navUser=isDemo?{email:"demo@velorn.app"}:user;
  if(page==="loading")return(<div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",flexDirection:"column",gap:10,background:"#0a0a0f"}}><div style={{width:32,height:32,border:"1px solid rgba(255,255,255,0.06)",borderTop:"1px solid #6366f1",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/><p style={{fontSize:12,color:"#606080",fontFamily:"monospace",letterSpacing:"0.05em"}}>velorn</p><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>);
  return (
    <>
      <style>{css}</style>
      {streakAlert==="lost"&&(<div style={{background:"rgba(239,68,68,0.08)",borderBottom:"1px solid rgba(239,68,68,0.15)",padding:"9px 24px",display:"flex",alignItems:"center",justifyContent:"center",gap:10,fontSize:12,color:"var(--ember)",fontFamily:"var(--font-mono)"}}><Icon.AlertCircle/><span>You lost your streak. Come back today to start a new one.</span><button style={{background:"none",border:"none",cursor:"pointer",color:"var(--ember)",marginLeft:4}} onClick={()=>setStreakAlert(null)}><Icon.X/></button></div>)}
      {showNav&&<Nav user={navUser} onLogout={isDemo?exitDemo:logout} onNav={setPage} page={page} onOpenEmailSettings={()=>setShowEmailSettings(true)} emailConfigured={emailConfigured} isDemo={isDemo} onSignUp={()=>{exitDemo();setPage("auth");}}/>}
      {isDemo&&(<div className="demo-banner"><span style={{color:"var(--muted)",fontFamily:"var(--font-mono)"}}>demo</span><span>Exploring a sample Entrepreneurship roadmap</span><button className="btn btn-primary btn-sm" onClick={()=>{exitDemo();setPage("auth");}}>Sign Up Free</button></div>)}
      {showEmailSettings&&!isDemo&&<EmailSettingsModal onClose={()=>{setShowEmailSettings(false);try{setEmailConfigured(!!(localStorage.getItem("ejs_service")&&localStorage.getItem("ejs_key")));}catch{}}}/>}
      {page==="landing"&&<Landing onStart={()=>setPage("auth")} onDemo={startDemo}/>}
      {page==="auth"&&<Auth onAuth={onAuth}/>}
      {page==="onboard"&&user&&<Onboarding user={user} profile={profile} onDone={(rm,pg)=>{setRoadmap(rm);setProgress(pg);setPage("dashboard");}}/>}
      {page==="dashboard"&&roadmap&&progress&&<Dashboard user={user} roadmap={roadmap} progress={progress} onUpdateProgress={p=>setProgress(p)} onNav={setPage} isDemo={isDemo}/>}
      {page==="learn"&&roadmap&&progress&&<Learn user={user} progress={progress} roadmap={roadmap} onUpdateProgress={p=>setProgress(p)} isDemo={isDemo} onSignUp={()=>{exitDemo();setPage("auth");}}/>}
      {page==="test"&&roadmap&&progress&&<WeeklyTest progress={progress} roadmap={roadmap}/>}
    </>
  );
}