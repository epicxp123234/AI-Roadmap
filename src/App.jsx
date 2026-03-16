import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────────────────
//  SUPABASE CONFIG
//  1. Go to https://supabase.com → create free project
//  2. Settings → API → paste your URL and anon key below
// ─────────────────────────────────────────────────────────────────────────────
const SUPABASE_URL  = "https://knqclhfxhkishaivowhe.supabase.co";
const SUPABASE_ANON = "sb_publishable_xcwOjTEqwOgX6VHhB2krTA_YI1Swr5_";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// ── Claude AI helper ─────────────────────────────────────────────────────────
const ANTHROPIC_KEY = "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";

async function askClaude(messages, system = "", maxTokens = 2000) {
  const key = import.meta.env.VITE_GEMINI_KEY;
  if(!key) { console.error("GEMINI KEY MISSING"); return ""; }

  // Convert messages + system into Gemini format
  const parts = [];
  if(system) parts.push({ text: "SYSTEM INSTRUCTIONS:\n" + system + "\n\n" });
  messages.forEach(m => parts.push({ text: (m.role === "user" ? "User: " : "Assistant: ") + m.content }));

  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: { maxOutputTokens: maxTokens, temperature: 0.85 }
  };

  const fetchPromise = fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) }
  ).then(async r => {
    const data = await r.json();
    if(data.error) { console.error("Gemini error:", data.error); return ""; }
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  });

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), 30000)
  );

  return Promise.race([fetchPromise, timeoutPromise]);
}

// ── Supabase DB helpers ───────────────────────────────────────────────────────
async function getProfile(userId) {
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
  return data;
}
async function upsertProfile(userId, fields) {
  await supabase.from("profiles").upsert({ id: userId, ...fields });
}
async function getRoadmap(userId) {
  const { data } = await supabase.from("roadmaps").select("*").eq("user_id", userId).single();
  return data;
}
async function upsertRoadmap(userId, roadmapData, meta={}) {
  await supabase.from("roadmaps").upsert({
    user_id: userId,
    title: roadmapData.title,
    data: roadmapData,
    ...meta,
  });
}
async function getProgress(userId) {
  const { data } = await supabase.from("progress").select("*").eq("user_id", userId).single();
  return data;
}
async function upsertProgress(userId, fields) {
  await supabase.from("progress").upsert({ user_id: userId, ...fields, updated_at: new Date().toISOString() });
}
async function saveTaskSubmission(userId, data) {
  await supabase.from("task_submissions").upsert({
    user_id: userId,
    week_key: data.weekKey,
    career: data.career,
    task_title: data.taskTitle,
    answers: data.answers,
    feedback: data.feedback,
    submitted_at: new Date().toISOString(),
  }, { onConflict: "user_id,week_key" });
}
async function getTaskSubmissions(userId) {
  const { data } = await supabase.from("task_submissions").select("*").eq("user_id", userId).order("submitted_at", { ascending: false });
  return data || [];
}

// Converts DB progress row → app progress object
function dbToProgress(row) {
  if (!row) return { currentMonth:1, currentWeek:1, currentDay:1, streak:0, completedDays:[] };
  return {
    currentMonth:  row.current_month  ?? 1,
    currentWeek:   row.current_week   ?? 1,
    currentDay:    row.current_day    ?? 1,
    streak:        row.streak         ?? 0,
    completedDays: row.completed_days ?? [],
    lastVisit:     row.last_visit,
  };
}
function progressToDb(p) {
  return {
    current_month:  p.currentMonth,
    current_week:   p.currentWeek,
    current_day:    p.currentDay,
    streak:         p.streak,
    completed_days: p.completedDays,
    last_visit:     new Date().toISOString().slice(0,10),
  };
}

// ── EmailJS streak reminder ───────────────────────────────────────────────────
const EJS = {
  serviceId:  localStorage.getItem("ejs_service")  || "",
  templateId: localStorage.getItem("ejs_template") || "",
  publicKey:  localStorage.getItem("ejs_key")      || "",
};
async function sendStreakLostEmail(userName, userEmail, streak) {
  if (!EJS.serviceId || !EJS.templateId || !EJS.publicKey) return false;
  try {
    if (!window.emailjs) {
      await new Promise((res,rej)=>{
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js";
        s.onload=res; s.onerror=rej;
        document.head.appendChild(s);
      });
      window.emailjs.init(EJS.publicKey);
    }
    await window.emailjs.send(EJS.serviceId, EJS.templateId, {
      to_name: userName, to_email: userEmail, streak,
      app_name:"RoadmapAI", login_url: window.location.href,
      message:`You had a ${streak}-day streak! Come back today and keep building your future 🚀`,
    });
    return true;
  } catch(e) { console.warn("EmailJS:", e); return false; }
}

