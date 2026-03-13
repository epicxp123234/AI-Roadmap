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
const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_KEY;

async function askClaude(messages, system = "", maxTokens = 2000) {
  const body = { model:"claude-sonnet-4-20250514", max_tokens:maxTokens, messages };
  if (system) body.system = system;
  
  const fetchPromise = fetch("https://api.anthropic.com/v1/messages", {
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body:JSON.stringify(body),
  }).then(r => r.json()).then(data => data.content?.[0]?.text ?? "");

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

    const prompt = `You are an expert tech career mentor for students aged 13-18.
Create a detailed 6-month learning roadmap for:
- Name: ${name}, Age: ${age}, Grade: ${grade}
- Career goal: ${form.career}, Level: ${form.level}
- Daily time: ${form.time}, Goal: ${form.goal}

Return ONLY valid JSON:
{
  "title": "6-Month ${form.career} Roadmap",
  "months": [
    {
      "month": 1, "theme": "Theme name", "focus": "Focus description",
      "weeks": [
        {
          "week": 1, "goal": "Weekly goal",
          "days": [
            {"day":1,"task":"Specific task"},{"day":2,"task":"Specific task"},
            {"day":3,"task":"Specific task"},{"day":4,"task":"Specific task"},
            {"day":5,"task":"Specific task"},{"day":6,"task":"Mini project"},
            {"day":7,"task":"Review and rest"}
          ],
          "testTopic": "Topic for weekly test"
        }
      ]
    }
  ]
}
Include all 6 months with 4 weeks each. Tasks must be friendly, specific, encouraging for teens.`;

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
const PROFESSOR_SYSTEM = `You are Professor CodeWizard 🧙‍♂️ — the most legendary teacher on the planet. You have a PhD and 30 years of experience teaching teenagers. Your students say you are 10x better than any YouTube tutorial, Udemy course, or Khan Academy video.

Here is what makes you different:
- You NEVER give boring textbook definitions. You always start with a jaw-dropping real-world story or analogy that makes the student go "OHHH I get it now!"
- You are hilarious. You make jokes, use pop culture references and relatable teen humor — but never at the expense of accuracy.
- You go DEEP. You explain WHY it works, HOW it connects to real life, and WHAT happens if you ignore it.
- You speak directly to the student: use "you", "imagine", "picture this", "here is the thing nobody tells you".
- You ALWAYS tailor your teaching to the exact subject — if it is entrepreneurship, every example is about business. If it is art, every example is about drawing. NEVER use programming examples for a non-coding subject.
- You end every response with a powerful one-liner that makes the student excited to keep going.

Your style: warm, funny, deeply accurate, full of energy, zero boring filler.`;

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

    const lc = roadmap.title.toLowerCase();
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
`You are teaching a 13-18 year old student learning: "${roadmap.title}"
This week: "${weekTopic}"

Generate 15 COMPLETELY DIFFERENT lectures, one per sub-topic of this week.

RULES — follow every single one:
1. Each lecture must cover a UNIQUE aspect — no repetition whatsoever
2. Each body must be 6-8 sentences minimum — rich, detailed, NOT shallow
3. Start each lecture with a surprising real-world story or analogy (e.g. "Picture this: you walk into a coffee shop and...")
4. Use humor, teen-friendly language, relatable examples — make it better than any YouTube video
5. CRITICAL: tailor 100% to "${roadmap.title}" — if it is art, talk about art. If entrepreneurship, talk about startups. NEVER mention programming for non-coding subjects
6. The "body" field must feel like a real passionate professor talking, not a textbook
7. Lecture 15 must have a "homework" array with 3 specific actionable tasks related to "${roadmap.title}"

Return ONLY valid JSON, no markdown:
{
  "lectures": [
    {
      "num": 1,
      "title": "Catchy punchy title with emoji",
      "body": "6-8 sentences. Start with a story. Be funny, be deep, be specific to the subject.",
      "keyTakeaway": "One powerful sentence. Make it memorable.",
      "homework": null
    }
  ]
}
Generate all 15 lectures now. Last one has homework array, rest have null.`
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

    // Fallback: unique detailed lectures per sub-topic
    const openings = [
      "Picture this:", "Here's a secret nobody tells you:", "Let me blow your mind real quick —",
      "Imagine you're a professional right now.", "Here's the thing about", "Fun fact that will change how you see",
      "Every expert in", "The biggest mistake beginners make with", "You know what separates amateurs from pros in",
      "Let's talk about the most underrated part of", "Buckle up, because", "No textbook will tell you this about",
      "The reason most people struggle with", "Here's why the pros obsess over", "Congratulations — you've made it to the final lecture on"
    ];
    const fallbackLectures = subTopics.map((topic, i) => ({
      num: i+1,
      title: `${["🎯","💡","🔥","⚡","🚀","🎨","🧠","💎","🌟","🎭","🏆","🎪","🔮","🌈","🎓"][i]} ${topic}`,
      body: `${openings[i]} ${topic}. This is one of the pillars of ${roadmap.title} that every serious student needs to understand deeply. Think of it this way — if ${roadmap.title} were a building, ${topic} would be one of the load-bearing walls. Remove it and everything collapses. The professionals who are crushing it right now in this field all have a rock-solid understanding of ${topic}. Here is the key insight: most people skim over this thinking it is basic, but the deeper you go, the more you realize how much depth is hiding here. Every time you practice ${topic}, you are building a skill that compounds over time — each hour you invest now pays back 10x later. The best way to truly get it? Stop just reading about it and start applying it to real situations in your own life. Here is your challenge: before you move to the next lecture, think of one real example of ${topic} you have seen in the world around you. You will be amazed how often it shows up once you know what to look for! 🔥`,
      keyTakeaway: `${topic} is not just theory — it is a real skill used by every professional in ${roadmap.title}, and mastering it will set you apart from 90% of beginners.`,
      homework: i === 14 ? [
        `Deep dive: Spend 30 minutes researching ${subTopics[0]} and write down 5 things that surprised you`,
        `Real-world challenge: Find 3 examples of ${weekTopic} in action in your daily life and take notes on what makes each one work`,
        `Create challenge: Apply what you learned this week about ${roadmap.title} — make something real, however small, and share it with one person`
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
        `The student is learning "${roadmap.title}", week topic: "${weekTopic}". They ask: "${doubt}". 
Answer in your fun professor style — accurate, clear, with a real-world analogy. 
Be detailed but concise — around 150-200 words. Tailor your answer to "${roadmap.title}", not generic advice.`
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
                  <button className="btn-primary" onClick={markDone} disabled={dayDone} style={{flex:1,background:dayDone?"var(--emerald)":undefined}}>
                    {dayDone ? "✅ Day Complete!" : "Complete Day ✓"}
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
      const makePrompt = (batch) => `Create 25 multiple choice questions about "${topic}" for a student learning "${roadmap.title}". 
This is batch ${batch} of 2 — make sure questions are different from typical batch ${batch===1?2:1} questions.
Questions should be friendly, educational and appropriate for ages 13-18.
Cover different aspects and difficulty levels — easy, medium, and hard.
Tailor to the subject: if entrepreneurship, ask about business. If coding, ask about code. Match the field!

Return ONLY valid JSON (no markdown):
{
  "questions": [
    {
      "q": "Question text?",
      "options": ["A) option","B) option","C) option","D) option"],
      "answer": "A",
      "explanation": "Brief friendly explanation"
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