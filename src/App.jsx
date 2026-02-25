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
async function askClaude(messages, system = "", maxTokens = 2000) {
  const body = { model:"claude-sonnet-4-20250514", max_tokens:maxTokens, messages };
  if (system) body.system = system;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(body),
  });
  const data = await res.json();
  return data.content?.[0]?.text ?? "";
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
      // Save to Supabase
      await upsertRoadmap(user.id, roadmap, { career:form.career, level:form.level, daily_time:form.time, goal:form.goal });
      const initProgress = { current_month:1, current_week:1, current_day:1, streak:0, completed_days:[], last_visit:new Date().toISOString().slice(0,10) };
      await upsertProgress(user.id, initProgress);
      onDone(roadmap, dbToProgress(initProgress));
    } catch(e) {
      console.error(e);
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
  const themes=["Foundations","Core Concepts","Problem Solving","Projects","Advanced Topics","Job Prep"];
  return {
    title:`6-Month ${form.career} Roadmap`,
    months:themes.map((theme,mi)=>({
      month:mi+1, theme, focus:`Month ${mi+1}: ${theme}`,
      weeks:[1,2,3,4].map(wi=>({
        week:wi, goal:`Week ${wi} of ${theme}`,
        days:[1,2,3,4,5,6,7].map(di=>({day:di,task:di===7?"Review the week's learning and rest 🌟":`Practice ${theme.toLowerCase()} concept ${di}`})),
        testTopic:theme,
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
const PROFESSOR_SYSTEM = `You are Professor CodeWizard 🧙‍♂️ — a legendary computer science professor with a PhD from MIT, 30 years of real teaching experience. You are funny, warm, deeply knowledgeable, and your students absolutely love your classes. You make hard things feel easy by using brilliant, often hilarious analogies. You talk directly to the student like a real professor in a lecture hall. You are 100% technically accurate — no hand-waving, no vagueness. Real knowledge, delivered with personality.`;

function Learn({ progress, roadmap, onUpdateProgress, user }) {
  const { currentMonth=1, currentWeek=1, currentDay=1, streak=1, completedDays=[] } = progress;
  const month = roadmap.months[currentMonth-1];
  const week  = month?.weeks[currentWeek-1];
  const todayTask = week?.days[currentDay-1]?.task ?? "Introduction to Programming";

  const [lesson, setLesson]         = useState(null);
  const [quiz, setQuiz]             = useState(null);
  const [loadingLesson, setLoadingLesson] = useState(false);
  const [loadingQuiz, setLoadingQuiz]     = useState(false);
  const [quizAnswer, setQuizAnswer] = useState(null);
  const [doubt, setDoubt]           = useState("");
  const [answer, setAnswer]         = useState("");
  const [loadingDoubt, setLoadingDoubt] = useState(false);
  const [dayDone, setDayDone]       = useState(false);

  useEffect(()=>{
    if(!todayTask) return;
    setLesson(null);
    setQuiz(null);
    setQuizAnswer(null);
    setAnswer("");
    setDayDone(false);
    loadLesson();
  }, [currentMonth, currentWeek, currentDay]);

  const loadLesson = async () => {
    setLoadingLesson(true);
    const raw = await askClaude(
      [{role:"user", content:
`Write a complete university-level lesson for a 13-18 year old student on this topic: "${todayTask}"
They are learning: ${roadmap.title}

Your response must be ONLY a valid JSON object. No markdown fences, no extra text before or after. The JSON must follow this exact structure:

{
  "title": "A fun catchy title for today's lesson with an emoji",
  "joke": "One short funny programming joke related to the topic",
  "intro": "2-3 sentence professor intro. Hype up why this topic is important. Be dramatic and funny.",
  "sections": [
    {
      "heading": "Section 1 heading",
      "body": "3-5 sentences of real, accurate, educational content. Use a funny real-world analogy. Explain clearly like a great professor."
    },
    {
      "heading": "Section 2 heading",
      "body": "3-5 sentences going deeper. Give a concrete code example or real-world scenario. Stay funny but thorough."
    },
    {
      "heading": "Section 3 heading",
      "body": "3-5 sentences connecting everything together. The aha-moment. End with something memorable."
    }
  ],
  "concepts": [
    {"term": "Term 1", "definition": "Precise definition in 1-2 sentences", "analogy": "A funny everyday analogy"},
    {"term": "Term 2", "definition": "Precise definition in 1-2 sentences", "analogy": "A funny everyday analogy"},
    {"term": "Term 3", "definition": "Precise definition in 1-2 sentences", "analogy": "A funny everyday analogy"}
  ],
  "codeExample": "A short, runnable code snippet (5-10 lines) demonstrating the concept. Use Python or JavaScript.",
  "codeExplain": "2-3 sentences explaining what the code does, line by line, in simple language.",
  "practice": [
    "Specific, actionable practice task 1",
    "Specific, actionable practice task 2",
    "Challenge: harder creative task"
  ],
  "profTip": "One insider tip a student would only learn in a real university — something beyond textbooks. Be specific."
}`
      }],
      PROFESSOR_SYSTEM,
      3000
    );
    try {
      const cleaned = raw.replace(/^```json\s*/,"").replace(/^```\s*/,"").replace(/```\s*$/,"").trim();
      setLesson(JSON.parse(cleaned));
    } catch(e) {
      // If JSON parse fails, create a structured fallback from the raw text
      setLesson({
        title: `📚 ${todayTask}`,
        joke: "Why do Java developers wear glasses? Because they don't C#! 😄",
        intro: `Today we're diving into: ${todayTask}. This is one of those topics that separates good developers from great ones. PAY ATTENTION!`,
        sections: [
          { heading: "What is it?", body: raw.slice(0, 400) || "Let's explore this concept step by step. Every expert was once a beginner — and today you take your next step forward." },
          { heading: "How does it work?", body: "Think of it like this: every concept in programming has a real-world equivalent. Once you find that equivalent, the concept clicks forever." },
          { heading: "Why does it matter?", body: "This is foundational knowledge. Every professional developer uses this daily. Master it now and you'll thank yourself later." }
        ],
        concepts: [
          { term: todayTask, definition: "A core programming concept you'll use throughout your career.", analogy: "Like learning to ride a bike — hard at first, then you never forget." }
        ],
        codeExample: `# Example: ${todayTask}\nprint("Hello, future developer!")`,
        codeExplain: "This simple example shows the concept in action. Try running it yourself!",
        practice: ["Read about this topic for 20 minutes", "Find 3 real examples online", "Try writing your own version"],
        profTip: "The best developers don't just read — they experiment. Break things on purpose. That's how you really learn."
      });
    }
    setLoadingLesson(false);

    // Load quiz separately after lesson loads
    setLoadingQuiz(true);
    const qraw = await askClaude(
      [{role:"user", content:
`Create ONE multiple choice quiz question about "${todayTask}" for a 13-18 year old student.
Return ONLY valid JSON, no markdown:
{
  "question": "A clear, interesting question about the topic",
  "options": ["A) first option", "B) second option", "C) third option", "D) fourth option"],
  "answer": "A",
  "explanation": "2-3 sentence explanation of why this answer is correct, in a fun professor voice"
}`
      }],
      PROFESSOR_SYSTEM,
      500
    );
    try {
      const qcleaned = qraw.replace(/^```json\s*/,"").replace(/^```\s*/,"").replace(/```\s*$/,"").trim();
      setQuiz(JSON.parse(qcleaned));
    } catch {
      setQuiz({
        question: `What is the most important thing to remember about ${todayTask}?`,
        options: ["A) Practice it daily","B) Memorize the syntax","C) Skip it entirely","D) Read about it once"],
        answer: "A",
        explanation: "Practice is everything in programming. You can't just read about swimming — you have to get in the water!"
      });
    }
    setLoadingQuiz(false);
  };

  const submitDoubt = async () => {
    if(!doubt.trim()) return;
    setLoadingDoubt(true);
    setAnswer("");
    const res = await askClaude(
      [{role:"user", content: doubt}],
      PROFESSOR_SYSTEM + `\n\nThe student is learning: ${roadmap.title}. Current topic: "${todayTask}". Answer their doubt with real depth — like a PhD professor who also happens to be hilarious. Use a clear analogy, give a real example, and end with a motivating line. Be thorough, not brief.`,
      1000
    );
    setAnswer(res);
    setLoadingDoubt(false);
    setDoubt("");
  };

  const goNextDay = async () => {
    const key = `m${currentMonth}w${currentWeek}d${currentDay}`;
    const newCompleted = completedDays.includes(key) ? completedDays : [...completedDays, key];
    let nd=currentDay+1, nw=currentWeek, nm=currentMonth;
    if(nd>7){nd=1;nw++;}
    if(nw>4){nw=1;nm++;}
    if(nm>6) nm=6;
    const next = { ...progress, completedDays:newCompleted, streak:streak+1, currentDay:nd, currentWeek:nw, currentMonth:nm };
    await upsertProgress(user.id, progressToDb(next));
    onUpdateProgress(next);
    setDayDone(true);
  };

  return (
    <div className="page container" style={{paddingTop:40, paddingBottom:80}}>

      {/* breadcrumbs */}
      <div className="row gap-8" style={{marginBottom:24, flexWrap:"wrap"}}>
        <span className="pill">Month {currentMonth}</span>
        <span className="pill">Week {currentWeek}</span>
        <span className="pill">Day {currentDay}</span>
        <span className="pill" style={{background:"#FEF3C7",color:"#92400E"}}>👨‍🏫 Prof. CodeWizard</span>
      </div>

      {/* topic banner */}
      <div style={{
        background:"linear-gradient(135deg,var(--ink),var(--ink2))",
        borderRadius:16, padding:"20px 24px", marginBottom:24,
        color:"#fff", borderLeft:"4px solid var(--gold)"
      }}>
        <div style={{fontSize:12,fontWeight:700,opacity:.6,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4,color:"var(--gold-light)"}}>Today's Topic</div>
        <h2 style={{fontSize:22,lineHeight:1.3,color:"#fff"}}>{todayTask}</h2>
      </div>

      {loadingLesson ? (
        <div style={{textAlign:"center",padding:"60px 20px"}}>
          <div style={{fontSize:56,marginBottom:16}}>🧙‍♂️</div>
          <div className="dots"><span/><span/><span/></div>
          <p style={{color:"var(--mid)",marginTop:16,fontStyle:"italic",fontSize:15}}>
            "Preparing your lecture… polishing the whiteboard… adjusting the bow tie…"
          </p>
        </div>
      ) : lesson ? (
        <div className="stack gap-20">

          {/* joke */}
          <div style={{
            background:"linear-gradient(135deg,#FEF3C7,#FDE68A)",
            border:"2px solid #F59E0B", borderRadius:16,
            padding:"18px 22px", display:"flex", gap:14, alignItems:"flex-start"
          }}>
            <span style={{fontSize:28,flexShrink:0}}>😂</span>
            <div>
              <div style={{fontWeight:700,fontSize:11,color:"#92400E",marginBottom:4,textTransform:"uppercase",letterSpacing:1}}>Professor's Ice-Breaker</div>
              <p style={{color:"#78350F",lineHeight:1.7,fontStyle:"italic",fontSize:15}}>{lesson.joke}</p>
            </div>
          </div>

          {/* lesson title + intro */}
          <div className="card" style={{borderTop:"4px solid var(--blue)"}}>
            <div style={{display:"flex",gap:14,alignItems:"flex-start",marginBottom:16}}>
              <span style={{fontSize:38,lineHeight:1}}>🧙‍♂️</span>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:"var(--blue)",textTransform:"uppercase",letterSpacing:1,marginBottom:2}}>Today's Lecture</div>
                <h2 style={{fontSize:22,lineHeight:1.25}}>{lesson.title}</h2>
              </div>
            </div>
            <div style={{
              background:"var(--sky)", borderRadius:10, padding:"14px 18px",
              borderLeft:"4px solid var(--blue)", marginBottom:20,
              fontStyle:"italic", color:"#1D4ED8", fontSize:15, lineHeight:1.7
            }}>
              🎓 {lesson.intro}
            </div>

            {/* lecture sections — THE ACTUAL LESSON */}
            {(lesson.sections||[]).map((s,i)=>(
              <div key={i} style={{marginBottom:i<lesson.sections.length-1?24:0}}>
                <h3 style={{fontSize:17,marginBottom:8,color:"var(--dark)",display:"flex",alignItems:"center",gap:8}}>
                  <span style={{
                    background:"var(--blue)",color:"#fff",
                    width:26,height:26,borderRadius:"50%",
                    display:"inline-flex",alignItems:"center",justifyContent:"center",
                    fontSize:13,fontWeight:800,flexShrink:0
                  }}>{i+1}</span>
                  {s.heading}
                </h3>
                <p style={{lineHeight:1.85,fontSize:15.5,color:"#334155",paddingLeft:34}}>{s.body}</p>
                {i < lesson.sections.length-1 && <hr style={{border:"none",borderTop:"1px solid #F1F5F9",marginTop:20}}/>}
              </div>
            ))}
          </div>

          {/* code example */}
          {lesson.codeExample && (
            <div className="card">
              <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:14}}>
                <span style={{fontSize:22}}>💻</span>
                <h3>Code Example</h3>
              </div>
              <div style={{
                background:"#0F172A", borderRadius:12, padding:"18px 20px",
                fontFamily:"'Courier New',monospace", fontSize:14,
                lineHeight:1.8, color:"#E2E8F0", overflowX:"auto",
                whiteSpace:"pre", marginBottom:14
              }}>
                {lesson.codeExample}
              </div>
              <p style={{color:"var(--mid)",fontSize:14,lineHeight:1.7}}>
                <strong>What this does:</strong> {lesson.codeExplain}
              </p>
            </div>
          )}

          {/* key concepts */}
          {lesson.concepts?.length>0 && (
            <div className="card">
              <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:18}}>
                <span style={{fontSize:22}}>📖</span>
                <div>
                  <h3>Key Concepts</h3>
                  <p style={{fontSize:13,color:"var(--mid)"}}>Write these down. They'll show up in interviews.</p>
                </div>
              </div>
              <div className="stack gap-12">
                {lesson.concepts.map((c,i)=>(
                  <div key={i} style={{border:"1.5px solid #E2E8F0",borderRadius:12,overflow:"hidden"}}>
                    <div style={{
                      background:"var(--blue)",color:"#fff",
                      padding:"9px 16px",display:"flex",
                      justifyContent:"space-between",alignItems:"center"
                    }}>
                      <span style={{fontWeight:700,fontSize:15}}>{c.term}</span>
                      <span style={{fontSize:11,opacity:.7}}>Concept #{i+1}</span>
                    </div>
                    <div style={{padding:"12px 16px"}}>
                      <p style={{fontSize:14.5,marginBottom:10,lineHeight:1.6}}>{c.definition}</p>
                      <div style={{
                        background:"#FEF3C7",borderRadius:8,
                        padding:"8px 12px",fontSize:13,color:"#78350F",
                        display:"flex",gap:8
                      }}>
                        <span style={{flexShrink:0}}>💡</span>
                        <span><strong>Think of it like:</strong> {c.analogy}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* quick quiz */}
          {(quiz || loadingQuiz) && (
            <div className="card" style={{border:"2px solid var(--blue)"}}>
              <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:14}}>
                <span style={{fontSize:22}}>⚡</span>
                <div>
                  <h3>Quick Check!</h3>
                  <p style={{fontSize:13,color:"var(--mid)"}}>The professor is watching 👀</p>
                </div>
              </div>
              {loadingQuiz ? (
                <div style={{textAlign:"center",padding:"20px 0"}}>
                  <div className="dots"><span/><span/><span/></div>
                  <p style={{color:"var(--mid)",fontSize:13,marginTop:8}}>Loading quiz question…</p>
                </div>
              ) : quiz ? (
                <>
                  <p style={{fontSize:16,fontWeight:600,marginBottom:14}}>{quiz.question}</p>
                  <div className="stack gap-8">
                    {(quiz.options||[]).map(opt=>{
                      const letter=opt[0];
                      const isChosen=quizAnswer===letter;
                      const isCorrect=quizAnswer&&letter===quiz.answer;
                      const isWrong=quizAnswer&&isChosen&&letter!==quiz.answer;
                      return (
                        <div key={opt}
                          className={`mcq-option ${isCorrect?"correct":isWrong?"wrong":isChosen?"chosen":""}`}
                          onClick={()=>{if(!quizAnswer)setQuizAnswer(letter);}}>
                          <span style={{
                            width:28,height:28,borderRadius:"50%",flexShrink:0,
                            display:"flex",alignItems:"center",justifyContent:"center",
                            fontWeight:700,fontSize:13,
                            background:isCorrect?"var(--green)":isWrong?"var(--red)":isChosen?"var(--blue)":"#E2E8F0",
                            color:isCorrect||isWrong||isChosen?"#fff":"var(--mid)"
                          }}>{letter}</span>
                          {opt.slice(3)}
                        </div>
                      );
                    })}
                  </div>
                  {quizAnswer && (
                    <div style={{
                      marginTop:14,padding:"14px 16px",borderRadius:10,fontSize:14,lineHeight:1.7,
                      background:quizAnswer===quiz.answer?"#D1FAE5":"#FEE2E2",
                      color:quizAnswer===quiz.answer?"#065F46":"#991B1B"
                    }}>
                      {quizAnswer===quiz.answer?"🎉 Correct! ":"❌ Not quite — "}
                      {quiz.explanation}
                    </div>
                  )}
                </>
              ):null}
            </div>
          )}

          {/* practice */}
          {lesson.practice?.length>0 && (
            <div className="card">
              <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:16}}>
                <span style={{fontSize:22}}>🛠️</span>
                <div>
                  <h3>Practice Tasks</h3>
                  <p style={{fontSize:13,color:"var(--mid)"}}>
                    Prof says: <em>"Reading without doing is like watching cooking videos and expecting to be a chef."</em>
                  </p>
                </div>
              </div>
              <div className="stack gap-10">
                {lesson.practice.map((t,i)=>(
                  <div key={i} style={{
                    display:"flex",gap:14,alignItems:"flex-start",
                    padding:"14px 16px",borderRadius:12,
                    background:i===2?"linear-gradient(135deg,#EDE9FE,#DDD6FE)":"#F8FAFF",
                    border:i===2?"1.5px solid #A78BFA":"1.5px solid #E2E8F0"
                  }}>
                    <span style={{
                      width:28,height:28,borderRadius:"50%",flexShrink:0,
                      background:i===2?"#7C3AED":"var(--blue)",color:"#fff",
                      display:"flex",alignItems:"center",justifyContent:"center",
                      fontWeight:800,fontSize:13
                    }}>{i+1}</span>
                    <div>
                      <p style={{fontSize:15,lineHeight:1.6}}>{t}</p>
                      {i===2&&<div style={{fontSize:11,color:"#6D28D9",marginTop:4,fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>⭐ Challenge Task</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* prof tip */}
          {lesson.profTip && (
            <div style={{
              background:"linear-gradient(135deg,var(--ink),var(--ink2))",
              borderRadius:16,padding:"24px",color:"#fff",
              borderTop:"3px solid var(--gold)"
            }}>
              <div style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:10}}>
                <span style={{fontSize:28,flexShrink:0}}>🎓</span>
                <div>
                  <div style={{fontSize:11,fontWeight:700,letterSpacing:1.5,color:"var(--gold)",textTransform:"uppercase",marginBottom:2}}>Professor's Secret Tip</div>
                  <div style={{fontSize:13,color:"rgba(245,230,192,.7)",fontWeight:600}}>What they only teach in top universities</div>
                </div>
              </div>
              <p style={{lineHeight:1.85,fontSize:15,opacity:.9}}>{lesson.profTip}</p>
            </div>
          )}

          {/* ── NEXT DAY BUTTON ── */}
          <div className="card" style={{
            textAlign:"center",
            background: dayDone?"linear-gradient(135deg,#D1FAE5,#A7F3D0)":"var(--white)",
            border: dayDone?"2px solid var(--green)":"2px solid var(--blue)"
          }}>
            {dayDone ? (
              <>
                <div style={{fontSize:48,marginBottom:8}}>🎉</div>
                <h3 style={{color:"#065F46",marginBottom:4}}>Day {currentDay} Complete!</h3>
                <p style={{color:"#047857",fontSize:14,marginBottom:16}}>You're on a roll! Keep the streak going.</p>
                <button className="btn-primary" onClick={loadLesson} style={{background:"var(--green)"}}>
                  Load Next Day's Lesson →
                </button>
              </>
            ) : (
              <>
                <p style={{color:"var(--mid)",fontSize:14,marginBottom:16}}>
                  Finished reading and practising? Mark this day complete and move forward!
                </p>
                <button className="btn-primary" onClick={goNextDay} style={{fontSize:17,padding:"16px 40px"}}>
                  ✅ Complete Day {currentDay} & Next →
                </button>
              </>
            )}
          </div>

        </div>
      ):null}

      {/* doubt solver */}
      <div className="card" style={{marginTop:28,borderTop:"4px solid #F59E0B"}}>
        <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:4}}>
          <span style={{fontSize:26}}>🙋</span>
          <h3>Ask Professor CodeWizard</h3>
        </div>
        <p style={{color:"var(--mid)",fontSize:14,marginBottom:16,fontStyle:"italic"}}>
          "There are no stupid questions. Only questions that haven't been asked yet." — Prof. CodeWizard
        </p>
        <div className="field" style={{marginBottom:12}}>
          <textarea
            rows={3}
            placeholder="e.g. I don't understand what a loop does… or why do we even need functions?"
            value={doubt}
            onChange={e=>setDoubt(e.target.value)}
            style={{resize:"vertical"}}
          />
        </div>
        <button className="btn-primary" onClick={submitDoubt} disabled={loadingDoubt||!doubt.trim()}>
          {loadingDoubt?"Professor is thinking… 🤔":"Ask the Professor 🧙‍♂️"}
        </button>
        {loadingDoubt && (
          <div style={{textAlign:"center",marginTop:20}}>
            <div style={{fontSize:40,marginBottom:8}}>🧙‍♂️</div>
            <div className="dots"><span/><span/><span/></div>
            <p style={{color:"var(--mid)",fontSize:13,marginTop:8,fontStyle:"italic"}}>"Consulting 30 years of knowledge…"</p>
          </div>
        )}
        {answer && (
          <div style={{
            marginTop:20,
            background:"linear-gradient(135deg,#F0F9FF,#E0F2FE)",
            border:"1.5px solid #BAE6FD",borderLeft:"5px solid var(--blue)",
            borderRadius:14,padding:"20px 22px",
            lineHeight:1.85,whiteSpace:"pre-wrap",fontSize:15
          }}>
            <div style={{fontSize:11,fontWeight:700,color:"var(--blue)",marginBottom:10,textTransform:"uppercase",letterSpacing:1}}>
              🧙‍♂️ Professor CodeWizard Replies:
            </div>
            {answer}
          </div>
        )}
      </div>
    </div>
  );
}

// ── WEEKLY TEST ───────────────────────────────────────────────────────────────
function WeeklyTest({ progress, roadmap }) {
  const { currentWeek=1, currentMonth=1 } = progress;
  const month = roadmap.months[currentMonth-1];
  const week  = month?.weeks[currentWeek-1];
  const topic = week?.testTopic ?? "Programming Basics";

  const [questions, setQuestions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);

  const loadTest = async () => {
    setLoading(true);
    setSubmitted(false);
    setAnswers({});
    const raw = await askClaude([{role:"user",content:`Create 5 multiple choice questions about "${topic}" for a student learning ${roadmap.title}. Questions should be friendly and appropriate for ages 13-18.

Return ONLY valid JSON (no markdown):
{
  "questions": [
    {
      "q": "Question text?",
      "options": ["A) option","B) option","C) option","D) option"],
      "answer": "A",
      "explanation": "Brief friendly explanation of the correct answer"
    }
  ]
}`}]);
    try {
      const data = JSON.parse(raw.replace(/```json|```/g,"").trim());
      setQuestions(data.questions);
    } catch {
      setQuestions([{
        q:"What is a variable in programming?",
        options:["A) A fixed number","B) A container that stores data","C) A type of loop","D) A function"],
        answer:"B",
        explanation:"A variable is like a labelled box that stores information you can use and change."
      }]);
    }
    setLoading(false);
  };

  const submit = () => {
    let s=0;
    questions.forEach((q,i)=>{ if(answers[i]===q.answer) s++; });
    setScore(s);
    setSubmitted(true);
  };

  const getClass = (qi, opt) => {
    const letter = opt[0];
    if(!submitted) return answers[qi]===letter?"chosen":"";
    if(letter===questions[qi].answer) return "correct";
    if(answers[qi]===letter) return "wrong";
    return "";
  };

  return (
    <div className="page container" style={{paddingTop:40, paddingBottom:80}}>
      <div style={{marginBottom:28}}>
        <h2>📝 Weekly Test</h2>
        <p style={{color:"var(--mid)",marginTop:4}}>Topic: <strong>{topic}</strong> — Week {currentWeek}, Month {currentMonth}</p>
      </div>

      {!questions && !loading && (
        <div className="card" style={{textAlign:"center",padding:48}}>
          <div style={{fontSize:48,marginBottom:16}}>🎯</div>
          <h3 style={{marginBottom:8}}>Ready to test yourself?</h3>
          <p style={{color:"var(--mid)",marginBottom:24}}>5 MCQ questions. Take your time and think carefully!</p>
          <button className="btn-primary" onClick={loadTest}>Start Test →</button>
        </div>
      )}

      {loading && <Loader text="Generating your test questions…"/>}

      {questions && !loading && (
        <div className="stack gap-20">
          {submitted && (
            <div className="card" style={{
              background: score>=4?"#D1FAE5":score>=2?"#FEF3C7":"#FEE2E2",
              border: `2px solid ${score>=4?"var(--green)":score>=2?"var(--amber)":"var(--red)"}`,
              textAlign:"center"
            }}>
              <div style={{fontSize:48}}>{score>=4?"🏆":score>=2?"⭐":"💪"}</div>
              <h3 style={{margin:"8px 0 4px"}}>You scored {score} / {questions.length}</h3>
              <p style={{color:"var(--mid)"}}>
                {score===questions.length?"Perfect score! Incredible work!":
                 score>=4?"Almost perfect! You're doing great!":
                 score>=2?"Good effort! Review the explanations below.":
                 "Keep practicing — every attempt makes you stronger!"}
              </p>
              <button className="btn-outline" style={{marginTop:16}} onClick={loadTest}>Retry Test 🔄</button>
            </div>
          )}

          {questions.map((q,qi)=>(
            <div className="card" key={qi}>
              <p style={{fontWeight:600,fontSize:16,marginBottom:14}}>Q{qi+1}. {q.q}</p>
              <div className="stack gap-8">
                {q.options.map(opt=>(
                  <div key={opt} className={`mcq-option ${getClass(qi,opt)}`}
                    onClick={()=>{ if(!submitted) setAnswers(a=>({...a,[qi]:opt[0]})); }}>
                    <span style={{
                      width:28,height:28,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",
                      background: getClass(qi,opt)==="correct"?"var(--green)": getClass(qi,opt)==="wrong"?"var(--red)":getClass(qi,opt)==="chosen"?"var(--blue)":"#E2E8F0",
                      color: ["correct","wrong","chosen"].includes(getClass(qi,opt))?"#fff":"var(--mid)",
                      fontWeight:700,fontSize:13,flexShrink:0
                    }}>{opt[0]}</span>
                    {opt.slice(3)}
                  </div>
                ))}
              </div>
              {submitted && (
                <div style={{marginTop:12,padding:"10px 14px",background:"var(--sky)",borderRadius:10,fontSize:14,color:"var(--mid)"}}>
                  💡 {q.explanation}
                </div>
              )}
            </div>
          ))}

          {!submitted && (
            <button className="btn-primary" onClick={submit} disabled={Object.keys(answers).length<questions.length}>
              Submit Answers →
            </button>
          )}
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