// ── CSS ───────────────────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Cabinet+Grotesk:wght@300;400;500;700;800&display=swap');
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  :root {
    --gold:#C9A84C; --gold2:#A8893A; --gold-light:#F5E6C0; --gold-glow:rgba(201,168,76,.2);
    --ink:#0A0A0F; --ink2:#1A1A2E; --paper:#FAFAF7; --paper2:#F0EFE9;
    --smoke:#6B6B7B; --mist:#9B9BAA; --pearl:#E8E8E0;
    --emerald:#1A6B4A; --ember:#C0392B; --sky-ink:#1A3A5C;
    --radius:14px; --shadow:0 8px 40px rgba(0,0,0,.10);
    --shadow-gold:0 4px 24px rgba(201,168,76,.25);
    --font-display:'Playfair Display',serif;
    --font-body:'Outfit',sans-serif;
  }
  body { font-family:var(--font-body); background:var(--paper); color:var(--ink); min-height:100vh; width:100%; overflow-x:hidden; }
  #root { width:100%; }

  /* ── Noise texture overlay ── */
  body::before {
    content:''; position:fixed; inset:0; pointer-events:none; z-index:0;
    background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E");
    opacity:.4;
  }

  h1,h2,h3,h4 { font-family:var(--font-display); }
  p, button, input, select, textarea, label, span { font-family:var(--font-body); }

  .page { animation:fadeUp .5s cubic-bezier(.22,1,.36,1) both; position:relative; z-index:1; }
  @keyframes fadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
  @keyframes shimmer { 0%{background-position:200% center} 100%{background-position:-200% center} }
  @keyframes pulse-gold { 0%,100%{box-shadow:0 0 0 0 rgba(201,168,76,.4)} 50%{box-shadow:0 0 0 8px rgba(201,168,76,0)} }

  .btn-primary {
    background:linear-gradient(135deg,var(--gold),var(--gold2));
    color:var(--ink); border:none; border-radius:10px;
    padding:14px 32px; font-family:var(--font-body); font-size:15px; font-weight:700;
    cursor:pointer; transition:all .25s; letter-spacing:.3px;
    box-shadow:0 4px 20px rgba(201,168,76,.4);
    position:relative; overflow:hidden;
  }
  .btn-primary::after {
    content:''; position:absolute; inset:0;
    background:linear-gradient(135deg,rgba(255,255,255,.15),transparent);
    opacity:0; transition:opacity .2s;
  }
  .btn-primary:hover { transform:translateY(-2px); box-shadow:0 8px 32px rgba(201,168,76,.5); }
  .btn-primary:hover::after { opacity:1; }
  .btn-primary:active { transform:translateY(0); }
  .btn-primary:disabled { opacity:.5; cursor:not-allowed; transform:none; }

  .btn-google {
    background:var(--paper); color:var(--ink); border:1.5px solid var(--pearl); border-radius:10px;
    padding:13px 24px; font-family:var(--font-body); font-size:15px; font-weight:600;
    cursor:pointer; transition:all .2s;
    box-shadow:0 2px 12px rgba(0,0,0,.06); display:flex; align-items:center; gap:10px; justify-content:center;
  }
  .btn-google:hover { border-color:var(--gold); box-shadow:0 4px 20px rgba(201,168,76,.2); transform:translateY(-1px); }

  .btn-outline {
    background:transparent; color:var(--gold2); border:1.5px solid var(--gold);
    border-radius:10px; padding:12px 28px; font-family:var(--font-body);
    font-size:14px; font-weight:600; cursor:pointer; transition:all .2s; letter-spacing:.2px;
  }
  .btn-outline:hover { background:var(--gold-light); }

  .card {
    background:var(--paper); border-radius:var(--radius);
    box-shadow:var(--shadow); padding:32px;
    border:1px solid rgba(201,168,76,.15);
  }
  .field { display:flex; flex-direction:column; gap:6px; }
  .field label { font-weight:600; font-size:13px; color:var(--smoke); letter-spacing:.5px; text-transform:uppercase; }
  .field input,.field select,.field textarea {
    border:1.5px solid var(--pearl); border-radius:10px; padding:13px 16px;
    font-family:var(--font-body); font-size:15px; color:var(--ink);
    transition:border-color .2s,box-shadow .2s; outline:none; background:var(--paper);
  }
  .field input:focus,.field select:focus,.field textarea:focus {
    border-color:var(--gold); box-shadow:0 0 0 3px var(--gold-glow);
  }
  .pill {
    display:inline-flex; align-items:center; gap:6px; background:var(--gold-light);
    color:var(--gold2); border-radius:999px; padding:5px 14px; font-size:12px; font-weight:700;
    letter-spacing:.4px; text-transform:uppercase;
  }
  .progress-track { background:var(--pearl); border-radius:999px; height:6px; overflow:hidden; }
  .progress-fill { height:100%; border-radius:999px; background:linear-gradient(90deg,var(--gold),#E8C97A); transition:width .8s cubic-bezier(.22,1,.36,1); }
  .mcq-option {
    display:flex; align-items:center; gap:12px; padding:14px 18px;
    border:1.5px solid var(--pearl); border-radius:10px; cursor:pointer;
    transition:all .15s; font-size:15px; background:var(--paper);
  }
  .mcq-option:hover { border-color:var(--gold); background:var(--gold-light); }
  .mcq-option.chosen  { border-color:var(--gold); background:var(--gold-light); }
  .mcq-option.correct { border-color:var(--emerald); background:#D1FAE5; }
  .mcq-option.wrong   { border-color:var(--ember); background:#FEE2E2; }

  .nav {
    position:sticky; top:0; z-index:100;
    background:rgba(250,250,247,.92); backdrop-filter:blur(16px);
    border-bottom:1px solid rgba(201,168,76,.2);
    display:flex; align-items:center; justify-content:space-between; padding:0 36px; height:64px;
  }
  .nav-logo {
    font-family:var(--font-display); font-weight:900; font-size:20px;
    background:linear-gradient(135deg,var(--gold),var(--gold2));
    -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text;
    letter-spacing:-.3px;
  }
  .container { max-width:800px; margin:0 auto; padding:0 20px; }
  .stack { display:flex; flex-direction:column; }
  .row { display:flex; align-items:center; }
  .gap-4{gap:4px} .gap-8{gap:8px} .gap-10{gap:10px} .gap-12{gap:12px} .gap-14{gap:14px} .gap-16{gap:16px} .gap-20{gap:20px} .gap-24{gap:24px} .gap-32{gap:32px}

  .dots span {
    display:inline-block; width:8px; height:8px; background:var(--gold);
    border-radius:50%; margin:0 3px; animation:bounce .9s infinite;
  }
  .dots span:nth-child(2){animation-delay:.15s} .dots span:nth-child(3){animation-delay:.3s}
  @keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-8px)} }

  .streak {
    background:linear-gradient(135deg,#FEF3C7,#FDE68A);
    border:1.5px solid var(--gold); color:#78520A;
    border-radius:12px; padding:14px 20px; font-weight:700; font-size:20px;
  }

  /* ── HERO ── */
  .hero {
    min-height:calc(100vh - 64px); display:flex; flex-direction:column;
    align-items:center; justify-content:center; text-align:center; padding:60px 20px;
    width:100%; max-width:100%; position:relative; overflow:hidden;
    background:var(--paper);
  }
  .hero::before {
    content:''; position:absolute; width:700px; height:700px; border-radius:50%;
    background:radial-gradient(circle,rgba(201,168,76,.12) 0%,transparent 70%);
    top:-200px; left:50%; transform:translateX(-50%); pointer-events:none;
  }
  .hero::after {
    content:''; position:absolute; inset:0; pointer-events:none;
    background:
      radial-gradient(1px 1px at 20% 30%, rgba(201,168,76,.3) 0%, transparent 100%),
      radial-gradient(1px 1px at 80% 20%, rgba(201,168,76,.2) 0%, transparent 100%),
      radial-gradient(1px 1px at 60% 70%, rgba(201,168,76,.25) 0%, transparent 100%);
  }
  .hero h1 {
    font-size:clamp(36px,6vw,72px); font-weight:900; line-height:1.05;
    letter-spacing:-2px; max-width:780px; color:var(--ink);
    animation: fadeUp .6s cubic-bezier(.22,1,.36,1) .1s both;
  }
  .hero h1 span {
    background:linear-gradient(135deg,var(--gold),#E8C04A,var(--gold2));
    background-size:200% auto;
    -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text;
    animation: shimmer 4s linear infinite;
  }
  .hero p { color:var(--smoke); font-size:18px; max-width:500px; line-height:1.7; margin-top:20px; font-weight:400; }
  .hero-badge {
    display:inline-flex; align-items:center; gap:8px;
    background:var(--ink); color:var(--gold-light);
    border-radius:999px; padding:8px 20px; font-size:13px; font-weight:600;
    letter-spacing:.5px; margin-bottom:28px;
    animation: fadeUp .5s cubic-bezier(.22,1,.36,1) both;
  }
  .hero-badge span { width:6px; height:6px; background:var(--gold); border-radius:50%; animation:pulse-gold 2s infinite; }

  .feature-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; margin-top:56px; max-width:680px; width:100%; }
  .feature-card {
    background:var(--paper); border-radius:14px; padding:22px;
    border:1px solid rgba(201,168,76,.2);
    box-shadow:0 2px 16px rgba(0,0,0,.05); text-align:left;
    transition:transform .2s, box-shadow .2s;
  }
  .feature-card:hover { transform:translateY(-3px); box-shadow:0 8px 32px rgba(201,168,76,.15); }
  .feature-icon { font-size:26px; margin-bottom:10px; }
  .feature-card h4 { font-size:14px; font-weight:700; font-family:var(--font-body); color:var(--ink); }
  .feature-card p { font-size:12px; color:var(--smoke); margin-top:4px; line-height:1.5; }

  .divider { display:flex; align-items:center; gap:12px; color:var(--mist); font-size:13px; margin:4px 0; }
  .divider::before,.divider::after { content:""; flex:1; height:1px; background:var(--pearl); }

  /* ── RESPONSIVE ── */
  @media(max-width:768px){
    .hero h1 { font-size:clamp(30px,7vw,52px); letter-spacing:-1px; }
    .hero p { font-size:16px; }
    .feature-grid { grid-template-columns:repeat(2,1fr); max-width:100%; }
    .container { padding:0 16px; }
    .card { padding:24px; }
    .nav { padding:0 20px; height:58px; }
  }
  @media(max-width:480px){
    .hero { padding:40px 16px; min-height:auto; }
    .hero h1 { font-size:clamp(28px,8vw,40px); letter-spacing:-.5px; }
    .hero p { font-size:15px; max-width:100%; }
    .feature-grid { grid-template-columns:1fr 1fr; gap:10px; margin-top:32px; }
    .feature-card { padding:14px; }
    .nav { padding:0 14px; height:54px; }
    .card { padding:18px; border-radius:12px; }
    .container { padding:0 12px; }
    .btn-primary { padding:13px 20px; font-size:14px; width:100%; }
    h2 { font-size:22px !important; }
  }
  @media(max-width:360px){
    .hero h1 { font-size:26px; }
    .feature-grid { grid-template-columns:1fr; }
  }`
;

// ── Loader ────────────────────────────────────────────────────────────────────
function Loader({ text="Loading…" }) {
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:20,padding:"80px 20px"}}>
      <div className="dots"><span/><span/><span/></div>
      <p style={{color:"var(--mid)",fontSize:16}}>{text}</p>
    </div>
  );
}

// ── Email Settings Modal ──────────────────────────────────────────────────────
function EmailSettingsModal({ onClose, userEmail, userName }) {
  const [svc,  setSvc]  = useState(localStorage.getItem("ejs_service")  || "");
  const [tpl,  setTpl]  = useState(localStorage.getItem("ejs_template") || "");
  const [key,  setKey]  = useState(localStorage.getItem("ejs_key")      || "");
  const [saved,   setSaved]   = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState("");

  const save = () => {
    localStorage.setItem("ejs_service",  svc);
    localStorage.setItem("ejs_template", tpl);
    localStorage.setItem("ejs_key",      key);
    EJS.serviceId=svc; EJS.templateId=tpl; EJS.publicKey=key;
    setSaved(true); setTimeout(()=>setSaved(false),2000);
  };
  const test = async () => {
    save(); setTesting(true); setTestMsg("");
    const ok = await sendStreakLostEmail(userName||"Student", userEmail||"", 7);
    setTestMsg(ok?"✅ Test email sent! Check your inbox.":"❌ Failed — check your EmailJS IDs.");
    setTesting(false);
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="card" style={{width:"100%",maxWidth:500,maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div><h3>📧 Email Reminder Setup</h3><p style={{fontSize:13,color:"var(--mid)",marginTop:2}}>Get notified when you lose your streak</p></div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:"var(--mid)"}}>✕</button>
        </div>
        <div style={{background:"var(--sky)",borderRadius:12,padding:"14px 16px",marginBottom:20,fontSize:13,lineHeight:1.8,color:"var(--mid)"}}>
          <strong style={{color:"var(--blue)"}}>Setup (3 min, free):</strong><br/>
          1. Sign up at <a href="https://emailjs.com" target="_blank" rel="noreferrer" style={{color:"var(--blue)"}}>emailjs.com</a><br/>
          2. Add Email Service (Gmail) → copy <strong>Service ID</strong><br/>
          3. Create Template with <code style={{background:"#E2E8F0",padding:"1px 5px",borderRadius:4}}>{"{{to_name}}"}</code> <code style={{background:"#E2E8F0",padding:"1px 5px",borderRadius:4}}>{"{{streak}}"}</code> <code style={{background:"#E2E8F0",padding:"1px 5px",borderRadius:4}}>{"{{message}}"}</code> → copy <strong>Template ID</strong><br/>
          4. Account → copy <strong>Public Key</strong>
        </div>
        <div className="stack gap-14">
          <div className="field"><label>Service ID</label><input placeholder="service_abc123" value={svc} onChange={e=>setSvc(e.target.value)}/></div>
          <div className="field"><label>Template ID</label><input placeholder="template_xyz789" value={tpl} onChange={e=>setTpl(e.target.value)}/></div>
          <div className="field"><label>Public Key</label><input placeholder="AbCdEfGhIj" value={key} onChange={e=>setKey(e.target.value)}/></div>
        </div>
        {testMsg && <div style={{marginTop:14,padding:"10px 14px",borderRadius:10,fontSize:14,background:testMsg.startsWith("✅")?"#D1FAE5":"#FEE2E2",color:testMsg.startsWith("✅")?"#065F46":"#991B1B"}}>{testMsg}</div>}
        <div className="row gap-12" style={{marginTop:20}}>
          <button className="btn-primary" onClick={save} style={{flex:1}}>{saved?"✅ Saved!":"Save"}</button>
          <button className="btn-outline" onClick={test} disabled={testing} style={{flex:1}}>{testing?"Sending…":"Test Email"}</button>
        </div>
        <p style={{textAlign:"center",fontSize:12,color:"var(--light)",marginTop:14}}>Free tier: 200 emails/month</p>
      </div>
    </div>
  );
}

// ── Nav ───────────────────────────────────────────────────────────────────────
function Nav({ user, onLogout, onNav, page, onOpenEmailSettings, emailConfigured }) {
  return (
    <nav className="nav">
      <span className="nav-logo">✦ RoadmapAI</span>
      {user && (
        <div className="row gap-12" style={{flexWrap:"wrap"}}>
          {["dashboard","learn","test"].map(p=>(
            <button key={p} onClick={()=>onNav(p)} style={{
              background:"none",border:"none",cursor:"pointer",
              fontFamily:"var(--font-body)",fontSize:14,
              color:page===p?"var(--gold2)":"var(--smoke)",
              fontWeight:page===p?700:400,textTransform:"capitalize",
              borderBottom:page===p?"2px solid var(--gold)":"2px solid transparent",
              paddingBottom:2,
            }}>{p==="learn"?"Learn":p==="test"?"Test":"Dashboard"}</button>
          ))}
          <button onClick={onOpenEmailSettings} style={{
            background:emailConfigured?"#D1FAE5":"var(--gold-light)",
            border:emailConfigured?"1.5px solid #10B981":"1.5px solid var(--gold)",
            borderRadius:10,padding:"5px 12px",cursor:"pointer",fontSize:13,fontWeight:600,
            color:emailConfigured?"#065F46":"var(--gold2)",display:"flex",alignItems:"center",gap:4
          }}>{emailConfigured?"🔔 ON":"🔕 Remind"}</button>
          <button className="btn-outline" style={{padding:"6px 16px",fontSize:13}} onClick={onLogout}>Logout</button>
        </div>
      )}
    </nav>
  );
}

// ── Landing ───────────────────────────────────────────────────────────────────
function Landing({ onStart }) {
  return (
    <div className="page hero">
      <div className="hero-badge"><span/> Free for students aged 13–18</div>
      <h1>Your Personal<br/><span>AI-Powered Career</span><br/>Roadmap Awaits</h1>
      <p>A six-month learning plan crafted just for you. Daily lessons, weekly tests, and a streak system to keep you moving forward.</p>
      <button className="btn-primary" style={{marginTop:40,fontSize:16,padding:"16px 44px",borderRadius:12}} onClick={onStart}>Begin Your Journey →</button>
      <div className="feature-grid">
        {[
          {icon:"📅",title:"Daily Tasks",desc:"Clear, actionable tasks every single day"},
          {icon:"🧠",title:"AI Doubt Solver",desc:"Ask anything, get simple explanations"},
          {icon:"📊",title:"Progress Tracking",desc:"See how far you've come at a glance"},
          {icon:"📝",title:"Weekly Tests",desc:"MCQs with instant feedback & scores"},
          {icon:"🎯",title:"Goal-Based Plan",desc:"Job-ready or foundation tracks"},
          {icon:"🔥",title:"Streak System",desc:"Stay motivated with daily streaks"},
        ].map(f=>(
          <div className="feature-card" key={f.title}>
            <div className="feature-icon">{f.icon}</div>
            <h4>{f.title}</h4><p>{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Auth (Email + Google OAuth) ───────────────────────────────────────────────
function Auth({ onAuth }) {
  const [mode, setMode]   = useState("signup");
  const [form, setForm]   = useState({name:"",age:"",grade:"",email:"",password:""});
  const [err,  setErr]    = useState("");
  const [loading, setLoading] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const handleGoogle = async () => {
    setLoading(true); setErr("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider:"google",
      options:{ redirectTo: "https://epicxp123234.github.io/AI-Roadmap/" }
    });
    if (error) { setErr(error.message); setLoading(false); }
  };

  const handleSubmit = async () => {
    setErr(""); setLoading(true);
    if (mode==="signup") {
      if (!form.name||!form.age||!form.grade||!form.email||!form.password) {
        setErr("All fields are required."); setLoading(false); return;
      }
      const { data, error } = await supabase.auth.signUp({
        email: form.email, password: form.password,
        options:{ data:{ full_name:form.name } }
      });
      if (error) { setErr(error.message); setLoading(false); return; }
      // Save extra profile info
      if (data.user) {
        await upsertProfile(data.user.id, { full_name:form.name, age:parseInt(form.age), grade:form.grade });
        onAuth(data.user, { full_name:form.name, age:form.age, grade:form.grade }, false);
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({
        email:form.email, password:form.password
      });
      if (error) { setErr("Invalid email or password."); setLoading(false); return; }
      const profile = await getProfile(data.user.id);
      onAuth(data.user, profile, true);
    }
    setLoading(false);
  };

  return (
    <div className="page container" style={{paddingTop:60,paddingBottom:60}}>
      <div className="card" style={{maxWidth:460,margin:"0 auto"}}>
        <h2 style={{marginBottom:4}}>{mode==="signup"?"Create your account":"Welcome back"}</h2>
        <p style={{color:"var(--mid)",fontSize:14,marginBottom:24}}>
          {mode==="signup"?"Start your AI learning journey today":"Log in to continue your roadmap"}
        </p>

        {/* Google Sign In */}
        <button className="btn-google" style={{width:"100%",marginBottom:8}} onClick={handleGoogle} disabled={loading}>
          <svg width="20" height="20" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Continue with Google
        </button>

        <div className="divider">or</div>

        {err && <p style={{color:"var(--red)",fontSize:13,margin:"8px 0"}}>{err}</p>}

        <div className="stack gap-14" style={{marginTop:8}}>
          {mode==="signup" && <>
            <div className="field"><label>Full Name</label><input placeholder="Your full name" value={form.name} onChange={e=>set("name",e.target.value)}/></div>
            <div className="row gap-12">
              <div className="field" style={{flex:1}}><label>Age</label><input type="number" min="13" max="18" placeholder="15" value={form.age} onChange={e=>set("age",e.target.value)}/></div>
              <div className="field" style={{flex:1}}><label>Class/Grade</label><input placeholder="Grade 10" value={form.grade} onChange={e=>set("grade",e.target.value)}/></div>
            </div>
          </>}
          <div className="field"><label>Email</label><input type="email" placeholder="you@email.com" value={form.email} onChange={e=>set("email",e.target.value)}/></div>
          <div className="field"><label>Password</label><input type="password" placeholder="••••••••" value={form.password} onChange={e=>set("password",e.target.value)}/></div>
          <button className="btn-primary" onClick={handleSubmit} disabled={loading}>
            {loading?"Please wait…":mode==="signup"?"Create Account →":"Log In →"}
          </button>
          <p style={{textAlign:"center",fontSize:13,color:"var(--mid)"}}>
            {mode==="signup"?"Already have an account? ":"New here? "}
            <span style={{color:"var(--blue)",cursor:"pointer",fontWeight:600}} onClick={()=>{setMode(m=>m==="signup"?"login":"signup");setErr("");}}>
              {mode==="signup"?"Log in":"Sign up"}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

// ── ROADMAP LOADER ────────────────────────────────────────────────────────────
const LOADING_STEPS = [
  { icon:"🧙‍♂️", text:"Professor CodeWizard is reviewing your goals…" },
  { icon:"🗺️", text:"Mapping out your 6-month journey…" },
  { icon:"📅", text:"Scheduling daily tasks just for you…" },
  { icon:"🧪", text:"Preparing weekly tests and challenges…" },
  { icon:"⚡", text:"Adding secret professor tips…" },
  { icon:"✨", text:"Putting the final touches on your roadmap…" },
];
function RoadmapLoader() {
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const stepInterval = setInterval(() => {
      setStep(s => s < LOADING_STEPS.length - 1 ? s + 1 : s);
    }, 3500);
    const progInterval = setInterval(() => {
      setProgress(p => p < 95 ? p + 1 : p);
    }, 220);
    return () => { clearInterval(stepInterval); clearInterval(progInterval); };
  }, []);

  return (
    <div style={{
      minHeight:"100vh", display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center", padding:"40px 20px",
      background:"var(--paper)", textAlign:"center"
    }}>
      <div style={{
        width:100, height:100, borderRadius:"50%",
        background:"linear-gradient(135deg,var(--gold-light),var(--gold))",
        display:"flex", alignItems:"center", justifyContent:"center",
        fontSize:52, marginBottom:32,
        boxShadow:"0 8px 40px rgba(201,168,76,.4)",
        animation:"pulse-gold 2s infinite"
      }}>
        {LOADING_STEPS[step].icon}
      </div>

      <h2 style={{fontSize:26, marginBottom:12, fontFamily:"var(--font-display)"}}>
        Building Your Roadmap
      </h2>

      <p style={{
        color:"var(--smoke)", fontSize:16, maxWidth:340,
        marginBottom:36, lineHeight:1.6, minHeight:52,
        transition:"all .4s ease"
      }}>
        {LOADING_STEPS[step].text}
      </p>

      {/* Progress bar */}
      <div style={{width:"100%", maxWidth:360, marginBottom:12}}>
        <div style={{
          background:"var(--pearl)", borderRadius:999, height:8, overflow:"hidden"
        }}>
          <div style={{
            height:"100%", borderRadius:999,
            background:"linear-gradient(90deg,var(--gold),#E8C97A)",
            width:`${progress}%`, transition:"width .3s ease"
          }}/>
        </div>
        <div style={{
          display:"flex", justifyContent:"space-between",
          marginTop:8, fontSize:13, color:"var(--mist)"
        }}>
          <span>Generating with AI…</span>
          <span style={{fontWeight:700, color:"var(--gold2)"}}>{progress}%</span>
        </div>
      </div>

      {/* Step dots */}
      <div style={{display:"flex", gap:8, marginTop:16}}>
        {LOADING_STEPS.map((_, i) => (
          <div key={i} style={{
            width: i === step ? 24 : 8,
            height:8, borderRadius:999,
            background: i <= step ? "var(--gold)" : "var(--pearl)",
            transition:"all .4s ease"
          }}/>
        ))}
      </div>

      <p style={{
        marginTop:32, fontSize:13, color:"var(--mist)",
        fontStyle:"italic"
      }}>
        This takes about 20–30 seconds ☕ Grab a sip of water!
      </p>
    </div>
  );
}

// ── ONBOARDING ────────────────────────────────────────────────────────────────
function Onboarding({ user, profile, onDone }) {
  const [form, setForm] = useState({
    career:"", level:"Beginner", time:"1 hour", goal:"Strong foundation"
  });
  const [loading, setLoading] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const generate = async () => {
    if (!form.career.trim()) { alert("Please enter what you want to learn!"); return; }
    setLoading(true);
    const name  = profile?.full_name || user?.user_metadata?.full_name || user?.email || "Student";
    const age   = profile?.age   || "15";
    const grade = profile?.grade || "High School";

    const prompt = `You are RoadmapAI — the world's most personalised learning coach for teenagers. Your ONE job is to create a 6-month learning roadmap that feels like it was built SPECIFICALLY for this exact student and nobody else.

STUDENT PROFILE:
- Name: ${name}
- Age: ${age} years old
- Grade: ${grade}
- What they want to learn: "${form.career}"
- Current level: ${form.level}
- Time available daily: ${form.time}
- Their specific goal: "${form.goal}"

CRITICAL RULES — break any of these and the roadmap is useless:
1. EVERY task, week goal, and month theme must be 100% specific to "${form.career}" — if they want to learn entrepreneurship, talk about business. If art, talk about drawing. NEVER use generic filler like "study concept 1".
2. Respect their level: if beginner, start from absolute zero with no assumed knowledge. If intermediate, skip basics entirely.
3. Respect their time: if they have 30 min/day, tasks must be completable in 30 min. If 2 hours, go deeper.
4. Their goal is "${form.goal}" — every month should visibly progress toward THAT specific outcome.
5. Day 6 each week = hands-on mini project directly related to that week's topic.
6. Day 7 = reflect, review, rest — make it encouraging.
7. Weekly goals must build on each other — week 2 assumes week 1 is done.
8. Tasks should feel exciting, not like homework. Use action words: "Build", "Create", "Discover", "Master", "Try", "Explore".
9. Write tasks like a cool mentor talking to a ${age}-year-old, not a textbook.

Return ONLY valid JSON, no markdown:
{
  "title": "6-Month ${form.career} Roadmap for ${name}",
  "months": [
    {
      "month": 1,
      "theme": "Specific theme name relevant to ${form.career}",
      "focus": "One sentence describing what this month builds toward",
      "weeks": [
        {
          "week": 1,
          "goal": "Specific exciting weekly goal in ${form.career}",
          "days": [
            {"day":1,"task":"Specific engaging task for ${form.career}"},
            {"day":2,"task":"Specific engaging task"},
            {"day":3,"task":"Specific engaging task"},
            {"day":4,"task":"Specific engaging task"},
            {"day":5,"task":"Specific engaging task"},
            {"day":6,"task":"Mini project: build/create something specific to this week"},
            {"day":7,"task":"Review this week, celebrate progress, prep for next week 🌟"}
          ],
          "testTopic": "Specific topic from this week for the test"
        }
      ]
    }
  ]
}
Generate ALL 6 months with ALL 4 weeks each. Every single task must be specific to "${form.career}" and feel personally crafted for ${name}.`;

    try {
      const raw = await askClaude([{role:"user",content:prompt}], "", 4000);
      const roadmap = JSON.parse(raw.replace(/```json|```/g,"").trim());
      await upsertRoadmap(user.id, roadmap, { career:form.career, level:form.level, daily_time:form.time, goal:form.goal });
      const initProgress = { current_month:1, current_week:1, current_day:1, streak:0, completed_days:[], last_visit:new Date().toISOString().slice(0,10) };
      await upsertProgress(user.id, initProgress);
      onDone(roadmap, dbToProgress(initProgress));
    } catch(e) {
      // Timeout or parse error — use fallback immediately
      const fallback = buildFallback(form);
      await upsertRoadmap(user.id, fallback, { career:form.career, level:form.level, daily_time:form.time, goal:form.goal });
      const initProgress = { current_month:1, current_week:1, current_day:1, streak:0, completed_days:[], last_visit:new Date().toISOString().slice(0,10) };
      await upsertProgress(user.id, initProgress);
      onDone(fallback, dbToProgress(initProgress));
    }
    setLoading(false);
  };

  if (loading) return <RoadmapLoader />;

  const name = profile?.full_name || user?.user_metadata?.full_name || "there";

  return (
    <div className="page container" style={{paddingTop:60,paddingBottom:60}}>
      <div className="card" style={{maxWidth:540,margin:"0 auto"}}>
        <div style={{marginBottom:28}}>
          <h2>Hey {name}! 👋</h2>
          <p style={{color:"var(--mid)",fontSize:14,marginTop:4}}>Tell us a bit more so we can build the perfect roadmap for you.</p>
        </div>
        <div className="stack gap-20">
          <div className="field"><label>What do you want to learn or become?</label>
            <input
              placeholder="e.g. Web Developer, AI Engineer, Graphic Designer, Chess..."
              value={form.career}
              onChange={e=>set("career",e.target.value)}
            />
          </div>
          <div className="field"><label>Current skill level</label>
            <select value={form.level} onChange={e=>set("level",e.target.value)}>
              <option>Beginner</option><option>Intermediate</option>
            </select>
          </div>
          <div className="field"><label>Time available per day</label>
            <select value={form.time} onChange={e=>set("time",e.target.value)}>
              <option>1 hour</option><option>2 hours</option><option>3+ hours</option>
            </select>
          </div>
          <div className="field"><label>Main goal</label>
            <select value={form.goal} onChange={e=>set("goal",e.target.value)}>
              <option>Strong foundation</option><option>Job ready</option><option>Build projects</option>
            </select>
          </div>
          <button className="btn-primary" style={{marginTop:8}} onClick={generate}>Generate My Roadmap ✨</button>
        </div>
      </div>
    </div>
  );
}

function buildFallback(form) {
  const career = form.career || "your chosen field";

  // Career-specific themes
  const careerThemes = {
    entrepreneur: ["Business Foundations","Market Research & Validation","Building Your Product/Service","Marketing & Sales","Finance & Operations","Scaling & Growth"],
    business: ["Business Fundamentals","Strategy & Planning","Marketing & Branding","Sales & Revenue","Finance & Accounting","Leadership & Scaling"],
    coding: ["Programming Basics","Data Structures","Web Development","Databases & APIs","Projects & Portfolio","Job Preparation"],
    design: ["Design Principles","Color & Typography","UI Fundamentals","UX Research","Design Tools","Portfolio & Career"],
    marketing: ["Marketing Fundamentals","Content & SEO","Social Media","Email & Ads","Analytics & Data","Strategy & Growth"],
    chess: ["Chess Basics","Tactics & Puzzles","Opening Principles","Middlegame Strategy","Endgame Mastery","Tournament Preparation"],
    music: ["Music Theory Basics","Instrument Fundamentals","Scales & Chords","Composition","Production","Performance & Career"],
    art: ["Drawing Fundamentals","Color Theory","Digital Art","Illustration","Style Development","Portfolio & Career"],
  };

  // Find matching theme or use generic career-based one
  const lc = career.toLowerCase();
  let themes = null;
  for(const [key, val] of Object.entries(careerThemes)) {
    if(lc.includes(key)) { themes = val; break; }
  }
  if(!themes) {
    themes = [
      `${career} Fundamentals`,
      `Core ${career} Skills`,
      `${career} in Practice`,
      `Advanced ${career} Concepts`,
      `Real-world ${career} Projects`,
      `${career} Mastery & Career`
    ];
  }

  const weekTopics = {
    0: ["Getting Started","Core Basics","Key Concepts","First Project"],
    1: ["Deep Dive","Practical Skills","Real Examples","Week Review"],
    2: ["Advanced Topics","Case Studies","Hands-on Practice","Assessment"],
    3: ["Expert Techniques","Industry Insights","Build Something","Milestone Review"],
    4: ["Refinement","Problem Solving","Creative Application","Progress Check"],
    5: ["Mastery","Portfolio Work","Final Project","Graduation 🎓"],
  };

  return {
    title: `6-Month ${career} Roadmap`,
    months: themes.map((theme, mi) => ({
      month: mi+1, theme, focus: `Month ${mi+1}: ${theme}`,
      weeks: [1,2,3,4].map(wi => ({
        week: wi,
        goal: `${weekTopics[mi]?.[wi-1] || "Weekly Goals"} — ${theme}`,
        days: [1,2,3,4,5,6,7].map(di => ({
          day: di,
          task: di===7
            ? `Review & reflect on ${theme} 🌟`
            : `${theme}: Study sub-topic ${di} and practice`
        })),
        testTopic: theme,
      }))
    }))
  };
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function Dashboard({ user, roadmap, progress, onUpdateProgress, onNav }) {
  const { currentMonth=1, currentWeek=1, currentDay=1, streak=1, completedDays=[] } = progress;
  const totalDays = 180;
  const pct = Math.min(100, Math.round((completedDays.length / totalDays)*100));

  const month = roadmap.months[currentMonth-1];
  const week  = month?.weeks[currentWeek-1];
  const todayTask = week?.days[currentDay-1]?.task ?? "All caught up! Great job 🎉";

  const markDone = async () => {
    const key = `m${currentMonth}w${currentWeek}d${currentDay}`;
    if (completedDays.includes(key)) return;
    const newCompleted = [...completedDays, key];
    let nd=currentDay+1, nw=currentWeek, nm=currentMonth;
    if(nd>7){nd=1;nw++;}
    if(nw>4){nw=1;nm++;}
    if(nm>6) nm=6;
    const next = { ...progress, completedDays:newCompleted, streak:streak+1, currentDay:nd, currentWeek:nw, currentMonth:nm };
    await upsertProgress(user.id, progressToDb(next));
    onUpdateProgress(next);
  };

  return (
    <div className="page container" style={{paddingTop:40, paddingBottom:60}}>
      <div style={{marginBottom:32}}>
        <h2 style={{fontSize:28}}>Welcome back, {user.name}! 👋</h2>
        <p style={{color:"var(--mid)", marginTop:4}}>{roadmap.title}</p>
      </div>

      {/* stats row */}
      <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:16, marginBottom:28}}>
        <div className="card" style={{padding:20, textAlign:"center"}}>
          <div style={{fontSize:13,color:"var(--smoke)",marginBottom:4,fontWeight:600,letterSpacing:.5,textTransform:"uppercase"}}>Month</div>
          <div style={{fontSize:32,fontWeight:800,color:"var(--gold2)",fontFamily:"var(--font-display)"}}>{currentMonth}<span style={{fontSize:16}}>/6</span></div>
        </div>
        <div className="card" style={{padding:20, textAlign:"center"}}>
          <div style={{fontSize:13,color:"var(--smoke)",marginBottom:4,fontWeight:600,letterSpacing:.5,textTransform:"uppercase"}}>Week</div>
          <div style={{fontSize:32,fontWeight:800,color:"var(--gold2)",fontFamily:"var(--font-display)"}}>{currentWeek}<span style={{fontSize:16}}>/4</span></div>
        </div>
        <div className="streak" style={{padding:20, textAlign:"center"}}>
          <div style={{fontSize:13,marginBottom:4,fontWeight:600,letterSpacing:.5,textTransform:"uppercase"}}>🔥 Streak</div>
          <div style={{fontSize:32}}>{streak} days</div>
        </div>
        <div className="card" style={{padding:20, textAlign:"center"}}>
          <div style={{fontSize:13,color:"var(--smoke)",marginBottom:4,fontWeight:600,letterSpacing:.5,textTransform:"uppercase"}}>Progress</div>
          <div style={{fontSize:32,fontWeight:800,color:"var(--emerald)",fontFamily:"var(--font-display)"}}>{pct}%</div>
        </div>
      </div>

      {/* progress bar */}
      <div className="card" style={{marginBottom:20}}>
        <div className="row" style={{justifyContent:"space-between",marginBottom:10}}>
          <span style={{fontWeight:600}}>Overall Progress</span>
          <span style={{color:"var(--mid)",fontSize:14}}>{completedDays.length} / {totalDays} days</span>
        </div>
        <div className="progress-track"><div className="progress-fill" style={{width:`${pct}%`}}/></div>
      </div>

      {/* today's task */}
      <div className="card" style={{marginBottom:20, borderLeft:"4px solid var(--blue)"}}>
        <div className="pill" style={{marginBottom:12}}>📅 Today's Task — Day {currentDay}</div>
        <p style={{fontSize:17, lineHeight:1.6, marginBottom:20}}>{todayTask}</p>
        <div className="row gap-12">
          <button className="btn-primary" onClick={()=>onNav("learn")}>Start Learning →</button>
          <button className="btn-outline" onClick={markDone}>Mark Complete ✓</button>
        </div>
      </div>

      {/* weekly goal */}
      {week && (
        <div className="card">
          <h3 style={{marginBottom:8}}>🎯 Week {currentWeek} Goal</h3>
          <p style={{color:"var(--mid)",lineHeight:1.6,marginBottom:12}}>{week.goal}</p>
          <div className="row gap-8">
            <span className="pill">Test topic: {week.testTopic}</span>
            <button className="btn-outline" style={{padding:"6px 16px",fontSize:13}} onClick={()=>onNav("test")}>Take Test</button>
          </div>
        </div>
      )}
    </div>
  );
}


// ── LEARNING PAGE ─────────────────────────────────────────────────────────────
const PROFESSOR_SYSTEM = `You are Professor Max — the most beloved learning mentor for teenagers on the planet. You are the teacher every student wishes they had but never did.

PERSONALITY:
- Warm, funny, and genuinely excited about every subject you teach
- You speak like a cool older friend who happens to know everything — not a boring teacher
- You celebrate effort loudly and correct mistakes gently
- You never make a student feel stupid for not knowing something
- You make learning feel like the most exciting thing in the world

YOUR 4-STEP TEACHING METHOD:
1. HOOK: Start with a surprising story, shocking fact, or relatable scenario that grabs attention instantly
2. EXPLAIN: Break the concept down simply — like explaining to a smart younger sibling
3. CONNECT: Show exactly how this applies to their specific field and goal — make it REAL
4. ENERGIZE: End with something that makes them think "I need to try this right now!"

STRICT RULES — never break these:
- NEVER use examples from the wrong field. Entrepreneurship = business examples only. Art = drawing examples only. Chess = chess examples only. Zero cross-contamination.
- NEVER write like a textbook. If you catch yourself doing it, stop and rewrite.
- NEVER overwhelm. One concept at a time. Small bites only.
- ALWAYS speak directly to "you" — never "students" or "one should"
- Keep energy HIGH. The student should finish reading and immediately want to do something.
- Use humor that a 15-year-old would actually find funny — relatable, self-aware, never cringe
- Short paragraphs. White space. Easy to read.
- ZERO filler phrases like "Great question!" or "Certainly!" — just get straight to the good stuff.`;

function Learn({ progress, roadmap, onUpdateProgress, user }) {
  const { currentMonth=1, currentWeek=1, currentDay=1 } = progress;
  const month = roadmap.months[currentMonth-1];
  const week  = month?.weeks[currentWeek-1];
  const weekTopic = week?.goal ?? "Core Concepts";

  const [lectures, setLectures]       = useState(null);
  const [activeLecture, setActiveLecture] = useState(0);
  const [loading, setLoading]         = useState(false);
  const [doubt, setDoubt]             = useState("");
  const [answer, setAnswer]           = useState("");
  const [loadingDoubt, setLoadingDoubt] = useState(false);
  const [dayDone, setDayDone]         = useState(false);
  const [showTask, setShowTask]       = useState(false);
  const [taskSteps, setTaskSteps]     = useState({});
  const [taskSubmitted, setTaskSubmitted] = useState(false);
  const [taskFeedback, setTaskFeedback]   = useState("");
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [taskDoubt, setTaskDoubt]     = useState("");
  const [taskDoubtAnswer, setTaskDoubtAnswer] = useState("");
  const [loadingTaskDoubt, setLoadingTaskDoubt] = useState(false);

  useEffect(()=>{
    setLectures(null);
    setActiveLecture(0);
    setAnswer("");
    setDayDone(false);
    loadLectures();
  }, [currentMonth, currentWeek, currentDay]);

  const loadLectures = async () => {
    setLoading(true);

    // Career-specific sub-topics for fallback
    const careerSubTopics = {
      artist: ["Understanding Composition","Color Theory Basics","Line & Shape","Light & Shadow","Perspective Drawing","Texture & Pattern","Digital vs Traditional","Gesture Drawing","Portrait Fundamentals","Landscape Techniques","Abstract Expression","Mixed Media","Color Harmony","Developing Your Style","Building a Portfolio"],
      entrepreneur: ["What is Entrepreneurship?","Finding Your Idea","Market Research","Your Target Customer","Building an MVP","Pricing Your Product","Marketing Basics","Sales Fundamentals","Financial Planning","Building a Team","Customer Feedback","Growth Strategies","Handling Failure","Networking Skills","Pitching to Investors"],
      coding: ["Variables & Data Types","Control Flow","Functions","Arrays & Lists","Objects & Classes","Loops","Error Handling","APIs & Requests","Databases Basics","Version Control","Testing Your Code","Clean Code Principles","Algorithms Intro","Web Development Basics","Career in Tech"],
      chess: ["Board Setup & Rules","Pawn Structure","Piece Values","Opening Principles","Controlling the Center","Tactics: Forks","Tactics: Pins & Skewers","Tactics: Discovered Attacks","Endgame Basics","King Safety","Rook Endgames","Middlegame Planning","Positional Play","Studying Grandmaster Games","Tournament Preparation"],
      music: ["Music Theory Basics","Reading Sheet Music","Rhythm & Time Signatures","Scales & Keys","Chords & Harmony","Melody Writing","Song Structure","Ear Training","Instrument Technique","Recording Basics","Music Production","Genre Exploration","Performance Tips","Collaboration","Building Your Audience"],
    };

    let lc = roadmap.title.toLowerCase();
    let subTopics = null;
    for(const [key, val] of Object.entries(careerSubTopics)) {
      if(lc.includes(key)) { subTopics = val; break; }
    }
    if(!subTopics) {
      subTopics = Array.from({length:15}, (_,i) => `${weekTopic} — Part ${i+1}`);
    }

    // Try AI first
    let raw = "";
    try {
      raw = await askClaude([{role:"user", content:
`You are Professor Max teaching a personalised lesson for a student with this exact profile:
- Learning: "${roadmap.title}"
- This week's topic: "${weekTopic}"
- Month ${currentMonth} of 6, Week ${currentWeek} of 4

Generate 15 COMPLETELY DIFFERENT lectures covering 15 different sub-topics of "${weekTopic}".

PERSONALISATION RULES — these are non-negotiable:
1. Every single word must be relevant to "${roadmap.title}" — if it is entrepreneurship, all examples are startup/business. If art, all examples are about creating art. ZERO generic content.
2. Each lecture covers a DIFFERENT sub-topic — no two lectures can overlap
3. Start each lecture with a different type of hook: use stories, shocking stats, "what if" scenarios, famous examples, relatable teen situations — rotate these, never repeat the same opening style twice in a row
4. Body: 6-8 rich sentences. Teach the concept deeply but in a way that feels effortless to read. Use analogies from everyday teen life.
5. Language: funny, direct, zero filler, zero textbook language. Like a WhatsApp message from a genius friend.
6. Energy must stay HIGH across all 15 lectures — lecture 15 should feel as exciting as lecture 1
7. Lecture 15 gets a homework array with 3 specific, actionable tasks the student can do TODAY

Return ONLY valid JSON, no markdown:
{
  "lectures": [
    {
      "num": 1,
      "title": "Punchy title with emoji — specific to ${roadmap.title}",
      "body": "6-8 sentences. Different hook style. Specific to ${roadmap.title}. Funny. Deep. No filler.",
      "keyTakeaway": "One sentence that hits hard and sticks in memory.",
      "homework": null
    }
  ]
}
Generate all 15 now. Make each one feel like it was written specifically for someone learning ${roadmap.title}. Last lecture gets homework array.`
      }], PROFESSOR_SYSTEM, 4000);
    } catch(e) { raw = ""; }

    try {
      const data = JSON.parse(raw.replace(/```json|```/g,"").trim());
      if(data.lectures && data.lectures.length > 0) {
        setLectures(data.lectures);
        setLoading(false);
        return;
      }
    } catch { /* fall through to fallback */ }

    // Hardcoded brilliant unique lectures per career
    const careerLectures = {
      entrepreneur: [
        { num:1, title:"🔥 What IS an Entrepreneur, Really?", body:"Let me stop you right there — an entrepreneur is NOT someone who just 'starts a business.' That's like saying Einstein just 'did some math.' An entrepreneur is someone who spots a problem that annoys everyone, looks left and right to check if anyone solved it, and when nobody has — jumps in and builds the solution themselves. Think about it: every single product you use daily was created by someone who was just frustrated enough to stop complaining and start building. Uber started because Travis Kalanick couldn't get a taxi on a cold Paris night. WhatsApp started because Jan Koum hated paying SMS fees. The secret? Entrepreneurs don't wait for permission. They don't wait for the 'perfect time.' They start messy, learn fast, and figure it out along the way. That scrappy, stubborn, slightly-crazy energy? That's the fuel. Everything else — the business plans, the funding, the strategy — comes AFTER you decide you're going all in.", keyTakeaway:"An entrepreneur is a professional problem-solver who acts before they feel ready — because ready is a myth.", homework:null },
        { num:2, title:"💡 Finding Your Idea: Stop Brainstorming, Start Complaining", body:"Here's the most counterintuitive advice you'll ever hear about business ideas: STOP trying to think of ideas. Seriously. Put down the notebook. Close the 'million dollar ideas' spreadsheet. The best business ideas don't come from brainstorming sessions — they come from genuine frustration. Ask yourself: what makes you say 'why is this so difficult?' three times a week? That's your goldmine. Airbnb founders couldn't afford rent, so they rented out air mattresses in their apartment. Instagram started as a check-in app that was too complicated — they stripped it down to just photos. The pattern? Solve YOUR problem, and there's a 90% chance thousands of other people have the exact same problem. Your next task is dead simple: keep a 'frustration diary' for one week. Every time something annoys you, write it down. At the end of the week, look for patterns. One of those patterns is your business idea hiding in plain sight.", keyTakeaway:"The best business ideas aren't invented — they're discovered in your everyday frustrations.", homework:null },
        { num:3, title:"🧠 Market Research: Spy Like a Pro, Not a Stalker", body:"Most beginners skip market research because it sounds boring. BIG mistake. Skipping market research is like driving to a new city blindfolded and hoping you arrive at the right place. Market research is simply answering one question: 'Do real people actually want this, and will they pay for it?' You don't need expensive surveys or fancy tools. Go where your potential customers hang out — Reddit threads, YouTube comments, Amazon reviews (especially the 1-star ones!), Facebook groups, school hallways. Read what people complain about. Notice what they wish existed. Then — and this is the part most people skip — actually TALK to 10 real humans. Not your parents. Not your friends who'll say 'yeah great idea!' to be nice. Find strangers who match your target customer and ask: 'What's the hardest part about [your topic]?' Listen more than you talk. What they say will either confirm your idea or save you months of building the wrong thing.", keyTakeaway:"Market research isn't about proving your idea is good — it's about finding out the truth before it's too late.", homework:null },
        { num:4, title:"🎯 Your Target Customer: If Everyone is Your Customer, Nobody Is", body:"Imagine you're selling umbrellas. You could try to sell to everyone on Earth — after all, everyone gets rained on, right? Wrong strategy. The entrepreneur who wins is the one who sells specifically to 'busy London commuters who hate arriving at meetings with wet suits.' That's specific. That's powerful. That's a real person you can find, talk to, and market to. The fatal mistake new entrepreneurs make is trying to serve everyone — which means they end up serving no one well. When you try to appeal to a 45-year-old accountant AND a 16-year-old gamer at the same time, your message gets so watered down it connects with nobody. Pick ONE person. Give them a name, an age, a job, a daily routine, and a specific problem. Every decision you make — your product features, your pricing, your marketing — should be made with that one person in mind. Narrow focus = massive impact.", keyTakeaway:"The riches are in the niches — the more specific your target customer, the more powerfully you can serve them.", homework:null },
        { num:5, title:"🚀 Building an MVP: Done Beats Perfect Every Single Time", body:"MVP stands for Minimum Viable Product — and it might be the most important concept in entrepreneurship. Here's the philosophy: instead of spending 2 years building a perfect product in secret, you build the SMALLEST possible version that still solves the core problem, and you ship it to real users in weeks. Why? Because you don't actually know what customers want until you watch them use your product. You'll think feature X is crucial — and users will ignore it completely. You'll think feature Y is optional — and users will beg for it on day one. The faster you get something real into people's hands, the faster you learn what to fix, improve, or scrap. Dropbox didn't build the product first — they made a 3-minute demo video explaining the idea. 75,000 people signed up overnight. THAT was their MVP. Lesson: test the demand before you build the supply.", keyTakeaway:"Ship something imperfect to real users today — their feedback is worth more than 6 months of your assumptions.", homework:null },
        { num:6, title:"💰 Pricing: Why Cheap is Actually More Dangerous Than Expensive", body:"New entrepreneurs almost always make the same mistake: they price too low. They think 'if I charge less than everyone else, I'll get more customers!' This logic sounds smart but it's actually a trap. Here's why: when you price too low, customers assume your product is low quality. It's psychological — we associate price with value. A ₹50 haircut makes you nervous. A ₹500 haircut feels premium before you even sit down. Beyond psychology, low prices create a math problem: you have to sell MASSIVE volumes to make real money, which requires marketing budgets you don't have. The smarter approach is value-based pricing — charge based on what the result is WORTH to the customer, not what it costs you to make. If your product saves a business ₹1 lakh per month, charging ₹10,000/month is a no-brainer for them. Find the value you create, then price accordingly. Start higher than you're comfortable with — you can always lower it, but raising prices on existing customers is painful.", keyTakeaway:"Price based on the value you create, not the cost you incur — cheap prices repel serious customers.", homework:null },
        { num:7, title:"📣 Marketing Basics: Be So Useful, People Can't Ignore You", body:"Here's the dirty secret about marketing that nobody tells you: the best marketing doesn't feel like marketing at all. Think about the last time you shared something online — a funny video, a useful article, a mind-blowing fact. You didn't share it because someone paid you to. You shared it because it was genuinely valuable or entertaining. THAT is what great marketing does. For entrepreneurs with zero budget, content marketing is your superpower. Start a YouTube channel explaining your industry. Write posts that solve real problems your customers face. Share your journey — the wins AND the messy failures (people love authenticity). This builds trust over time, and trust converts to sales faster than any paid ad. The formula is simple: be so genuinely helpful that people feel stupid NOT buying from you. When you lead with value instead of 'buy my stuff,' something magical happens — people come to YOU.", keyTakeaway:"The best marketing is radical generosity — give away so much value that buying from you feels like the obvious next step.", homework:null },
        { num:8, title:"🤝 Sales: It's Not Manipulation — It's Matching Solutions to Problems", body:"The word 'sales' makes most people uncomfortable. We picture pushy car salespeople and telemarketing calls at dinner time. But real sales — ethical sales — is completely different. It's having a genuine conversation to figure out if what you're offering actually solves someone's real problem. That's it. The best salespeople aren't smooth talkers — they're great listeners. They ask questions like 'What's your biggest challenge with X right now?' and 'What have you already tried?' They listen carefully, and only then do they explain how their product helps — if it genuinely does. If it doesn't, great salespeople say so and move on. The most powerful sales technique ever discovered? Social proof. When potential customers see that OTHER people like them have bought and loved your product, their resistance drops immediately. Get your first 10 customers. Obsess over making them happy. Collect their testimonials. Then use those stories to sell to the next 100.", keyTakeaway:"Sales is about listening deeply, understanding the problem, and only then offering your solution — manipulation is for amateurs.", homework:null },
        { num:9, title:"📊 Financial Planning: The Boring Thing That Saves Every Business", body:"I know, I know — numbers. But stay with me for a second, because this lecture could literally be the difference between your business surviving and dying. Most startups don't fail because of bad ideas — they fail because they run out of cash. And they run out of cash because nobody was watching the numbers carefully. Financial planning for entrepreneurs comes down to three things: knowing your revenue (money coming in), your expenses (money going out), and your runway (how many months until you're broke if nothing changes). You don't need a fancy accounting degree. You need a simple spreadsheet that tracks these three numbers every single month. The magical metric every entrepreneur should know is their 'break-even point' — the exact number of sales you need to make to cover all your costs. Once you hit break-even, every sale after that is profit. Know this number the way you know your own phone number.", keyTakeaway:"You can have the greatest product in the world — but if you can't read your cash flow, you're flying blind into a mountain.", homework:null },
        { num:10, title:"👥 Building a Team: Hire People Smarter Than You (Your Ego Will Survive)", body:"The moment you realize you can't do everything alone is the moment your business can actually start growing. But hiring is genuinely hard — the wrong person doesn't just fail to help, they actively slow you down, drain your energy, and sometimes damage your reputation with customers. The first rule of hiring: never hire based on desperation. Hiring someone just because you're overwhelmed is how you end up with the wrong person in a critical role. Instead, get crystal clear on exactly what problem this person needs to solve. What does 'great' look like in this role? Hire for that specific outcome. The second rule: hire for attitude and train for skill. Skills can be taught. Work ethic, integrity, and genuine enthusiasm for what you're building? Those are almost impossible to teach. Your early team members will define your company's culture — the invisible rules of 'how we do things here.' Choose people who make the whole team better just by being in the room.", keyTakeaway:"Your team is your product — the right people will multiply your impact, the wrong ones will divide it.", homework:null },
        { num:11, title:"💬 Customer Feedback: The Uncomfortable Truth Is Your Best Friend", body:"Most entrepreneurs have a complicated relationship with feedback — they say they want it, but secretly hope everyone just says 'this is amazing!' That's completely human. And completely dangerous. The customers who tell you exactly what's broken, what's confusing, and what they wish was different? Those people are handing you a roadmap to a better product FOR FREE. Amazon's Jeff Bezos famously leaves one empty chair in every meeting — it represents the customer. Every decision gets filtered through: 'What would the customer think of this?' The best way to collect useful feedback isn't a generic 5-star survey. It's a conversation. Call your customers. Sit with them while they use your product. Watch where they hesitate, where they look confused, where they smile. Those moments of observation are worth ten thousand survey responses. And when you get harsh feedback — thank them. Genuinely. Because they cared enough to tell you instead of just quietly leaving.", keyTakeaway:"Brutal honest feedback from customers is a gift — it's the GPS rerouting you toward success.", homework:null },
        { num:12, title:"📈 Growth Strategies: How Small Businesses Become Big Ones", body:"Here's something that will genuinely surprise you: most businesses that scale to millions of users didn't get there through some secret growth hack or massive ad campaign. They got there by doing one thing absurdly well, for one specific group of people, until word spread naturally. Growth strategy starts with understanding WHY your current customers chose you. Survey them. Ask: 'Why did you pick us over the alternatives?' The answers will reveal your actual competitive advantage — which is often different from what you THINK it is. Once you know why people love you, you find more people exactly like them. This is called 'finding your growth channel' — the one or two ways of reaching new customers that work disproportionately well for your specific business. For some businesses it's content. For others, referrals. For others, partnerships. Test multiple channels small, double down on what works, ignore the rest.", keyTakeaway:"Sustainable growth comes from deeply understanding why your best customers love you, then finding more people exactly like them.", homework:null },
        { num:13, title:"💪 Handling Failure: Why Every Successful Entrepreneur Has a Failure Résumé", body:"Let's talk about the thing nobody puts in their Instagram highlight reel — failure. Specifically, why it's not just inevitable but actually NECESSARY. Walt Disney was fired from a newspaper for 'lacking imagination.' Steve Jobs was kicked out of Apple — the company he founded. Oprah Winfrey was told she was 'unfit for TV.' Every single entrepreneur you admire has a failure résumé longer than their success résumé. Here's what separates entrepreneurs who quit from those who make it: they treat failure as data, not identity. When something doesn't work, the question isn't 'am I bad at this?' — it's 'what did I learn, and what do I try differently next?' This reframe sounds simple but it's profoundly powerful. Your failures are not a sign that you should stop — they're tuition fees in the school of entrepreneurship. Every setback is teaching you something that will make your next attempt smarter, faster, and stronger.", keyTakeaway:"Failure isn't the opposite of success — it's the process through which success is built.", homework:null },
        { num:14, title:"🌐 Networking: It's Not About Collecting Contacts, It's About Genuine Connection", body:"The word 'networking' has a bad reputation — and honestly, it deserves it. The image of someone thrusting business cards at strangers at boring events while secretly scanning the room for someone more important? That's not networking. That's performance. Real networking is embarrassingly simple: be genuinely curious about other people, be helpful without expecting anything in return, and follow up when you say you will. That's 90% of it. Here's the counterintuitive truth: the most connected entrepreneurs don't network to GET — they network to GIVE. They make introductions. They share opportunities. They recommend others freely. And because of that generosity, people remember them, think of them first, and send opportunities their way without being asked. Your network right now — classmates, teachers, family friends, local business owners — is already a goldmine you haven't properly explored. Start there. One genuine conversation a week compounds into extraordinary opportunities over time.", keyTakeaway:"Your network is your net worth — but only if you build it on genuine generosity, not transaction.", homework:null },
        { num:15, title:"🎤 Pitching to Investors: Sell the Dream, Prove the Reality", body:"Walking into a room and asking someone to give you money for an idea is one of the most nerve-wracking things an entrepreneur does. But here's what most people get wrong about pitching: investors don't just fund ideas. They fund people. Specifically, they fund people who deeply understand a real problem, have evidence that their solution works, and possess the determination to push through every obstacle. A great pitch tells a story: it starts with the painful problem (make them FEEL it), introduces your elegant solution, shows proof that real people want it, explains how you make money, and ends with a clear ask. Practice your pitch until you can do it in your sleep. Know your numbers cold — market size, revenue, growth rate. When an investor asks a tough question, don't bluff. Saying 'I don't know yet but here's how I'll find out' is infinitely more credible than making something up. Confidence isn't about having all the answers — it's about proving you're the right person to find them.", keyTakeaway:"A great pitch isn't a sales presentation — it's a story that makes investors believe in both the opportunity AND the person in front of them.", homework:[
          "Write a one-page 'business concept' for YOUR idea: problem, solution, target customer, and how you'd make money",
          "Find 3 successful entrepreneurs who started young (under 20) and write down the key lessons from their story",
          "Practice the 60-second elevator pitch for your idea — record yourself on your phone and watch it back"
        ]}
      ],
      artist: [
        { num:1, title:"🎨 What is Composition? The Invisible Architecture of Every Great Artwork", body:"Before a single brush touches canvas, before a pencil makes a mark — the greatest artists in history were already making decisions. Where does the eye enter the painting? Where does it travel? Where does it rest? This invisible choreography is composition, and it is the single most powerful tool in your artistic arsenal. Think of composition as the floor plan of your artwork. A badly composed painting is like a house where the front door opens directly into a wall — technically everything is there, but it feels immediately wrong. The rule of thirds, leading lines, negative space, visual weight — these aren't rules meant to cage you, they're principles distilled from thousands of years of human visual psychology. Rembrandt used them. Picasso broke them deliberately (which only works when you know them first). Your eye naturally seeks harmony, balance, and a clear path through visual information. Learn to control that journey and you control how every viewer experiences your art.", keyTakeaway:"Composition is the silent director of every artwork — it determines what the viewer sees, feels, and remembers.", homework:null },
        { num:2, title:"🌈 Color Theory: Why Some Colors Make You Hungry and Others Make You Sad", body:"Did you know that McDonald's chose red and yellow very deliberately? Red triggers urgency and excitement. Yellow triggers happiness and hunger. Color is not decoration — color is communication, and artists who understand this speak a language that bypasses logic and hits emotion directly. The color wheel isn't just a pretty circle — it's a map of relationships. Complementary colors (opposite each other) create vibration and energy when placed together. Analogous colors (next to each other) create harmony and calm. Warm colors (reds, oranges, yellows) advance toward the viewer. Cool colors (blues, greens, purples) recede. Van Gogh's 'Starry Night' uses swirling blues and yellows not just because they look nice — the contrast creates that electric, almost anxious energy that makes you feel the night sky is alive. Every color choice in your art is a decision about emotion. Make those decisions on purpose, not by accident.", keyTakeaway:"Color is the emotional language of visual art — learn it fluently and you can make viewers feel anything you choose.", homework:null },
        { num:3, title:"✏️ Line & Shape: The DNA of Everything You'll Ever Draw", body:"Strip away color. Strip away texture. Strip away shading. What's left? Lines and shapes. These are the absolute atoms of visual art — every drawing, painting, sculpture, and design in the history of human creativity is built from these two primitives. But here's what art school doesn't always tell you: lines have personality. A thick, heavy line feels bold and confident. A thin, wavering line feels anxious or delicate. A perfectly straight line feels mechanical and cold. A loose, gestural line feels alive and spontaneous. The shapes you use carry meaning too — circles and curves feel soft, natural, and approachable; sharp angles and triangles feel aggressive, dynamic, and dangerous. When you look at corporate logos, notice how banks use solid squares (stability) while sports brands use diagonal swooshes (speed and energy). Start seeing the lines and shapes hiding inside everything around you — in architecture, in nature, in product design. This is how artists see the world differently from everyone else.", keyTakeaway:"Lines and shapes are the vocabulary of visual art — master them and you can express anything.", homework:null },
        { num:4, title:"☀️ Light & Shadow: The Cheat Code for Making Flat Things Look Real", body:"Here is the single technique that will make your drawings jump off the page overnight: learn how light and shadow actually work. The reason a drawing looks flat and amateurish is almost never the outline — it's the lack of convincing light. Light comes from a source. Everything it hits gets bright. Everything facing away from it falls into shadow. The transition between light and shadow — called the terminator line — is where the magic happens. But the really mind-bending part? Shadows aren't just dark. The darkest area of an object is actually NOT the part pointing directly away from the light — it's the area just before the reflected light bounces back in from surrounding surfaces. This reflected light in shadows is what makes drawings feel three-dimensional and alive. Study how light falls on everyday objects — put an apple on your desk, shine a lamp on it from one side, and study the shadow for 10 minutes. You will learn more in those 10 minutes than in hours of watching tutorials.", keyTakeaway:"Light is what creates the illusion of three-dimensional reality on a two-dimensional surface — master light and your art gains a soul.", homework:null },
        { num:5, title:"📐 Perspective Drawing: How to Make Your Brain Stop Lying to You", body:"Your brain is constantly lying to you about how things look. It knows that a table is rectangular, so it draws a rectangle — even though from your actual viewing angle, it's a trapezoid. This is called 'symbol drawing,' and it's the number one reason beginners' drawings look childlike. Perspective is the systematic set of rules that overrides your brain's assumptions and forces you to draw what your eyes actually see. One-point perspective (things vanish to a single horizon point) is how streets and corridors work. Two-point perspective is how the corners of buildings look. Three-point perspective adds the vertical vanishing point for extreme views from above or below. But here's the powerful insight behind all of it: perspective is about learning to see edges and angles as they actually appear, not as your brain assumes them to be. The artist's greatest skill isn't technical — it's perceptual. Learn to truly see, and the drawing becomes easy.", keyTakeaway:"Perspective isn't about following rules — it's about training your eyes to see reality instead of your brain's assumptions.", homework:null },
        { num:6, title:"🪵 Texture & Pattern: The Difference Between Art That Looks Right and Art You Want to Touch", body:"Close your eyes and imagine a painting of an old wooden door. You can practically feel the grain under your fingertips, the rough edges of peeling paint, the cold metal of the door handle. That feeling — the sensation of texture communicated through a completely flat surface — is one of art's greatest magic tricks. Texture in visual art works on two levels: actual texture (the physical surface of the artwork itself, built up with impasto paint, collage, or mark-making) and implied texture (the illusion of surface quality created through mark variation and shading techniques). The irony is that real masters of implied texture don't try to copy every tiny detail. They understand the visual language of a surface — the rhythm of wood grain, the geometry of brick, the randomness of grass — and they suggest that rhythm rather than laboriously recording it. Pattern, texture's cousin, creates rhythm across a surface. Learn to see texture as rhythm and pattern as repetition, and your artwork gains a tactile power that pulls viewers in.", keyTakeaway:"Texture gives art its physical believability — it's the difference between a painting you look at and one you want to reach into.", homework:null },
        { num:7, title:"💻 Digital vs Traditional Art: The Real Answer to the Wrong Question", body:"Every art forum has this argument: 'Is digital art real art?' It's the wrong question entirely, and here's why. A violin isn't more legitimate than a synthesizer. Oil paint isn't more valid than watercolor. These are tools — extraordinarily different tools with different strengths, different weaknesses, and different learning curves. Traditional art teaches you irreplaceable lessons: the physical resistance of paper, the way real pigments mix unexpectedly, the commitment of a mark you cannot undo. These constraints build discipline and decision-making that translates powerfully into any medium. Digital art offers infinite undos, perfect symmetry tools, pressure-sensitive brushes that simulate every traditional medium, and the ability to work at any scale without physical limitation. Professional artists today typically use both — they sketch traditionally because it feels more connected, they finish digitally because of the flexibility. The question isn't which is better. The question is: what are you trying to create, and which tool serves that vision best?", keyTakeaway:"Digital and traditional art are both legitimate — the best artists use whichever tool best serves their creative vision.", homework:null },
        { num:8, title:"🏃 Gesture Drawing: How to Capture Life in 30 Seconds", body:"Here's a drawing exercise so powerful that virtually every professional artist in the world — illustrators, animators, game artists, fine artists — practices it regularly: gesture drawing. The concept is almost violent in its simplicity. You draw a moving human figure in 30 to 120 seconds. Not the details. Not the clothes or face or fingers. Just the essential aliveness — the weight, the movement, the emotion of the pose. Gesture drawing forces you to find the LINE OF ACTION — the single curved line that captures the entire energy of a pose — before your brain starts worrying about anatomy and detail. Most beginners draw from their wrist. Gesture artists draw from their shoulder, making large, confident strokes that capture motion before it's overthought. Apps like Line of Action give you a new pose every 30-60 seconds. 20 minutes of daily gesture drawing will improve your drawing ability faster than almost anything else you can practice. It trains your hand-eye coordination, your sense of proportion, and your ability to see the whole before obsessing over parts.", keyTakeaway:"Gesture drawing trains you to capture the living essence of a subject — practice it daily and your art gains undeniable energy.", homework:null },
        { num:9, title:"👤 Portrait Fundamentals: Why Faces Are Both the Easiest and Hardest Thing to Draw", body:"Human beings are the most sophisticated face-recognition machines on Earth. We can detect when a face is 'slightly off' in milliseconds — which is exactly why portraits are so brutally unforgiving. And yet, portrait drawing rests on a surprisingly simple foundation: the proportions of the human face are remarkably consistent and learnable. Eyes sit at the halfway point of the head (not the top — most beginners draw them too high). The distance between the eyes equals one eye-width. The bottom of the nose sits halfway between the eyes and the chin. The mouth sits one-third of the way between nose and chin. These proportions work across virtually every adult human face regardless of ethnicity, age, or gender. But here's the paradox: learn the rules precisely, then forget them when you're drawing. The rules give you a foundation. What makes a portrait ALIVE is what deviates from the rules — the slight asymmetry, the particular shape of someone's specific eyes, the unique character of their mouth. That's where a portrait stops being a diagram and becomes a person.", keyTakeaway:"Portrait fundamentals give you the map — but capturing a real person requires seeing what makes them uniquely, specifically themselves.", homework:null },
        { num:10, title:"🌄 Landscape Techniques: Painting Space, Distance, and Atmosphere", body:"A landscape isn't a photograph of the outdoors — it's a constructed emotional experience. The greatest landscape painters weren't documenting locations; they were engineering feelings. Turner's stormy seas make you feel the terrifying power of nature. Monet's gardens make you feel the dreamy languor of a summer afternoon. Both used specific techniques to manufacture those emotional responses. The most powerful landscape tool is aerial perspective — the way atmosphere makes distant objects lighter, bluer, and less detailed than close objects. Your foreground should have the darkest darks, most saturated colors, and sharpest edges. Your background should be lighter, cooler, and softer. This gradient alone will create convincing depth. Another crucial technique: resist the urge to paint every leaf. The eye doesn't see every leaf — it sees masses of tone and color that suggest leaves. Simplify ruthlessly. Group shadows together. Let edges soften. The brain will fill in the details you leave out, and the result will paradoxically feel more real than painstaking detail.", keyTakeaway:"Great landscape art isn't about recording what you see — it's about distilling the emotional essence of a place.", homework:null },
        { num:11, title:"🌀 Abstract Expression: The Art of Saying Everything by Showing Nothing", body:"Abstract art confuses people who haven't been taught what it's actually doing. 'My five-year-old could paint that' is the classic dismissal — and it misunderstands abstraction completely. Abstract art isn't an absence of skill. It's a different application of skill — specifically, the skill of communicating emotion, energy, and idea through pure visual elements (color, shape, line, texture) without the crutch of recognizable subject matter. When Kandinsky painted chaotic swirls of color, he was literally trying to make visible music — to translate the emotional experience of sound into visual form. When Rothko created those vast fields of glowing color, he was engineering transcendence — multiple visitors to his chapel have reported crying without knowing why. The question abstract art asks isn't 'what does this look like?' It asks: 'what does this FEEL like?' As an artist, trying abstract work isn't abandoning skill — it's stripping away representation to discover whether your control of pure visual elements is strong enough to communicate without a recognizable subject.", keyTakeaway:"Abstract art is communication through pure visual emotion — it requires deep understanding of what each element does to a viewer's psychology.", homework:null },
        { num:12, title:"🖼️ Mixed Media: When the Rules Run Out, Everything Becomes a Tool", body:"At some point in every serious artist's journey, a single medium stops feeling like enough. The painting wants texture that paint can't provide. The drawing wants color that pencils can't capture. The collage wants drawn elements that paper scraps can't create. This is the moment mixed media was invented — not as a trend, but as a necessity. Mixed media simply means using more than one material or technique in a single artwork. Collage elements + paint + ink + texture paste + fabric. Photography + drawing + digital manipulation. Sculpture + video + sound. The combinations are literally infinite. What makes mixed media powerful isn't the novelty of combining things — it's the intentionality. Every material you add should add meaning, not just visual complexity. The torn newspaper in a portrait says something different than a smooth oil-painted background. The contrast IS the content. Start small: take a finished drawing and add one unexpected element. See what it changes. That experiment is the beginning of finding your own voice.", keyTakeaway:"Mixed media gives artists permission to use any material that serves the artwork — the medium becomes part of the message.", homework:null },
        { num:13, title:"🎭 Color Harmony: Why Some Color Combinations Feel Like Music and Others Like Noise", body:"Two colors can be individually beautiful and together catastrophic. Or individually unremarkable and together electric. Color harmony is the study of which combinations work — and more importantly, WHY they work. Complementary harmony (red + green, blue + orange, purple + yellow) creates maximum contrast and vibration — use it for energy, drama, and visual impact. Analogous harmony (red + orange + yellow) creates peaceful, natural transitions — use it for calm, cohesive, organic feelings. Triadic harmony uses three colors equally spaced around the color wheel — it creates richness and visual interest without the tension of complementary contrast. Split-complementary is a gentler version of complementary that uses a color plus the two colors adjacent to its complement — very sophisticated and hard to get wrong. But here's the advanced secret professional artists know: almost ANY color combination can work if you control the proportions correctly. 60% dominant color, 30% secondary, 10% accent — this ratio is a formula for visual harmony that works across virtually every style and subject.", keyTakeaway:"Color harmony isn't about which colors are 'allowed' together — it's about understanding the emotional relationship between colors and controlling their proportions.", homework:null },
        { num:14, title:"🦋 Developing Your Style: Stop Trying to Find It and Start Making Art", body:"Every art student asks this question: 'How do I develop my own style?' And the answer is deeply unsatisfying to hear but absolutely true: you can't find your style by looking for it. Your style develops naturally as a byproduct of making enormous amounts of art while being deeply influenced by artists you love. Here's the actual process: Study artists who excite you. Not casually — obsessively. Copy their work to understand HOW they achieve what they achieve. Then apply those techniques to subjects that genuinely fascinate YOU. Do this hundreds of times. Somewhere in that process, without you noticing, your own preferences, your own shortcuts, your own obsessions start to emerge consistently. That consistency IS your style. Picasso said 'good artists borrow, great artists steal' — meaning great artists don't just take surface qualities, they absorb underlying principles and rebuild them from the inside out. Your style will be an unintentional mashup of every artist you've deeply loved, filtered through your unique personality and perspective. Stop searching. Start making.", keyTakeaway:"Your artistic style isn't found — it emerges naturally from making massive amounts of art while deeply absorbing artists you love.", homework:null },
        { num:15, title:"🏆 Building a Portfolio: Your Art Speaks Before You Enter the Room", body:"A portfolio is not a collection of everything you've made — it's a curated argument for why you deserve the opportunity you're seeking. This distinction changes everything about how you approach building one. Every piece in your portfolio should be there because it demonstrates a specific skill, shows a specific range, or proves a specific point about you as an artist. One weak piece doesn't just fail to impress — it actively undermines confidence in everything else. The cold truth about portfolios: ten exceptional pieces beat fifty good ones every single time. Curate ruthlessly. Your portfolio should tell a story — ideally one that shows range (you can work in multiple styles), depth (you've gone beyond surface-level exploration), and personal vision (there's something distinctly YOU across the work). For digital portfolios, presentation quality matters as much as art quality. Clean photography, consistent sizing, professional layout — these signal that you take your work seriously. And always tailor your portfolio to the specific opportunity — an animation studio wants to see different things than a fine art gallery.", keyTakeaway:"A great portfolio isn't a collection — it's a curated argument that makes the opportunity-giver feel they'd be making a mistake not to choose you.", homework:[
          "Curate your 5 strongest existing pieces and write one sentence about what each one demonstrates about your skills",
          "Study the portfolios of 3 professional artists you admire and write down specifically what makes each portfolio compelling",
          "Create one new artwork this week that deliberately pushes beyond your comfort zone and experiments with a technique from this week's lectures"
        ]}
      ],
    };

    // Find matching career lectures
     lc = roadmap.title.toLowerCase();
    let hardcodedLectures = null;
    for(const [key, val] of Object.entries(careerLectures)) {
      if(lc.includes(key)) { hardcodedLectures = val; break; }
    }

    if(hardcodedLectures) {
      setLectures(hardcodedLectures);
      setLoading(false);
      return;
    }

    // Generic fallback for other careers
    const fallbackLectures = subTopics.map((topic, i) => ({
      num: i+1,
      title: `${["🎯","💡","🔥","⚡","🚀","🎨","🧠","💎","🌟","🎭","🏆","🎪","🔮","🌈","🎓"][i]} ${topic}`,
      body: `Here is something most people never tell you about ${topic}: the difference between someone who understands it and someone who does not is not intelligence — it is exposure and practice. ${topic} sits at the heart of what makes people genuinely great at ${roadmap.title}. The professionals at the top of this field did not get there by accident. They obsessed over exactly this concept until it became second nature. Think of ${topic} as a language — at first it feels foreign and awkward, but after enough immersion, you start thinking in it naturally without translating. The fastest way to accelerate your understanding is to find real examples of ${topic} in the world around you and ask: why does this work? What decisions were made here? What would happen if one thing changed? That analytical habit — seeing the craft inside the thing — is what separates a professional from an enthusiast.`,
      keyTakeaway: `${topic} is a foundational skill in ${roadmap.title} — invest deeply in understanding it and everything else in this field becomes clearer.`,
      homework: i === 14 ? [
        `Write a detailed one-page reflection on the most important thing you learned this week about ${roadmap.title}`,
        `Find a professional working in ${roadmap.title} and study their work — what decisions did they make that you can learn from?`,
        `Create or produce something tangible this week using what you have learned — however small, make it real`
      ] : null
    }));

    setLectures(fallbackLectures);
    setLoading(false);
  };

  const submitDoubt = async () => {
    if(!doubt.trim()) return;
    setLoadingDoubt(true);
    setAnswer("");
    try {
      const res = await askClaude([{role:"user", content:
        `STUDENT CONTEXT:
- Learning: "${roadmap.title}"
- Currently on: Month ${currentMonth}, Week ${currentWeek}
- This week's topic: "${weekTopic}"
- Their question: "${doubt}"

Answer this question as Professor Max. Rules:
- Get straight to the answer — no "great question!" filler
- Use one killer analogy specific to ${roadmap.title}
- Keep it under 180 words but make every word count
- End with one actionable thing they can do RIGHT NOW
- If their question is vague, answer the most useful interpretation of it`
      }], PROFESSOR_SYSTEM, 1000);
      if(res && res.trim().length > 10) {
        setAnswer(res);
      } else {
        setAnswer(`Great question about ${doubt}! Unfortunately my connection is a bit shaky right now. Try asking again in a moment — the Professor always has an answer! 🧙‍♂️`);
      }
    } catch(e) { 
      setAnswer("Hmm, my crystal ball is foggy right now! Check your internet connection and try again. 🔮");
    }
    setLoadingDoubt(false);
    setDoubt("");
  };

  const markDone = () => {
    setDayDone(true);
    if(onUpdateProgress) onUpdateProgress({ type:"complete_day" });
  };

  // Weekly practical tasks per career
  const getWeeklyTask = () => {
    const lc = roadmap.title.toLowerCase();
    if(lc.includes("entrepreneur")) return {
      title: "🚀 Build Your Business Concept",
      description: "You just learned 15 core entrepreneurship lessons. Now it's time to apply them. Build a real mini business concept using everything you've learned this week.",
      steps: [
        { id:"problem", label:"The Problem", prompt:"Describe a real problem you've personally experienced or noticed around you. Be specific — who has this problem, when does it happen, how often?", placeholder:"e.g. Students in my area have no affordable way to print school projects after 8pm..." },
        { id:"solution", label:"Your Solution", prompt:"What product or service would solve this problem? Describe it simply — what does it do, how does it work?", placeholder:"e.g. A 24/7 self-service print kiosk placed in residential areas near schools..." },
        { id:"customer", label:"Your Target Customer", prompt:"Describe your ideal customer in detail — their age, daily routine, why they'd pay for this, and how much they'd pay.", placeholder:"e.g. Students aged 14-22, parents of school-going kids, working late nights..." },
        { id:"money", label:"How You Make Money", prompt:"How does your business earn revenue? One-time purchase? Subscription? Per use? Estimate what you'd charge and why.", placeholder:"e.g. ₹5 per page, ₹20 per colour page. A student printing 10 pages weekly = ₹200/week per customer..." },
        { id:"edge", label:"Why You'll Win", prompt:"What makes your solution better than existing alternatives? What would make someone choose you over competitors?", placeholder:"e.g. No competitor offers 24/7 availability in residential areas. The nearest print shop closes at 7pm..." },
      ]
    };
    if(lc.includes("artist") || lc.includes("art")) return {
      title: "🎨 Create Your Concept Art Piece",
      description: "You've studied 15 core art fundamentals. Now design a complete artwork concept using the principles you've learned — composition, color, light, perspective, and your personal style.",
      steps: [
        { id:"concept", label:"The Concept", prompt:"What is your artwork about? What emotion, story, or idea do you want to communicate? What should the viewer FEEL when they look at it?", placeholder:"e.g. I want to show the loneliness of a city at night — the feeling of being surrounded by millions of people but completely alone..." },
        { id:"composition", label:"Composition Plan", prompt:"Describe how you'd arrange the elements. Where is the focal point? How does the eye travel through the piece? What's in the foreground, midground, background?", placeholder:"e.g. A lone figure at the bottom-left (rule of thirds), lit by a single streetlight. The eye travels up to massive dark buildings towering overhead..." },
        { id:"color", label:"Color Palette & Mood", prompt:"What colors will you use and why? How does your palette create the emotion you want? Describe the harmony (complementary, analogous, etc.)", placeholder:"e.g. Deep blues and purples for the night sky, with a single warm amber streetlight as the only warm tone — complementary contrast to make the light feel precious and isolated..." },
        { id:"light", label:"Light & Shadow", prompt:"Where is your light source? How do shadows fall? What areas will be brightest and darkest? How does light contribute to the mood?", placeholder:"e.g. Single point light source from the streetlamp above. Long dramatic shadows stretching away from the figure. Reflected cool light from wet pavement..." },
        { id:"style", label:"Style & Technique", prompt:"What medium or style would you use? What artists or techniques inspire this piece? What would make it distinctly YOURS?", placeholder:"e.g. Digital painting inspired by Edward Hopper's lonely cityscapes but with a more stylized, slightly surreal quality to the architecture..." },
      ]
    };
    if(lc.includes("cod") || lc.includes("program") || lc.includes("software") || lc.includes("developer")) return {
      title: "💻 Design Your Mini Project",
      description: "Apply your coding knowledge to design and outline a real mini project. Think through every layer — what it does, how it works, and how you'd build it.",
      steps: [
        { id:"idea", label:"Project Idea", prompt:"What app, tool, or website will you build? What problem does it solve for real users?", placeholder:"e.g. A habit tracker that sends motivational messages based on your streak length..." },
        { id:"features", label:"Core Features", prompt:"List the 3-5 most important features. What must it do to be useful? (Ignore nice-to-haves for now)", placeholder:"e.g. 1) Add/track daily habits 2) Visual streak counter 3) Daily reminder notification 4) Weekly progress chart..." },
        { id:"tech", label:"Tech Stack", prompt:"What languages, frameworks, and tools would you use? Why did you choose them?", placeholder:"e.g. React for frontend (I know it), Supabase for database (free tier), deployed on Vercel..." },
        { id:"data", label:"Data Structure", prompt:"What data does your app store? Describe the main data objects and what fields they have.", placeholder:"e.g. User: {id, name, email}. Habit: {id, user_id, name, color}. HabitLog: {id, habit_id, date, completed}..." },
        { id:"challenge", label:"Biggest Challenge", prompt:"What part of building this will be hardest? How would you approach solving it?", placeholder:"e.g. Sending notifications at the right time across timezones. I'd use a cron job service like Vercel cron + store user timezone in their profile..." },
      ]
    };
    // Generic fallback task
    return {
      title: `🎯 Apply Your ${roadmap.title} Knowledge`,
      description: `You've completed 15 lectures on ${weekTopic}. Now apply what you've learned by completing this practical exercise.`,
      steps: [
        { id:"learning", label:"Key Learnings", prompt:"What are the 3 most important things you learned from this week's 15 lectures? Explain each one in your own words.", placeholder:"Write your answer here..." },
        { id:"apply", label:"Real World Application", prompt:`Describe a specific real-world situation where you would apply what you learned about ${weekTopic}. Be as concrete as possible.`, placeholder:"Write your answer here..." },
        { id:"project", label:"Mini Project Plan", prompt:`Design a small project or exercise that would let you practice ${weekTopic} hands-on. What would you make? How would you do it?`, placeholder:"Write your answer here..." },
        { id:"challenge", label:"Your Biggest Challenge", prompt:"What part of this week's content was hardest to understand? What questions do you still have?", placeholder:"Write your answer here..." },
        { id:"next", label:"Next Steps", prompt:"Based on what you've learned, what do you want to explore deeper next? What specific skills do you want to build?", placeholder:"Write your answer here..." },
      ]
    };
  };

  const submitTask = async () => {
    const task = getWeeklyTask();
    const allAnswered = task.steps.every(s => taskSteps[s.id]?.trim().length > 10);
    if(!allAnswered) return;
    setLoadingFeedback(true);
    const submission = task.steps.map(s => `${s.label}: ${taskSteps[s.id]}`).join("\n\n");
    let fb = "Great work completing the task! Your submission shows real thinking and effort. Keep building on these foundations — the best way to truly learn is exactly what you just did: apply the knowledge to something real.";
    try {
      const res = await askClaude([{role:"user", content:
        `A student learning "${roadmap.title}" just completed their weekly practical task on "${weekTopic}". Here is their submission:\n\n${submission}\n\nGive them detailed, honest, encouraging feedback. Point out what they did well, what could be stronger, and 2-3 specific suggestions to improve. Be like a brilliant mentor — warm but direct. End with a motivating line. Around 200-250 words.`
      }], PROFESSOR_SYSTEM, 1200);
      if(res && res.trim().length > 20) fb = res;
    } catch { /* use default feedback */ }
    setTaskFeedback(fb);
    setTaskSubmitted(true);
    setLoadingFeedback(false);
    // Save to Supabase
    try {
      const weekKey = `m${currentMonth}w${currentWeek}`;
      await saveTaskSubmission(user.id, {
        weekKey,
        career: roadmap.title,
        taskTitle: task.title,
        answers: taskSteps,
        feedback: fb,
      });
    } catch(e) { console.warn("Could not save task to profile:", e); }
  };

  const submitTaskDoubt = async () => {
    if(!taskDoubt.trim()) return;
    setLoadingTaskDoubt(true);
    setTaskDoubtAnswer("");
    try {
      const task = getWeeklyTask();
      const context = task.steps.map(s => taskSteps[s.id] ? `${s.label}: ${taskSteps[s.id]}` : "").filter(Boolean).join("\n");
      const res = await askClaude([{role:"user", content:
        `A student is working on a practical task for "${roadmap.title}" (topic: "${weekTopic}"). Here is what they've written so far:\n${context}\n\nThey are stuck and ask: "${taskDoubt}"\n\nHelp them directly and specifically. Give them a concrete example or direction they can act on immediately. Be the brilliant mentor they need right now.`
      }], PROFESSOR_SYSTEM, 1000);
      setTaskDoubtAnswer(res || "Great question! Think about it from first principles — what does your target audience actually need? Start with that and the answer will become clearer. 💡");
    } catch {
      setTaskDoubtAnswer("Good question! Think about what you've learned in the lectures and apply those principles directly to this task. If you're still stuck, try breaking the question into smaller parts. 💡");
    }
    setLoadingTaskDoubt(false);
    setTaskDoubt("");
  };

  if(loading) return (
    <div style={{textAlign:"center",padding:"80px 20px"}}>
      <div style={{fontSize:56,marginBottom:16}}>🧙‍♂️</div>
      <div className="dots"><span/><span/><span/></div>
      <p style={{color:"var(--smoke)",marginTop:16,fontStyle:"italic"}}>
        "Preparing 15 lectures on {weekTopic}… polishing the whiteboard…"
      </p>
    </div>
  );

  return (
    <div className="page container" style={{paddingTop:24,paddingBottom:60}}>

      {/* Header */}
      <div style={{
        background:"linear-gradient(135deg,var(--ink),#1A1A2E)",
        borderRadius:16, padding:"20px 24px", marginBottom:24,
        borderLeft:"4px solid var(--gold)"
      }}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:8}}>
          <span className="pill">Month {currentMonth}</span>
          <span className="pill">Week {currentWeek}</span>
          <span className="pill">Day {currentDay}</span>
          <span className="pill" style={{background:"var(--gold)",color:"var(--ink)"}}>🧙‍♂️ PROF. CODEWIZARD</span>
        </div>
        <h2 style={{color:"#fff",fontSize:20,marginBottom:4}}>This Week: {weekTopic}</h2>
        <p style={{color:"rgba(255,255,255,0.6)",fontSize:13}}>15 lectures • Read at your own pace</p>
      </div>

      {/* Lecture list + active lecture */}
      {lectures && (
        <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>

          {/* Sidebar: lecture list */}
          <div style={{width:"100%",maxWidth:280,flexShrink:0}}>
            <div className="card" style={{padding:12}}>
              <p style={{fontWeight:700,fontSize:13,marginBottom:10,color:"var(--smoke)",textTransform:"uppercase",letterSpacing:1}}>
                📋 15 Lectures
              </p>
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {lectures.map((l,i)=>(
                  <button key={i} onClick={()=>setActiveLecture(i)} style={{
                    textAlign:"left", padding:"8px 12px", borderRadius:8,
                    border: i===activeLecture ? "1.5px solid var(--gold)" : "1.5px solid var(--pearl)",
                    background: i===activeLecture ? "var(--gold-light)" : "transparent",
                    cursor:"pointer", fontSize:13, fontWeight: i===activeLecture ? 700 : 400,
                    color: i===activeLecture ? "var(--ink)" : "var(--smoke)",
                    transition:"all .2s"
                  }}>
                    {i+1}. {l.title}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Main: active lecture */}
          <div style={{flex:1,minWidth:280}}>
            <div className="card">
              <div style={{
                display:"flex",alignItems:"center",gap:12,marginBottom:20,
                paddingBottom:16,borderBottom:"1px solid var(--pearl)"
              }}>
                <div style={{
                  width:40,height:40,borderRadius:"50%",
                  background:"linear-gradient(135deg,var(--gold-light),var(--gold))",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontWeight:800,fontSize:16,flexShrink:0
                }}>{activeLecture+1}</div>
                <h2 style={{fontSize:20,lineHeight:1.3}}>{lectures[activeLecture].title}</h2>
              </div>

              <p style={{fontSize:16,lineHeight:1.85,marginBottom:20,color:"var(--ink)"}}>
                {lectures[activeLecture].body}
              </p>

              <div style={{
                background:"linear-gradient(135deg,var(--gold-light),#FFF8E7)",
                border:"1.5px solid var(--gold)",borderRadius:12,
                padding:"14px 18px",marginBottom:20
              }}>
                <p style={{fontSize:12,fontWeight:700,color:"var(--gold2)",textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>
                  ⚡ Key Takeaway
                </p>
                <p style={{fontSize:15,fontWeight:600,color:"var(--ink)"}}>
                  {lectures[activeLecture].keyTakeaway}
                </p>
              </div>

              {/* Homework — only on last lecture */}
              {lectures[activeLecture].homework && (
                <div style={{
                  background:"linear-gradient(135deg,#F0FDF4,#DCFCE7)",
                  border:"2px solid #86EFAC",borderRadius:14,
                  padding:"18px 20px",marginBottom:20
                }}>
                  <p style={{fontSize:13,fontWeight:700,color:"#16A34A",textTransform:"uppercase",letterSpacing:1,marginBottom:12}}>
                    📝 Homework — Complete Before Next Week
                  </p>
                  {lectures[activeLecture].homework.map((task, i) => (
                    <div key={i} style={{
                      display:"flex",gap:12,alignItems:"flex-start",
                      marginBottom: i < lectures[activeLecture].homework.length-1 ? 12 : 0
                    }}>
                      <div style={{
                        width:26,height:26,borderRadius:"50%",
                        background:"#16A34A",color:"#fff",
                        display:"flex",alignItems:"center",justifyContent:"center",
                        fontWeight:800,fontSize:13,flexShrink:0
                      }}>{i+1}</div>
                      <p style={{fontSize:15,lineHeight:1.6,color:"var(--ink)",margin:0}}>{task}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Navigation */}
              <div style={{display:"flex",gap:10,justifyContent:"space-between"}}>
                <button className="btn-outline" onClick={()=>setActiveLecture(a=>Math.max(0,a-1))}
                  disabled={activeLecture===0} style={{flex:1}}>
                  ← Previous
                </button>
                {activeLecture < lectures.length-1 ? (
                  <button className="btn-primary" onClick={()=>setActiveLecture(a=>a+1)} style={{flex:1}}>
                    Next Lecture →
                  </button>
                ) : (
                  <button className="btn-primary" onClick={()=>{ markDone(); setShowTask(true); window.scrollTo({top: document.body.scrollHeight, behavior:'smooth'}); }}
                    disabled={dayDone} style={{flex:1, background: dayDone ? "var(--emerald)" : "linear-gradient(135deg,#7C3AED,#5B21B6)"}}>
                    {dayDone ? "✅ Lectures Done! Scroll Down for Task 👇" : "🎯 Complete Lectures & Start Task"}
                  </button>
                )}
              </div>
            </div>

            {/* Progress bar */}
            <div style={{marginTop:12,marginBottom:24}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"var(--mist)",marginBottom:6}}>
                <span>Progress</span>
                <span>{activeLecture+1} / {lectures.length}</span>
              </div>
              <div style={{background:"var(--pearl)",borderRadius:999,height:6}}>
                <div style={{
                  height:"100%",borderRadius:999,
                  background:"linear-gradient(90deg,var(--gold),#E8C97A)",
                  width:`${((activeLecture+1)/lectures.length)*100}%`,
                  transition:"width .3s ease"
                }}/>
              </div>
            </div>

            {/* Ask Professor */}
            <div className="card" style={{borderTop:"3px solid var(--gold)"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                <span style={{fontSize:24}}>🧙‍♂️</span>
                <h3>Ask Professor CodeWizard</h3>
              </div>
              <p style={{color:"var(--smoke)",fontSize:13,marginBottom:14,fontStyle:"italic"}}>
                "There are no stupid questions. Only questions that haven't been asked yet." — Prof. CodeWizard
              </p>
              <textarea
                placeholder={`e.g. I don't understand how ${weekTopic} works in real life...`}
                value={doubt}
                onChange={e=>setDoubt(e.target.value)}
                style={{width:"100%",minHeight:90,padding:12,borderRadius:10,border:"1.5px solid var(--pearl)",fontSize:14,resize:"vertical",boxSizing:"border-box"}}
              />
              <button className="btn-primary" onClick={submitDoubt} disabled={loadingDoubt||!doubt.trim()} style={{marginTop:10}}>
                {loadingDoubt?"Professor is thinking… 🤔":"Ask the Professor 🧙‍♂️"}
              </button>
              {loadingDoubt && (
                <div style={{textAlign:"center",marginTop:20}}>
                  <div className="dots"><span/><span/><span/></div>
                </div>
              )}
              {answer && (
                <div style={{
                  marginTop:16,background:"linear-gradient(135deg,#F0F9FF,#E0F2FE)",
                  border:"1.5px solid #BAE6FD",borderLeft:"5px solid var(--blue)",
                  borderRadius:14,padding:"16px 20px",lineHeight:1.85,
                  whiteSpace:"pre-wrap",fontSize:15
                }}>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--blue)",marginBottom:8,textTransform:"uppercase",letterSpacing:1}}>
                    🧙‍♂️ Professor CodeWizard Replies:
                  </div>
                  {answer}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── WEEKLY PRACTICAL TASK ── */}
      {showTask && lectures && (() => {
        const task = getWeeklyTask();
        return (
          <div style={{marginTop:32}} id="weekly-task">
            {/* Task header */}
            <div style={{
              background:"linear-gradient(135deg,#4C1D95,#7C3AED)",
              borderRadius:16, padding:"24px 28px", marginBottom:24,
              borderLeft:"4px solid #A78BFA"
            }}>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
                <span className="pill" style={{background:"#7C3AED",color:"#fff"}}>🎯 WEEKLY TASK</span>
                <span className="pill" style={{background:"#A78BFA",color:"#fff"}}>Based on all 15 lectures</span>
              </div>
              <h2 style={{color:"#fff",fontSize:22,marginBottom:8}}>{task.title}</h2>
              <p style={{color:"rgba(255,255,255,0.75)",fontSize:14,lineHeight:1.6}}>{task.description}</p>
            </div>

            {!taskSubmitted ? (
              <div style={{display:"flex",flexDirection:"column",gap:20}}>
                {task.steps.map((step, si) => (
                  <div key={step.id} className="card" style={{borderLeft:`4px solid ${["#7C3AED","#2563EB","#059669","#D97706","#DC2626"][si]}`}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                      <div style={{
                        width:32,height:32,borderRadius:"50%",flexShrink:0,
                        background:`${["#7C3AED","#2563EB","#059669","#D97706","#DC2626"][si]}`,
                        color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",
                        fontWeight:800,fontSize:14
                      }}>{si+1}</div>
                      <h3 style={{fontSize:17}}>{step.label}</h3>
                    </div>
                    <p style={{color:"var(--smoke)",fontSize:14,marginBottom:12,lineHeight:1.6,fontStyle:"italic"}}>
                      {step.prompt}
                    </p>
                    <textarea
                      value={taskSteps[step.id] || ""}
                      onChange={e => setTaskSteps(prev => ({...prev, [step.id]: e.target.value}))}
                      placeholder={step.placeholder}
                      style={{
                        width:"100%", minHeight:110, padding:"12px 14px",
                        borderRadius:10, border:`1.5px solid ${taskSteps[step.id]?.trim().length > 10 ? "#10B981" : "var(--pearl)"}`,
                        fontSize:14, resize:"vertical", boxSizing:"border-box",
                        lineHeight:1.7, color:"var(--ink)", background:"var(--paper)",
                        transition:"border-color .2s"
                      }}
                    />
                    {taskSteps[step.id]?.trim().length > 10 && (
                      <p style={{color:"#10B981",fontSize:12,marginTop:4,fontWeight:600}}>✓ Great answer!</p>
                    )}
                  </div>
                ))}

                {/* Task Ask Professor */}
                <div className="card" style={{borderTop:"3px solid #7C3AED"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                    <span style={{fontSize:22}}>🧙‍♂️</span>
                    <h3>Stuck on the task? Ask Professor CodeWizard</h3>
                  </div>
                  <p style={{color:"var(--smoke)",fontSize:13,marginBottom:12,fontStyle:"italic"}}>
                    Describe exactly where you're stuck — the Professor will guide you without giving away the answer.
                  </p>
                  <textarea
                    value={taskDoubt}
                    onChange={e => setTaskDoubt(e.target.value)}
                    placeholder="e.g. I'm stuck on step 2 — I don't know how to identify my target customer..."
                    style={{width:"100%",minHeight:80,padding:"10px 12px",borderRadius:10,border:"1.5px solid var(--pearl)",fontSize:14,resize:"vertical",boxSizing:"border-box"}}
                  />
                  <button className="btn-primary" onClick={submitTaskDoubt} disabled={loadingTaskDoubt||!taskDoubt.trim()}
                    style={{marginTop:10,background:"linear-gradient(135deg,#7C3AED,#5B21B6)"}}>
                    {loadingTaskDoubt ? "Professor is thinking… 🤔" : "Get Help from Professor 🧙‍♂️"}
                  </button>
                  {loadingTaskDoubt && <div className="dots" style={{marginTop:12}}><span/><span/><span/></div>}
                  {taskDoubtAnswer && (
                    <div style={{
                      marginTop:14,background:"linear-gradient(135deg,#F5F3FF,#EDE9FE)",
                      border:"1.5px solid #A78BFA",borderLeft:"5px solid #7C3AED",
                      borderRadius:12,padding:"14px 18px",lineHeight:1.85,
                      whiteSpace:"pre-wrap",fontSize:15
                    }}>
                      <div style={{fontSize:11,fontWeight:700,color:"#7C3AED",marginBottom:8,textTransform:"uppercase",letterSpacing:1}}>
                        🧙‍♂️ Professor's Guidance:
                      </div>
                      {taskDoubtAnswer}
                    </div>
                  )}
                </div>

                {/* Submit button */}
                <button
                  className="btn-primary"
                  onClick={submitTask}
                  disabled={loadingFeedback || !task.steps.every(s => taskSteps[s.id]?.trim().length > 10)}
                  style={{
                    width:"100%", padding:"16px", fontSize:17, fontWeight:700,
                    background: task.steps.every(s => taskSteps[s.id]?.trim().length > 10)
                      ? "linear-gradient(135deg,#7C3AED,#5B21B6)"
                      : "var(--pearl)",
                    color: task.steps.every(s => taskSteps[s.id]?.trim().length > 10) ? "#fff" : "var(--smoke)",
                    borderRadius:14, transition:"all .2s"
                  }}>
                  {loadingFeedback ? "Professor is reviewing your work… 🧙‍♂️" : "Submit Task for AI Feedback 🚀"}
                </button>
                {!task.steps.every(s => taskSteps[s.id]?.trim().length > 10) && (
                  <p style={{textAlign:"center",color:"var(--smoke)",fontSize:13,marginTop:-12}}>
                    Complete all {task.steps.length} steps to submit
                  </p>
                )}
              </div>
            ) : (
              // Feedback view
              <div className="card" style={{borderTop:"4px solid #7C3AED"}}>
                <div style={{textAlign:"center",marginBottom:24}}>
                  <div style={{fontSize:56,marginBottom:8}}>🏆</div>
                  <h2 style={{fontSize:22,marginBottom:4}}>Task Complete!</h2>
                  <p style={{color:"var(--smoke)"}}>Here's Professor CodeWizard's feedback on your work</p>
                </div>
                {loadingFeedback ? (
                  <div style={{textAlign:"center",padding:40}}>
                    <div className="dots"><span/><span/><span/></div>
                    <p style={{color:"var(--smoke)",marginTop:12,fontStyle:"italic"}}>Reviewing your submission carefully…</p>
                  </div>
                ) : (
                  <div style={{
                    background:"linear-gradient(135deg,#F5F3FF,#EDE9FE)",
                    border:"1.5px solid #A78BFA",borderLeft:"5px solid #7C3AED",
                    borderRadius:14,padding:"20px 24px",lineHeight:1.9,
                    whiteSpace:"pre-wrap",fontSize:15,marginBottom:20
                  }}>
                    <div style={{fontSize:11,fontWeight:700,color:"#7C3AED",marginBottom:10,textTransform:"uppercase",letterSpacing:1}}>
                      🧙‍♂️ Professor CodeWizard's Feedback:
                    </div>
                    {taskFeedback}
                  </div>
                )}
                {/* Show their answers */}
                <h3 style={{marginBottom:16,color:"var(--smoke)",fontSize:15,fontWeight:600}}>📋 Your Submission:</h3>
                {task.steps.map((step,si) => (
                  <div key={step.id} style={{marginBottom:14,paddingBottom:14,borderBottom:si<task.steps.length-1?"1px solid var(--pearl)":"none"}}>
                    <p style={{fontWeight:700,fontSize:13,color:"#7C3AED",marginBottom:4}}>{step.label}</p>
                    <p style={{fontSize:14,color:"var(--ink)",lineHeight:1.7}}>{taskSteps[step.id]}</p>
                  </div>
                ))}
                <button className="btn-outline" style={{width:"100%",marginTop:8}} onClick={()=>{setTaskSubmitted(false);setTaskFeedback("");}}>
                  Revise & Resubmit ✏️
                </button>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}


// ── WEEKLY TEST ───────────────────────────────────────────────────────────────
function WeeklyTest({ progress, roadmap }) {
  const { currentWeek=1, currentMonth=1 } = progress;
  const month = roadmap.months[currentMonth-1];
  const week  = month?.weeks[currentWeek-1];
  const topic = week?.testTopic ?? week?.goal ?? "Core Concepts";

  const [questions, setQuestions] = useState(null);
  const [loading, setLoading]     = useState(false);
  const [answers, setAnswers]     = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore]         = useState(0);
  const [currentQ, setCurrentQ]   = useState(0);

  const loadTest = async () => {
    setLoading(true);
    setSubmitted(false);
    setAnswers({});
    setCurrentQ(0);

    // Generate 50 questions in 2 batches of 25 to avoid token limits
    let allQuestions = [];
    try {
      const makePrompt = (batch) => `You are creating a weekly test for a student learning "${roadmap.title}".
Week topic: "${topic}" | Batch ${batch} of 2 (make these 25 questions DIFFERENT from batch ${batch===1?2:1})

Generate 25 multiple choice questions. STRICT RULES:
1. ALL questions must be 100% specific to "${roadmap.title}" — if entrepreneurship, ask about real business concepts. If art, ask about real art techniques. ZERO generic questions.
2. Mix difficulty: 8 easy (builds confidence), 12 medium (tests real understanding), 5 hard (separates good from great)
3. Questions should test UNDERSTANDING, not just memory — ask "why" and "how" not just "what"
4. Options must be plausible — wrong answers should be common misconceptions, not obviously silly
5. Explanations must be clear, friendly, and teach something even if the student got it right
6. Write in a tone a smart 15-year-old would enjoy — engaging, not dry

Return ONLY valid JSON (no markdown):
{
  "questions": [
    {
      "q": "Specific question about ${roadmap.title}?",
      "options": ["A) plausible option","B) plausible option","C) plausible option","D) plausible option"],
      "answer": "A",
      "explanation": "Clear friendly explanation that teaches something"
    }
  ]
}`;

      const [raw1, raw2] = await Promise.all([
        askClaude([{role:"user",content:makePrompt(1)}], "", 3000),
        askClaude([{role:"user",content:makePrompt(2)}], "", 3000),
      ]);

      const d1 = JSON.parse(raw1.replace(/```json|```/g,"").trim());
      const d2 = JSON.parse(raw2.replace(/```json|```/g,"").trim());
      allQuestions = [...d1.questions, ...d2.questions].slice(0, 50);
    } catch {
      // Fallback 50 questions
      allQuestions = Array.from({length:50}, (_,i) => ({
        q: `Question ${i+1}: What is an important concept in ${topic}?`,
        options: ["A) Option A","B) Option B","C) Option C","D) Option D"],
        answer: "A",
        explanation: `This is a key concept in ${topic}. Keep studying and you'll master it!`
      }));
    }
    setQuestions(allQuestions);
    setLoading(false);
  };

  const submit = () => {
    let s = 0;
    questions.forEach((q,i) => { if(answers[i]===q.answer) s++; });
    setScore(s);
    setSubmitted(true);
    setCurrentQ(0);
  };

  const pct = questions ? Math.round((Object.keys(answers).length / questions.length)*100) : 0;

  return (
    <div className="page container" style={{paddingTop:24,paddingBottom:60}}>

      <div style={{
        background:"linear-gradient(135deg,var(--ink),#1A1A2E)",
        borderRadius:16,padding:"20px 24px",marginBottom:24,
        borderLeft:"4px solid var(--gold)"
      }}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:8}}>
          <span className="pill">Month {currentMonth}</span>
          <span className="pill">Week {currentWeek}</span>
          <span className="pill" style={{background:"var(--gold)",color:"var(--ink)"}}>📝 50 Questions</span>
        </div>
        <h2 style={{color:"#fff",fontSize:20,marginBottom:4}}>Weekly Test: {topic}</h2>
        <p style={{color:"rgba(255,255,255,0.6)",fontSize:13}}>Test your knowledge across all 15 sub-topics</p>
      </div>

      {!questions && !loading && (
        <div style={{textAlign:"center",padding:"60px 20px"}}>
          <div style={{fontSize:64,marginBottom:16}}>📝</div>
          <h2 style={{marginBottom:8}}>Ready for your weekly test?</h2>
          <p style={{color:"var(--smoke)",marginBottom:24,maxWidth:400,margin:"0 auto 24px"}}>
            50 questions covering everything from this week. Take your time — there's no timer!
          </p>
          <button className="btn-primary" style={{fontSize:16,padding:"14px 32px"}} onClick={loadTest}>
            Start 50-Question Test 🚀
          </button>
        </div>
      )}

      {loading && (
        <div style={{textAlign:"center",padding:"80px 20px"}}>
          <div style={{fontSize:56,marginBottom:16}}>🧠</div>
          <div className="dots"><span/><span/><span/></div>
          <p style={{color:"var(--smoke)",marginTop:16,fontStyle:"italic"}}>
            Generating 50 questions on {topic}… this takes about 20 seconds…
          </p>
        </div>
      )}

      {questions && !submitted && (
        <div>
          {/* Progress */}
          <div className="card" style={{marginBottom:16,padding:"14px 20px"}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:8}}>
              <span style={{fontWeight:600}}>Question {currentQ+1} of {questions.length}</span>
              <span style={{color:"var(--gold2)",fontWeight:700}}>{Object.keys(answers).length} answered</span>
            </div>
            <div style={{background:"var(--pearl)",borderRadius:999,height:8}}>
              <div style={{
                height:"100%",borderRadius:999,
                background:"linear-gradient(90deg,var(--gold),#E8C97A)",
                width:`${pct}%`,transition:"width .3s"
              }}/>
            </div>
          </div>

          {/* Question navigator */}
          <div className="card" style={{marginBottom:16,padding:"14px 20px"}}>
            <p style={{fontSize:12,fontWeight:700,color:"var(--smoke)",textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>
              Jump to question:
            </p>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {questions.map((_,i)=>(
                <button key={i} onClick={()=>setCurrentQ(i)} style={{
                  width:32,height:32,borderRadius:8,border:"1.5px solid",
                  borderColor: i===currentQ ? "var(--gold)" : answers[i] ? "var(--emerald)" : "var(--pearl)",
                  background: i===currentQ ? "var(--gold)" : answers[i] ? "#ECFDF5" : "transparent",
                  color: i===currentQ ? "var(--ink)" : answers[i] ? "var(--emerald)" : "var(--smoke)",
                  fontWeight:700,fontSize:11,cursor:"pointer"
                }}>{i+1}</button>
              ))}
            </div>
          </div>

          {/* Current question */}
          <div className="card" style={{marginBottom:16}}>
            <p style={{fontSize:12,fontWeight:700,color:"var(--gold2)",textTransform:"uppercase",letterSpacing:1,marginBottom:12}}>
              Question {currentQ+1}
            </p>
            <p style={{fontSize:17,fontWeight:600,lineHeight:1.6,marginBottom:20}}>
              {questions[currentQ].q}
            </p>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {questions[currentQ].options.map((opt,j)=>{
                const letter = ["A","B","C","D"][j];
                const selected = answers[currentQ]===letter;
                return (
                  <button key={j} onClick={()=>setAnswers(a=>({...a,[currentQ]:letter}))} style={{
                    textAlign:"left",padding:"12px 16px",borderRadius:12,
                    border: selected ? "2px solid var(--gold)" : "1.5px solid var(--pearl)",
                    background: selected ? "var(--gold-light)" : "var(--paper)",
                    cursor:"pointer",fontSize:15,fontWeight:selected?700:400,
                    transition:"all .15s"
                  }}>
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Navigation */}
          <div style={{display:"flex",gap:10}}>
            <button className="btn-outline" onClick={()=>setCurrentQ(q=>Math.max(0,q-1))} disabled={currentQ===0} style={{flex:1}}>
              ← Previous
            </button>
            {currentQ < questions.length-1 ? (
              <button className="btn-primary" onClick={()=>setCurrentQ(q=>q+1)} style={{flex:1}}>
                Next →
              </button>
            ) : (
              <button className="btn-primary" onClick={submit}
                disabled={Object.keys(answers).length < questions.length}
                style={{flex:1,background:"var(--emerald)"}}>
                Submit All 50 ✓
              </button>
            )}
          </div>
          {Object.keys(answers).length < questions.length && currentQ===questions.length-1 && (
            <p style={{textAlign:"center",color:"var(--ember)",fontSize:13,marginTop:10}}>
              ⚠️ Answer all {questions.length - Object.keys(answers).length} remaining questions before submitting!
            </p>
          )}
        </div>
      )}

      {submitted && (
        <div>
          {/* Score card */}
          <div className="card" style={{
            textAlign:"center",marginBottom:24,
            background: score/questions.length >= 0.8 ? "linear-gradient(135deg,#ECFDF5,#D1FAE5)" :
                        score/questions.length >= 0.6 ? "linear-gradient(135deg,#FFF8E7,var(--gold-light))" :
                        "linear-gradient(135deg,#FFF5F5,#FFE4E4)"
          }}>
            <div style={{fontSize:64,marginBottom:8}}>
              {score/questions.length >= 0.8 ? "🏆" : score/questions.length >= 0.6 ? "👍" : "📚"}
            </div>
            <h2 style={{fontSize:28,marginBottom:4}}>{score} / {questions.length}</h2>
            <p style={{fontSize:18,fontWeight:600,marginBottom:8}}>
              {Math.round(score/questions.length*100)}% — {
                score/questions.length >= 0.8 ? "Outstanding! 🌟" :
                score/questions.length >= 0.6 ? "Good job! Keep going 💪" : "Keep studying! You've got this 📖"
              }
            </p>
            <p style={{color:"var(--smoke)",fontSize:14}}>
              {score} correct • {questions.length-score} incorrect
            </p>
          </div>

          {/* Review all answers */}
          <h3 style={{marginBottom:16}}>📋 Full Review ({questions.length} questions)</h3>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {questions.map((q,i)=>{
              const correct = answers[i]===q.answer;
              return (
                <div key={i} className="card" style={{
                  borderLeft: `4px solid ${correct?"var(--emerald)":"var(--ember)"}`,
                  padding:"16px 20px"
                }}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                    <p style={{fontWeight:600,fontSize:15,flex:1,lineHeight:1.5}}>
                      {i+1}. {q.q}
                    </p>
                    <span style={{
                      marginLeft:12,fontSize:11,fontWeight:700,padding:"3px 10px",
                      borderRadius:999,flexShrink:0,
                      background:correct?"#ECFDF5":"#FFF5F5",
                      color:correct?"var(--emerald)":"var(--ember)"
                    }}>{correct?"✓ Correct":"✗ Wrong"}</span>
                  </div>
                  <p style={{fontSize:13,color:"var(--smoke)",marginBottom:6}}>
                    Your answer: <strong>{answers[i]}</strong> • Correct: <strong style={{color:"var(--emerald)"}}>{q.answer}</strong>
                  </p>
                  <p style={{fontSize:13,color:"var(--smoke)",fontStyle:"italic",lineHeight:1.5}}>
                    💡 {q.explanation}
                  </p>
                </div>
              );
            })}
          </div>

          <button className="btn-primary" style={{width:"100%",marginTop:20}} onClick={loadTest}>
            Retake Test 🔄
          </button>
        </div>
      )}
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
//  APP — Supabase session + Google OAuth
// ══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [page,     setPage]     = useState("loading");
  const [user,     setUser]     = useState(null);
  const [profile,  setProfile]  = useState(null);
  const [roadmap,  setRoadmap]  = useState(null);
  const [progress, setProgress] = useState(null);
  const [showEmailSettings, setShowEmailSettings] = useState(false);
  const [emailConfigured,   setEmailConfigured]   = useState(!!(localStorage.getItem("ejs_service")&&localStorage.getItem("ejs_key")));
  const [streakAlert, setStreakAlert] = useState(null);

  // ── On mount: restore Supabase session ──────────────────────────────────────
  useEffect(()=>{
    const init = async () => {
      const { data:{ session } } = await supabase.auth.getSession();
      if (session?.user) await loadUserData(session.user);
      else setPage("landing");
    };
    init();

    // Listen for OAuth redirect (Google sign-in)
    const { data:{ subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        await loadUserData(session.user);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const loadUserData = async (authUser) => {
    setUser(authUser);
    // Load profile
    const prof = await getProfile(authUser.id);
    setProfile(prof);
    // Load roadmap
    const rm = await getRoadmap(authUser.id);
    // Load progress
    const pg = await getProgress(authUser.id);

    if (rm?.data) {
      setRoadmap(rm.data);
      const appProgress = dbToProgress(pg);
      setProgress(appProgress);

      // Streak check — did user miss a day?
      const today = new Date().toISOString().slice(0,10);
      const lastVisit = pg?.last_visit;
      if (lastVisit && lastVisit !== today) {
        const yesterday = new Date(Date.now()-86400000).toISOString().slice(0,10);
        if (lastVisit !== yesterday) {
          setStreakAlert("lost");
          const resetProg = { ...appProgress, streak:0 };
          setProgress(resetProg);
          await upsertProgress(authUser.id, { ...progressToDb(resetProg), streak:0 });
          sendStreakLostEmail(
            prof?.full_name || authUser.user_metadata?.full_name || "Student",
            authUser.email,
            appProgress.streak
          );
        }
      }
      await upsertProgress(authUser.id, { last_visit: today });
      setPage("dashboard");
    } else {
      // New user — save Google profile info if available, then onboard
      if (!prof && authUser.user_metadata?.full_name) {
        await upsertProfile(authUser.id, {
          full_name: authUser.user_metadata.full_name,
          age: null,
          grade: null,
        });
        setProfile({ full_name: authUser.user_metadata.full_name });
      }
      setPage("onboard");
    }
  };

  const onAuth = async (authUser, prof, hasExistingRoadmap) => {
    setUser(authUser);
    setProfile(prof);
    if (hasExistingRoadmap) {
      // Existing user logging in — load their full data
      await loadUserData(authUser);
    } else {
      // New signup — go to onboarding
      setPage("onboard");
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null); setProfile(null); setRoadmap(null); setProgress(null);
    setPage("landing");
  };

  const handleProgressUpdate = (newProgress) => {
    setProgress(newProgress);
  };

  const showNav = ["dashboard","learn","test"].includes(page);

  if (page==="loading") return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",flexDirection:"column",gap:20}}>
      <div style={{fontSize:48}}>🚀</div>
      <div className="dots"><span/><span/><span/></div>
      <p style={{color:"var(--mid)"}}>Loading RoadmapAI…</p>
    </div>
  );

  return (
    <>
      <style>{css}</style>

      {/* Streak Lost Banner */}
      {streakAlert==="lost" && (
        <div style={{
          background:"linear-gradient(135deg,#FEE2E2,#FECACA)",
          borderBottom:"2px solid var(--red)",padding:"12px 24px",
          textAlign:"center",display:"flex",alignItems:"center",
          justifyContent:"center",gap:12,fontSize:14,color:"#991B1B",fontWeight:500
        }}>
          <span style={{fontSize:20}}>💔</span>
          <span>You lost your streak! Come back today and start fresh 💪
            {emailConfigured&&" A reminder email has been sent to your inbox."}</span>
          <button onClick={()=>setStreakAlert(null)} style={{background:"none",border:"none",cursor:"pointer",color:"#991B1B",fontSize:18,marginLeft:8}}>✕</button>
        </div>
      )}

      {showNav && <Nav
        user={user} onLogout={logout} onNav={setPage} page={page}
        onOpenEmailSettings={()=>setShowEmailSettings(true)}
        emailConfigured={emailConfigured}
      />}

      {showEmailSettings && (
        <EmailSettingsModal
          onClose={()=>{ setShowEmailSettings(false); setEmailConfigured(!!(localStorage.getItem("ejs_service")&&localStorage.getItem("ejs_key"))); }}
          userEmail={user?.email}
          userName={profile?.full_name||user?.user_metadata?.full_name}
        />
      )}

      {page==="landing"   && <Landing onStart={()=>setPage("auth")}/>}
      {page==="auth"      && <Auth onAuth={onAuth}/>}
      {page==="onboard"   && user && <Onboarding user={user} profile={profile} onDone={(rm,pg)=>{setRoadmap(rm);setProgress(pg);setPage("dashboard");}}/>}
      {page==="dashboard" && roadmap && progress && <Dashboard user={user} roadmap={roadmap} progress={progress} onUpdateProgress={handleProgressUpdate} onNav={setPage}/>}
      {page==="learn"     && roadmap && progress && <Learn user={user} progress={progress} roadmap={roadmap} onUpdateProgress={handleProgressUpdate}/>}
      {page==="test"      && roadmap && progress && <WeeklyTest progress={progress} roadmap={roadmap}/>}
    </>
  );
}