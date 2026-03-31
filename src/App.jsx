import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL  = "https://knqclhfxhkishaivowhe.supabase.co";
const SUPABASE_ANON = "sb_publishable_xcwOjTEqwOgX6VHhB2krTA_YI1Swr5_";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { lock: false } });

async function askClaude(messages) {
  const userMessage = messages.find(m => m.role === "user")?.content || "";
  try {
    const res = await fetch(
      "https://knqclhfxhkishaivowhe.supabase.co/functions/v1/ask-doubt",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: userMessage }),
      }
    );
    const data = await res.json();
    console.log("FULL BACKEND RESPONSE:", data);
    if (typeof data.answer === "string") return data.answer;
    if (data.answer?.content) return data.answer.content;
    return JSON.stringify(data);
  } catch (e) {
    console.error("askClaude error:", e);
    return "";
  }
}

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
  await supabase.from("roadmaps").upsert({ user_id: userId, title: roadmapData.title, data: roadmapData, ...meta });
}
async function getProgress(userId) {
  const { data } = await supabase.from("progress").select("*").eq("user_id", userId).single();
  return data;
}
async function upsertProgress(userId, fields) {
  await supabase.from("progress").upsert(
    { user_id: userId, ...fields, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );
}
async function saveTaskSubmission(userId, data) {
  await supabase.from("task_submissions").upsert({
    user_id: userId, week_key: data.weekKey, career: data.career,
    task_title: data.taskTitle, answers: data.answers, feedback: data.feedback,
    submitted_at: new Date().toISOString(),
  }, { onConflict: "user_id,week_key" });
}

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

function getEJS() {
  try {
    return {
      serviceId:  localStorage.getItem("ejs_service")  || "",
      templateId: localStorage.getItem("ejs_template") || "",
      publicKey:  localStorage.getItem("ejs_key")      || "",
    };
  } catch(e) { return { serviceId: "", templateId: "", publicKey: "" }; }
}
const EJS = getEJS();

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
      app_name:"Velorn", login_url: window.location.href,
      message:`You had a ${streak}-day streak! Come back today 🚀`,
    });
    return true;
  } catch(e) { console.warn("EmailJS:", e); return false; }
}

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
    --font-display:'Playfair Display',serif;
    --font-body:'Outfit',sans-serif;
  }
  body { font-family:var(--font-body); background:var(--paper); color:var(--ink); min-height:100vh; width:100%; overflow-x:hidden; }
  #root { width:100%; }
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
    box-shadow:0 4px 20px rgba(201,168,76,.4); position:relative; overflow:hidden;
  }
  .btn-primary::after { content:''; position:absolute; inset:0; background:linear-gradient(135deg,rgba(255,255,255,.15),transparent); opacity:0; transition:opacity .2s; }
  .btn-primary:hover { transform:translateY(-2px); box-shadow:0 8px 32px rgba(201,168,76,.5); }
  .btn-primary:hover::after { opacity:1; }
  .btn-primary:active { transform:translateY(0); }
  .btn-primary:disabled { opacity:.5; cursor:not-allowed; transform:none; }
  .btn-google {
    background:var(--paper); color:var(--ink); border:1.5px solid var(--pearl); border-radius:10px;
    padding:13px 24px; font-family:var(--font-body); font-size:15px; font-weight:600;
    cursor:pointer; transition:all .2s; box-shadow:0 2px 12px rgba(0,0,0,.06);
    display:flex; align-items:center; gap:10px; justify-content:center;
  }
  .btn-google:hover { border-color:var(--gold); box-shadow:0 4px 20px rgba(201,168,76,.2); transform:translateY(-1px); }
  .btn-outline {
    background:transparent; color:var(--gold2); border:1.5px solid var(--gold);
    border-radius:10px; padding:12px 28px; font-family:var(--font-body);
    font-size:14px; font-weight:600; cursor:pointer; transition:all .2s; letter-spacing:.2px;
  }
  .btn-outline:hover { background:var(--gold-light); }
  .card { background:var(--paper); border-radius:var(--radius); box-shadow:var(--shadow); padding:32px; border:1px solid rgba(201,168,76,.15); }
  .field { display:flex; flex-direction:column; gap:6px; }
  .field label { font-weight:600; font-size:13px; color:var(--smoke); letter-spacing:.5px; text-transform:uppercase; }
  .field input,.field select,.field textarea {
    border:1.5px solid var(--pearl); border-radius:10px; padding:13px 16px;
    font-family:var(--font-body); font-size:15px; color:var(--ink);
    transition:border-color .2s,box-shadow .2s; outline:none; background:var(--paper);
  }
  .field input:focus,.field select:focus,.field textarea:focus { border-color:var(--gold); box-shadow:0 0 0 3px var(--gold-glow); }
  .pill { display:inline-flex; align-items:center; gap:6px; background:var(--gold-light); color:var(--gold2); border-radius:999px; padding:5px 14px; font-size:12px; font-weight:700; letter-spacing:.4px; text-transform:uppercase; }
  .progress-track { background:var(--pearl); border-radius:999px; height:6px; overflow:hidden; }
  .progress-fill { height:100%; border-radius:999px; background:linear-gradient(90deg,var(--gold),#E8C97A); transition:width .8s cubic-bezier(.22,1,.36,1); }
  .nav {
    position:sticky; top:0; z-index:100;
    background:rgba(250,250,247,.92); backdrop-filter:blur(16px);
    border-bottom:1px solid rgba(201,168,76,.2);
    display:flex; align-items:center; justify-content:space-between; padding:0 36px; height:64px;
  }
  .nav-logo {
    font-family:var(--font-display); font-weight:900; font-size:20px;
    background:linear-gradient(135deg,var(--gold),var(--gold2));
    -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; letter-spacing:-.3px;
  }
  .container { max-width:800px; margin:0 auto; padding:0 20px; }
  .stack { display:flex; flex-direction:column; }
  .row { display:flex; align-items:center; }
  .gap-4{gap:4px} .gap-8{gap:8px} .gap-10{gap:10px} .gap-12{gap:12px} .gap-14{gap:14px} .gap-16{gap:16px} .gap-20{gap:20px} .gap-24{gap:24px} .gap-32{gap:32px}
  .dots span { display:inline-block; width:8px; height:8px; background:var(--gold); border-radius:50%; margin:0 3px; animation:bounce .9s infinite; }
  .dots span:nth-child(2){animation-delay:.15s} .dots span:nth-child(3){animation-delay:.3s}
  @keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-8px)} }
  .streak { background:linear-gradient(135deg,#FEF3C7,#FDE68A); border:1.5px solid var(--gold); color:#78520A; border-radius:12px; padding:14px 20px; font-weight:700; font-size:20px; }
  .hero { min-height:calc(100vh - 64px); display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:60px 20px; width:100%; max-width:100%; position:relative; overflow:hidden; background:var(--paper); }
  .hero::before { content:''; position:absolute; width:700px; height:700px; border-radius:50%; background:radial-gradient(circle,rgba(201,168,76,.12) 0%,transparent 70%); top:-200px; left:50%; transform:translateX(-50%); pointer-events:none; }
  .hero h1 { font-size:clamp(36px,6vw,72px); font-weight:900; line-height:1.05; letter-spacing:-2px; max-width:780px; color:var(--ink); animation: fadeUp .6s cubic-bezier(.22,1,.36,1) .1s both; }
  .hero h1 span { background:linear-gradient(135deg,var(--gold),#E8C04A,var(--gold2)); background-size:200% auto; -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; animation: shimmer 4s linear infinite; }
  .hero p { color:var(--smoke); font-size:18px; max-width:500px; line-height:1.7; margin-top:20px; font-weight:400; }
  .hero-badge { display:inline-flex; align-items:center; gap:8px; background:var(--ink); color:var(--gold-light); border-radius:999px; padding:8px 20px; font-size:13px; font-weight:600; letter-spacing:.5px; margin-bottom:28px; animation: fadeUp .5s cubic-bezier(.22,1,.36,1) both; }
  .hero-badge span { width:6px; height:6px; background:var(--gold); border-radius:50%; animation:pulse-gold 2s infinite; }
  .feature-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; margin-top:56px; max-width:680px; width:100%; }
  .feature-card { background:var(--paper); border-radius:14px; padding:22px; border:1px solid rgba(201,168,76,.2); box-shadow:0 2px 16px rgba(0,0,0,.05); text-align:left; transition:transform .2s, box-shadow .2s; }
  .feature-card:hover { transform:translateY(-3px); box-shadow:0 8px 32px rgba(201,168,76,.15); }
  .feature-icon { font-size:26px; margin-bottom:10px; }
  .feature-card h4 { font-size:14px; font-weight:700; font-family:var(--font-body); color:var(--ink); }
  .feature-card p { font-size:12px; color:var(--smoke); margin-top:4px; line-height:1.5; }
  .divider { display:flex; align-items:center; gap:12px; color:var(--mist); font-size:13px; margin:4px 0; }
  .divider::before,.divider::after { content:""; flex:1; height:1px; background:var(--pearl); }
  .lec-section { margin-bottom:16px; }
  .lec-label { font-size:11px; font-weight:700; color:var(--gold2); text-transform:uppercase; letter-spacing:1px; margin-bottom:6px; }
  .lec-content { font-size:15px; line-height:1.8; color:var(--ink); }
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
  @media(max-width:360px){ .hero h1 { font-size:26px; } .feature-grid { grid-template-columns:1fr; } }
`;

function EmailSettingsModal({ onClose, userEmail, userName }) {
  const [svc,setSvc]=useState(localStorage.getItem("ejs_service")||"");
  const [tpl,setTpl]=useState(localStorage.getItem("ejs_template")||"");
  const [key,setKey]=useState(localStorage.getItem("ejs_key")||"");
  const [saved,setSaved]=useState(false);
  const [testing,setTesting]=useState(false);
  const [testMsg,setTestMsg]=useState("");
  const save=()=>{localStorage.setItem("ejs_service",svc);localStorage.setItem("ejs_template",tpl);localStorage.setItem("ejs_key",key);EJS.serviceId=svc;EJS.templateId=tpl;EJS.publicKey=key;setSaved(true);setTimeout(()=>setSaved(false),2000);};
  const test=async()=>{save();setTesting(true);setTestMsg("");const ok=await sendStreakLostEmail(userName||"Student",userEmail||"",7);setTestMsg(ok?"✅ Test email sent!":"❌ Failed — check your EmailJS IDs.");setTesting(false);};
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="card" style={{width:"100%",maxWidth:500,maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div><h3>📧 Email Reminder Setup</h3><p style={{fontSize:13,color:"var(--smoke)",marginTop:2}}>Get notified when you lose your streak</p></div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:"var(--smoke)"}}>✕</button>
        </div>
        <div className="stack gap-14">
          <div className="field"><label>Service ID</label><input placeholder="service_abc123" value={svc} onChange={e=>setSvc(e.target.value)}/></div>
          <div className="field"><label>Template ID</label><input placeholder="template_xyz789" value={tpl} onChange={e=>setTpl(e.target.value)}/></div>
          <div className="field"><label>Public Key</label><input placeholder="AbCdEfGhIj" value={key} onChange={e=>setKey(e.target.value)}/></div>
        </div>
        {testMsg&&<div style={{marginTop:14,padding:"10px 14px",borderRadius:10,fontSize:14,background:testMsg.startsWith("✅")?"#D1FAE5":"#FEE2E2",color:testMsg.startsWith("✅")?"#065F46":"#991B1B"}}>{testMsg}</div>}
        <div className="row gap-12" style={{marginTop:20}}>
          <button className="btn-primary" onClick={save} style={{flex:1}}>{saved?"✅ Saved!":"Save"}</button>
          <button className="btn-outline" onClick={test} disabled={testing} style={{flex:1}}>{testing?"Sending…":"Test Email"}</button>
        </div>
      </div>
    </div>
  );
}

function Nav({ user, onLogout, onNav, page, onOpenEmailSettings, emailConfigured, isDemo, onSignUp }) {
  return (
    <nav className="nav">
      <div style={{display:"flex",flexDirection:"column",lineHeight:1.1}}>
        <span className="nav-logo">✦ Velorn</span>
        <span style={{fontSize:10,color:"var(--smoke)",letterSpacing:.5,fontFamily:"var(--font-body)",fontWeight:500}}>Study smarter</span>
      </div>
      {user&&(
        <div className="row gap-12" style={{flexWrap:"wrap"}}>
          {["dashboard","learn","test"].map(p=>(
            <button key={p} onClick={()=>onNav(p)} style={{background:"none",border:"none",cursor:"pointer",fontFamily:"var(--font-body)",fontSize:14,color:page===p?"var(--gold2)":"var(--smoke)",fontWeight:page===p?700:400,textTransform:"capitalize",borderBottom:page===p?"2px solid var(--gold)":"2px solid transparent",paddingBottom:2}}>{p==="learn"?"Learn":p==="test"?"Test":"Dashboard"}</button>
          ))}
          {!isDemo&&<button onClick={onOpenEmailSettings} style={{background:emailConfigured?"#D1FAE5":"var(--gold-light)",border:emailConfigured?"1.5px solid #10B981":"1.5px solid var(--gold)",borderRadius:10,padding:"5px 12px",cursor:"pointer",fontSize:13,fontWeight:600,color:emailConfigured?"#065F46":"var(--gold2)",display:"flex",alignItems:"center",gap:4}}>{emailConfigured?"🔔 ON":"🔕 Remind"}</button>}
          {isDemo?<button className="btn-primary" style={{padding:"6px 16px",fontSize:13}} onClick={onSignUp}>Sign Up Free 🚀</button>:<button className="btn-outline" style={{padding:"6px 16px",fontSize:13}} onClick={onLogout}>Logout</button>}
        </div>
      )}
    </nav>
  );
}

function Landing({ onStart, onDemo }) {
  return (
    <div className="page hero">
      <div className="hero-badge"><span/> Free for students aged 13–18</div>
      <h1>Turn Any Interest Into<br/><span>A Clear Learning Path</span></h1>
      <p style={{marginTop:16,fontSize:17,color:"var(--smoke)",maxWidth:480,lineHeight:1.7}}>
        Chess. Coding. Art. Entrepreneurship. Whatever you want to learn —
        Velorn builds you a personal 6-month plan with daily lessons, weekly tests, and an AI professor by your side.
      </p>
      <div style={{display:"flex",gap:12,marginTop:28,flexWrap:"wrap",justifyContent:"center"}}>
        <button className="btn-primary" style={{fontSize:16,padding:"16px 44px",borderRadius:12}} onClick={onStart}>Build My Roadmap →</button>
        <button className="btn-outline" style={{fontSize:16,padding:"16px 44px",borderRadius:12}} onClick={onDemo}>👀 Try Demo</button>
      </div>
      <div className="feature-grid">
        {[{icon:"🎯",title:"Any Interest",desc:"Chess, coding, art, business — you name it, we map it"},{icon:"📅",title:"Daily Lessons",desc:"5 focused lectures every day, never overwhelming"},{icon:"🧠",title:"AI Professor",desc:"Ask anything, get instant clear explanations"},{icon:"📝",title:"Weekly Tests",desc:"25 MCQs with instant feedback & scores"},{icon:"📊",title:"Progress Tracking",desc:"See exactly how far you've come"},{icon:"🔥",title:"Streak System",desc:"Stay motivated with daily streaks"}].map(f=>(
          <div className="feature-card" key={f.title}><div className="feature-icon">{f.icon}</div><h4>{f.title}</h4><p>{f.desc}</p></div>
        ))}
      </div>
    </div>
  );
}

function Auth({ onAuth }) {
  const [mode,setMode]=useState("signup");
  const [form,setForm]=useState({name:"",age:"",grade:"",email:"",password:""});
  const [err,setErr]=useState("");
  const [loading,setLoading]=useState(false);
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const handleGoogle=async()=>{setLoading(true);setErr("");const redirectTo=window.location.hostname==="localhost"?"http://localhost:5173":"https://velorn.vercel.app";const{error}=await supabase.auth.signInWithOAuth({provider:"google",options:{redirectTo}});if(error){setErr(error.message);setLoading(false);}};
  const handleSubmit=async()=>{
    setErr("");setLoading(true);
    if(mode==="signup"){
      if(!form.name||!form.age||!form.grade||!form.email||!form.password){setErr("All fields are required.");setLoading(false);return;}
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
    <div className="page container" style={{paddingTop:60,paddingBottom:60}}>
      <div className="card" style={{maxWidth:460,margin:"0 auto"}}>
        <h2 style={{marginBottom:4}}>{mode==="signup"?"Create your account":"Welcome back"}</h2>
        <p style={{color:"var(--smoke)",fontSize:14,marginBottom:24}}>{mode==="signup"?"Start your AI learning journey today":"Log in to continue your roadmap"}</p>
        <button className="btn-google" style={{width:"100%",marginBottom:8}} onClick={handleGoogle} disabled={loading}>
          <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
          Continue with Google
        </button>
        <div className="divider">or</div>
        {err&&<p style={{color:"var(--ember)",fontSize:13,margin:"8px 0"}}>{err}</p>}
        <div className="stack gap-14" style={{marginTop:8}}>
          {mode==="signup"&&<><div className="field"><label>Full Name</label><input placeholder="Your full name" value={form.name} onChange={e=>set("name",e.target.value)}/></div><div className="row gap-12"><div className="field" style={{flex:1}}><label>Age</label><input type="number" min="13" max="18" placeholder="15" value={form.age} onChange={e=>set("age",e.target.value)}/></div><div className="field" style={{flex:1}}><label>Class/Grade</label><input placeholder="Grade 10" value={form.grade} onChange={e=>set("grade",e.target.value)}/></div></div></>}
          <div className="field"><label>Email</label><input type="email" placeholder="you@email.com" value={form.email} onChange={e=>set("email",e.target.value)}/></div>
          <div className="field"><label>Password</label><input type="password" placeholder="••••••••" value={form.password} onChange={e=>set("password",e.target.value)}/></div>
          <button className="btn-primary" onClick={handleSubmit} disabled={loading}>{loading?"Please wait…":mode==="signup"?"Create Account →":"Log In →"}</button>
          <p style={{textAlign:"center",fontSize:13,color:"var(--smoke)"}}>{mode==="signup"?"Already have an account? ":"New here? "}<span style={{color:"var(--sky-ink)",cursor:"pointer",fontWeight:600}} onClick={()=>{setMode(m=>m==="signup"?"login":"signup");setErr("");}}>{mode==="signup"?"Log in":"Sign up"}</span></p>
        </div>
      </div>
    </div>
  );
}

const LOADING_STEPS=[{icon:"🧙‍♂️",text:"Professor Max is reviewing your goals…"},{icon:"🗺️",text:"Mapping out your 6-month journey…"},{icon:"📅",text:"Scheduling daily tasks just for you…"},{icon:"🧪",text:"Preparing weekly tests and challenges…"},{icon:"⚡",text:"Adding secret professor tips…"},{icon:"✨",text:"Putting the final touches on your roadmap…"}];
function RoadmapLoader() {
  const [step,setStep]=useState(0);const [progress,setProgress]=useState(0);
  useEffect(()=>{const si=setInterval(()=>setStep(s=>s<LOADING_STEPS.length-1?s+1:s),3500);const pi=setInterval(()=>setProgress(p=>p<95?p+1:p),220);return()=>{clearInterval(si);clearInterval(pi);};},[]);
  return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px 20px",background:"var(--paper)",textAlign:"center"}}>
      <div style={{width:100,height:100,borderRadius:"50%",background:"linear-gradient(135deg,var(--gold-light),var(--gold))",display:"flex",alignItems:"center",justifyContent:"center",fontSize:52,marginBottom:32,boxShadow:"0 8px 40px rgba(201,168,76,.4)",animation:"pulse-gold 2s infinite"}}>{LOADING_STEPS[step].icon}</div>
      <h2 style={{fontSize:26,marginBottom:12}}>Building Your Roadmap</h2>
      <p style={{color:"var(--smoke)",fontSize:16,maxWidth:340,marginBottom:36,lineHeight:1.6,minHeight:52,transition:"all .4s ease"}}>{LOADING_STEPS[step].text}</p>
      <div style={{width:"100%",maxWidth:360,marginBottom:12}}>
        <div style={{background:"var(--pearl)",borderRadius:999,height:8,overflow:"hidden"}}><div style={{height:"100%",borderRadius:999,background:"linear-gradient(90deg,var(--gold),#E8C97A)",width:`${progress}%`,transition:"width .3s ease"}}/></div>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:8,fontSize:13,color:"var(--mist)"}}><span>Generating with AI…</span><span style={{fontWeight:700,color:"var(--gold2)"}}>{progress}%</span></div>
      </div>
      <p style={{marginTop:32,fontSize:13,color:"var(--mist)",fontStyle:"italic"}}>This takes about 20–30 seconds ☕</p>
    </div>
  );
}

function Onboarding({ user, profile, onDone }) {
  const [form,setForm]=useState({career:"",level:"Beginner",time:"1 hour",goal:"Strong foundation"});
  const [loading,setLoading]=useState(false);
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const generate=async()=>{
    if(!form.career.trim()){alert("Please enter what you want to learn!");return;}
    setLoading(true);
    const name=profile?.full_name||user?.user_metadata?.full_name||user?.email||"Student";
    const age=profile?.age||"15";const grade=profile?.grade||"High School";
    const prompt=`Create a 6-month learning roadmap. Student: Name ${name}, Age ${age}, Grade ${grade}, Topic "${form.career}", Level ${form.level}, Time ${form.time}, Goal ${form.goal}.
Return ONLY valid JSON no markdown:
{"title":"6-Month ${form.career} Roadmap for ${name}","months":[{"month":1,"theme":"Theme","focus":"Focus","weeks":[{"week":1,"goal":"Goal","days":[{"day":1,"task":"Task"},{"day":2,"task":"Task"},{"day":3,"task":"Task"},{"day":4,"task":"Task"},{"day":5,"task":"Task"},{"day":6,"task":"Mini project"},{"day":7,"task":"Review 🌟"}],"testTopic":"Topic"}]}]}
Generate ALL 6 months ALL 4 weeks. Every task specific to "${form.career}".`;
    try {
      const raw=await askClaude([{role:"user",content:prompt}]);
      const jsonMatch=raw.match(/\{[\s\S]*\}/);
      if(!jsonMatch)throw new Error("No JSON");
      const roadmap=JSON.parse(jsonMatch[0]);
      await upsertRoadmap(user.id,roadmap,{career:form.career,level:form.level,daily_time:form.time,goal:form.goal});
      const initProgress={current_month:1,current_week:1,current_day:1,streak:0,completed_days:[],last_visit:new Date().toISOString().slice(0,10)};
      await upsertProgress(user.id,initProgress);onDone(roadmap,dbToProgress(initProgress));
    } catch(e) {
      const fallback=buildFallback(form);
      await upsertRoadmap(user.id,fallback,{career:form.career,level:form.level,daily_time:form.time,goal:form.goal});
      const initProgress={current_month:1,current_week:1,current_day:1,streak:0,completed_days:[],last_visit:new Date().toISOString().slice(0,10)};
      await upsertProgress(user.id,initProgress);onDone(fallback,dbToProgress(initProgress));
    }
    setLoading(false);
  };
  if(loading)return <RoadmapLoader/>;
  const name=profile?.full_name||user?.user_metadata?.full_name||"there";
  return (
    <div className="page container" style={{paddingTop:60,paddingBottom:60}}>
      <div className="card" style={{maxWidth:540,margin:"0 auto"}}>
        <div style={{marginBottom:28}}><h2>Hey {name}! 👋</h2><p style={{color:"var(--smoke)",fontSize:14,marginTop:4}}>Tell us a bit more so we can build the perfect roadmap for you.</p></div>
        <div className="stack gap-20">
          <div className="field"><label>What do you want to learn?</label><input placeholder="e.g. Chess, Web Dev, Digital Art, Entrepreneurship…" value={form.career} onChange={e=>set("career",e.target.value)}/></div>
          <div className="field"><label>Current skill level</label><select value={form.level} onChange={e=>set("level",e.target.value)}><option>Beginner</option><option>Intermediate</option></select></div>
          <div className="field"><label>Time available per day</label><select value={form.time} onChange={e=>set("time",e.target.value)}><option>1 hour</option><option>2 hours</option><option>3+ hours</option></select></div>
          <div className="field"><label>Main goal</label><select value={form.goal} onChange={e=>set("goal",e.target.value)}><option>Strong foundation</option><option>Job ready</option><option>Build projects</option></select></div>
          <button className="btn-primary" style={{marginTop:8}} onClick={generate}>Generate My Roadmap ✨</button>
        </div>
      </div>
    </div>
  );
}

function buildFallback(form) {
  const career=form.career||"your chosen field";const lc=career.toLowerCase();
  const careerThemes={entrepreneur:["Business Foundations","Market Research & Validation","Building Your Product/Service","Marketing & Sales","Finance & Operations","Scaling & Growth"],coding:["Programming Basics","Data Structures","Web Development","Databases & APIs","Projects & Portfolio","Job Preparation"],chess:["Chess Basics","Tactics & Puzzles","Opening Principles","Middlegame Strategy","Endgame Mastery","Tournament Preparation"],art:["Drawing Fundamentals","Color Theory","Digital Art","Illustration","Style Development","Portfolio & Career"],music:["Music Theory Basics","Instrument Fundamentals","Scales & Chords","Composition","Production","Performance & Career"]};
  let themes=null;for(const [key,val] of Object.entries(careerThemes)){if(lc.includes(key)){themes=val;break;}}
  if(!themes)themes=[`${career} Fundamentals`,`Core ${career} Skills`,`${career} in Practice`,`Advanced ${career} Concepts`,`Real-world ${career} Projects`,`${career} Mastery & Career`];
  const weekTopics={0:["Getting Started","Core Basics","Key Concepts","First Project"],1:["Deep Dive","Practical Skills","Real Examples","Week Review"],2:["Advanced Topics","Case Studies","Hands-on Practice","Assessment"],3:["Expert Techniques","Industry Insights","Build Something","Milestone Review"],4:["Refinement","Problem Solving","Creative Application","Progress Check"],5:["Mastery","Portfolio Work","Final Project","Graduation 🎓"]};
  return {title:`6-Month ${career} Roadmap`,months:themes.map((theme,mi)=>({month:mi+1,theme,focus:`Month ${mi+1}: ${theme}`,weeks:[1,2,3,4].map(wi=>({week:wi,goal:`${weekTopics[mi]?.[wi-1]||"Weekly Goals"} — ${theme}`,days:[1,2,3,4,5,6,7].map(di=>({day:di,task:di===7?`Review & reflect on ${theme} 🌟`:`${theme}: Study sub-topic ${di} and practice`})),testTopic:theme}))}))};
}

const DEMO_THEMES=["Business Foundations","Market Research","Building Your Product","Marketing & Sales","Finance & Operations","Scaling & Growth"];
const DEMO_ROADMAP={title:"6-Month Entrepreneurship Roadmap — Demo",months:Array.from({length:6},(_,mi)=>({month:mi+1,theme:DEMO_THEMES[mi],focus:`Month ${mi+1}: ${DEMO_THEMES[mi]}`,weeks:Array.from({length:4},(_,wi)=>({week:wi+1,goal:`Week ${wi+1} — ${DEMO_THEMES[mi]}`,days:Array.from({length:7},(_,di)=>({day:di+1,task:di===6?`Review & reflect on Week ${wi+1} 🌟`:`${DEMO_THEMES[mi]}: Study and practice sub-topic ${di+1}`})),testTopic:DEMO_THEMES[mi]}))}))};
const DEMO_PROGRESS={currentMonth:1,currentWeek:1,currentDay:1,streak:3,completedDays:["m1w1d1","m1w1d2","m1w1d3"]};

function Dashboard({ user, roadmap, progress, onUpdateProgress, onNav, isDemo }) {
  const{currentMonth=1,currentWeek=1,currentDay=1,streak=1,completedDays=[]}=progress;
  const totalDays=180;const pct=Math.min(100,Math.round((completedDays.length/totalDays)*100));
  const month=roadmap.months[currentMonth-1];const week=month?.weeks[currentWeek-1];
  const todayTask=week?.days[currentDay-1]?.task??"All caught up! Great job 🎉";
  const markDone=async()=>{
    if(isDemo){alert("Sign up to track your real progress! 🚀");return;}
    const key=`m${currentMonth}w${currentWeek}d${currentDay}`;if(completedDays.includes(key))return;
    const newCompleted=[...completedDays,key];let nd=currentDay+1,nw=currentWeek,nm=currentMonth;
    if(nd>7){nd=1;nw++;}if(nw>4){nw=1;nm++;}if(nm>6)nm=6;
    const next={...progress,completedDays:newCompleted,streak:streak+1,currentDay:nd,currentWeek:nw,currentMonth:nm};
    await upsertProgress(user.id,progressToDb(next));onUpdateProgress(next);
  };
  return (
    <div className="page container" style={{paddingTop:40,paddingBottom:60}}>
      <div style={{marginBottom:32}}><h2 style={{fontSize:28}}>Welcome back! 👋</h2><p style={{color:"var(--smoke)",marginTop:4}}>{roadmap.title}</p></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:16,marginBottom:28}}>
        <div className="card" style={{padding:20,textAlign:"center"}}><div style={{fontSize:13,color:"var(--smoke)",marginBottom:4,fontWeight:600,letterSpacing:.5,textTransform:"uppercase"}}>Month</div><div style={{fontSize:32,fontWeight:800,color:"var(--gold2)",fontFamily:"var(--font-display)"}}>{currentMonth}<span style={{fontSize:16}}>/6</span></div></div>
        <div className="card" style={{padding:20,textAlign:"center"}}><div style={{fontSize:13,color:"var(--smoke)",marginBottom:4,fontWeight:600,letterSpacing:.5,textTransform:"uppercase"}}>Week</div><div style={{fontSize:32,fontWeight:800,color:"var(--gold2)",fontFamily:"var(--font-display)"}}>{currentWeek}<span style={{fontSize:16}}>/4</span></div></div>
        <div className="streak" style={{padding:20,textAlign:"center"}}><div style={{fontSize:13,marginBottom:4,fontWeight:600,letterSpacing:.5,textTransform:"uppercase"}}>🔥 Streak</div><div style={{fontSize:32}}>{streak} days</div></div>
        <div className="card" style={{padding:20,textAlign:"center"}}><div style={{fontSize:13,color:"var(--smoke)",marginBottom:4,fontWeight:600,letterSpacing:.5,textTransform:"uppercase"}}>Progress</div><div style={{fontSize:32,fontWeight:800,color:"var(--emerald)",fontFamily:"var(--font-display)"}}>{pct}%</div></div>
      </div>
      <div className="card" style={{marginBottom:20}}><div className="row" style={{justifyContent:"space-between",marginBottom:10}}><span style={{fontWeight:600}}>Overall Progress</span><span style={{color:"var(--smoke)",fontSize:14}}>{completedDays.length} / {totalDays} days</span></div><div className="progress-track"><div className="progress-fill" style={{width:`${pct}%`}}/></div></div>
      <div className="card" style={{marginBottom:20,borderLeft:"4px solid var(--sky-ink)"}}>
        <div className="pill" style={{marginBottom:12}}>📅 Today's Task — Day {currentDay}</div>
        <p style={{fontSize:17,lineHeight:1.6,marginBottom:20}}>{todayTask}</p>
        <div className="row gap-12"><button className="btn-primary" onClick={()=>onNav("learn")}>Start Learning →</button><button className="btn-outline" onClick={markDone}>Mark Complete ✓</button></div>
      </div>
      {week&&(<div className="card"><h3 style={{marginBottom:8}}>🎯 Week {currentWeek} Goal</h3><p style={{color:"var(--smoke)",lineHeight:1.6,marginBottom:12}}>{week.goal}</p><div className="row gap-8"><span className="pill">Test topic: {week.testTopic}</span><button className="btn-outline" style={{padding:"6px 16px",fontSize:13}} onClick={()=>onNav("test")}>Take Test</button></div></div>)}
    </div>
  );
}

const PROFESSOR_SYSTEM=`You are Professor Max — warm, funny, speaks like a cool older friend. NEVER write like a textbook. Short punchy sentences. Always say "you".`;

function Learn({ progress, roadmap, onUpdateProgress, user, isDemo, onSignUp }) {
  const{currentMonth=1,currentWeek=1,currentDay=1}=progress;
  const month=roadmap.months[currentMonth-1];const week=month?.weeks[currentWeek-1];const weekTopic=week?.goal??"Core Concepts";
  const[lectures,setLectures]=useState(null);const[activeLecture,setActiveLecture]=useState(0);const[loading,setLoading]=useState(false);
  const[doubt,setDoubt]=useState("");const[answer,setAnswer]=useState("");const[loadingDoubt,setLoadingDoubt]=useState(false);
  const[dayDone,setDayDone]=useState(false);const[showTask,setShowTask]=useState(false);const[taskSteps,setTaskSteps]=useState({});
  const[taskSubmitted,setTaskSubmitted]=useState(false);const[taskFeedback,setTaskFeedback]=useState("");const[loadingFeedback,setLoadingFeedback]=useState(false);
  const[taskDoubt,setTaskDoubt]=useState("");const[taskDoubtAnswer,setTaskDoubtAnswer]=useState("");const[loadingTaskDoubt,setLoadingTaskDoubt]=useState(false);

  useEffect(()=>{setLectures(null);setActiveLecture(0);setAnswer("");setDayDone(false);setShowTask(false);setTaskSteps({});setTaskSubmitted(false);setTaskFeedback("");loadLectures();},[currentMonth,currentWeek,currentDay]);

  const loadLectures=async()=>{
    setLoading(true);
    const prompt=`You are a world-class mentor teaching a 14-year-old beginner.
Topic: "${weekTopic}"
Context: "${roadmap.title}"
Generate EXACTLY 5 lectures. Return ONLY valid JSON. No markdown, no backticks, no extra text.
{"lectures":[{"num":1,"title":"Clear title","coreIdea":"2-3 lines explaining the concept simply","example":"Real-world example relevant to ${roadmap.title}","action":"One small task the student can do today","mistake":"Common beginner mistake","takeaway":"One powerful sentence"},{"num":2,"title":"...","coreIdea":"...","example":"...","action":"...","mistake":"...","takeaway":"..."},{"num":3,"title":"...","coreIdea":"...","example":"...","action":"...","mistake":"...","takeaway":"..."},{"num":4,"title":"...","coreIdea":"...","example":"...","action":"...","mistake":"...","takeaway":"..."},{"num":5,"title":"...","coreIdea":"...","example":"...","action":"...","mistake":"...","takeaway":"...","homework":["Specific task 1","Specific task 2"]}]}`;
    let raw="";
    try{raw=await askClaude([{role:"user",content:prompt}]);console.log("Raw:",raw?.substring(0,200));}catch(e){console.error("askClaude failed:",e);raw="";}
    if(raw&&raw.trim()){
      try{
        let cleaned=raw.trim().replace(/```json|```/gi,"").replace(/,(\s*[}\]])/g,"$1");
        const jsonMatch=cleaned.match(/\{[\s\S]*\}/);
        if(jsonMatch){
          const parsed=JSON.parse(jsonMatch[0]);
          let arr=Array.isArray(parsed)?parsed:parsed.lectures&&Array.isArray(parsed.lectures)?parsed.lectures:[];
          if(arr.length>=3){console.log("✅ Parsed",arr.length,"lectures");setLectures(arr);setLoading(false);return;}
        }
      }catch(e){console.warn("Parse failed:",e.message);}
    }
    // Fallback
    setLectures(Array.from({length:5},(_,i)=>({num:i+1,title:`${["🔥","💡","🚀","🎯","🏆"][i]} ${weekTopic} — Part ${i+1}`,coreIdea:`${weekTopic} is a core concept in ${roadmap.title} that separates beginners from professionals.`,example:`In ${roadmap.title}, this shows up when working on real projects.`,action:`Spend 10 minutes applying this concept to something small in ${roadmap.title}.`,mistake:`Most beginners skip this and jump ahead — don't. Build the foundation first.`,takeaway:`Mastering ${weekTopic} deeply is what separates serious practitioners from everyone else.`,homework:i===4?[`Find one real-world example of ${weekTopic} in ${roadmap.title}`,`Apply what you learned today to something small but real`]:null})));
    setLoading(false);
  };

  const submitDoubt=async()=>{if(!doubt.trim()||loadingDoubt)return;setLoadingDoubt(true);setAnswer("");try{const res=await askClaude([{role:"user",content:`${PROFESSOR_SYSTEM}\n\nStudent learning "${roadmap.title}", studying "${weekTopic}". They ask: "${doubt}"\n\nAnswer as Professor Max. Warm, funny, specific. Under 150 words.`}]);setAnswer(res||"⚠️ No response. Try again!");}catch(e){setAnswer("⚠️ Something broke");}setLoadingDoubt(false);};
  const markDone=()=>{setDayDone(true);if(onUpdateProgress)onUpdateProgress({type:"complete_day"});};

  const getWeeklyTask=()=>{
    const lc=roadmap.title.toLowerCase();
    if(lc.includes("entrepreneur"))return{title:"🚀 Build Your Business Concept",description:"Apply today's lectures. Build a real mini business concept.",steps:[{id:"problem",label:"The Problem",prompt:"Describe a real problem you've noticed.",placeholder:"e.g. Students have no affordable printing after 8pm..."},{id:"solution",label:"Your Solution",prompt:"What product/service solves this?",placeholder:"e.g. A 24/7 self-service print kiosk..."},{id:"customer",label:"Target Customer",prompt:"Who is your ideal customer?",placeholder:"e.g. Students aged 14-22..."},{id:"money",label:"Revenue Model",prompt:"How do you make money?",placeholder:"e.g. ₹5 per page..."},{id:"edge",label:"Why You'll Win",prompt:"What makes you better?",placeholder:"e.g. No competitor offers 24/7..."}]};
    if(lc.includes("art"))return{title:"🎨 Design Your Concept Art",description:"Design a complete artwork concept.",steps:[{id:"concept",label:"The Concept",prompt:"What is your artwork about?",placeholder:"e.g. Loneliness of a city at night..."},{id:"composition",label:"Composition",prompt:"How will you arrange elements?",placeholder:"e.g. A lone figure at bottom-left..."},{id:"color",label:"Color Palette",prompt:"What colors and why?",placeholder:"e.g. Deep blues and purples..."},{id:"light",label:"Light & Shadow",prompt:"Where is your light source?",placeholder:"e.g. Single streetlamp..."},{id:"style",label:"Style",prompt:"What medium or style?",placeholder:"e.g. Digital painting..."}]};
    if(lc.includes("cod")||lc.includes("program"))return{title:"💻 Design Your Mini Project",description:"Design a real mini project.",steps:[{id:"idea",label:"Project Idea",prompt:"What will you build?",placeholder:"e.g. A habit tracker..."},{id:"features",label:"Core Features",prompt:"List 3-5 key features.",placeholder:"e.g. Track habits, streak counter..."},{id:"tech",label:"Tech Stack",prompt:"What technologies?",placeholder:"e.g. React, Supabase..."},{id:"data",label:"Data Structure",prompt:"What data does it store?",placeholder:"e.g. User: {id, name}..."},{id:"challenge",label:"Biggest Challenge",prompt:"What will be hardest?",placeholder:"e.g. Notifications..."}]};
    return{title:`🎯 Apply Your ${roadmap.title} Knowledge`,description:"Apply what you've learned.",steps:[{id:"learning",label:"Key Learnings",prompt:"What are the 3 most important things from today?",placeholder:"Write here..."},{id:"apply",label:"Real World Application",prompt:`Where would you use ${weekTopic}?`,placeholder:"Write here..."},{id:"project",label:"Mini Project Plan",prompt:`Design a small project to practice ${weekTopic}.`,placeholder:"Write here..."},{id:"challenge",label:"Your Challenge",prompt:"What was hardest to understand?",placeholder:"Write here..."},{id:"next",label:"Next Steps",prompt:"What do you want to explore next?",placeholder:"Write here..."}]};
  };

  const submitTask=async()=>{
    if(isDemo){alert("Sign up to submit tasks and get AI feedback! 🚀");return;}
    const task=getWeeklyTask();if(!task.steps.every(s=>taskSteps[s.id]?.trim().length>10))return;
    setLoadingFeedback(true);const submission=task.steps.map(s=>`${s.label}: ${taskSteps[s.id]}`).join("\n\n");
    let fb="Great work! Your submission shows real thinking and effort.";
    try{const res=await askClaude([{role:"user",content:`Student learning "${roadmap.title}" completed a task on "${weekTopic}".\n\n${submission}\n\nGive detailed encouraging feedback. Point out strengths, areas to improve, 2-3 suggestions. Around 200 words.`}]);if(res&&res.trim().length>20)fb=res;}catch{}
    setTaskFeedback(fb);setTaskSubmitted(true);setLoadingFeedback(false);
    try{const weekKey=`m${currentMonth}w${currentWeek}d${currentDay}`;await saveTaskSubmission(user.id,{weekKey,career:roadmap.title,taskTitle:task.title,answers:taskSteps,feedback:fb});}catch(e){console.warn("Could not save task:",e);}
  };

  const submitTaskDoubt=async()=>{
    if(!taskDoubt.trim())return;setLoadingTaskDoubt(true);setTaskDoubtAnswer("");
    try{const task=getWeeklyTask();const context=task.steps.map(s=>taskSteps[s.id]?`${s.label}: ${taskSteps[s.id]}`:"").filter(Boolean).join("\n");const res=await askClaude([{role:"user",content:`Student working on a task for "${roadmap.title}" (topic: "${weekTopic}").\nWritten so far:\n${context}\nStuck: "${taskDoubt}"\nHelp them directly. Give a concrete example.`}]);setTaskDoubtAnswer(res||"Think from first principles — what does your target need? 💡");}catch{setTaskDoubtAnswer("Break it into smaller parts. 💡");}
    setLoadingTaskDoubt(false);setTaskDoubt("");
  };

  if(loading)return(<div style={{textAlign:"center",padding:"80px 20px"}}><div style={{fontSize:56,marginBottom:16}}>🧙‍♂️</div><div className="dots"><span/><span/><span/></div><p style={{color:"var(--smoke)",marginTop:16,fontStyle:"italic"}}>{`"Preparing 5 lectures for Day ${currentDay}… polishing the whiteboard…"`}</p></div>);

  // ← THE KEY FIX: helper functions to get content from either old or new field names
  const getLectureKeyTakeaway=(lec)=>lec.keyTakeaway||lec.takeaway||"";

  return (
    <div className="page container" style={{paddingTop:24,paddingBottom:60}}>
      <div style={{background:"linear-gradient(135deg,var(--ink),#1A1A2E)",borderRadius:16,padding:"20px 24px",marginBottom:24,borderLeft:"4px solid var(--gold)"}}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:8}}>
          <span className="pill">Month {currentMonth}</span><span className="pill">Week {currentWeek}</span><span className="pill">Day {currentDay}</span>
          <span className="pill" style={{background:"var(--gold)",color:"var(--ink)"}}>🧙‍♂️ PROF. MAX</span>
        </div>
        <h2 style={{color:"#fff",fontSize:20,marginBottom:4}}>Today: {weekTopic}</h2>
        <p style={{color:"rgba(255,255,255,0.6)",fontSize:13}}>5 lectures for Day {currentDay} • Read at your own pace</p>
      </div>

      {lectures&&(
        <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
          <div style={{width:"100%",maxWidth:260,flexShrink:0}}>
            <div className="card" style={{padding:12}}>
              <p style={{fontWeight:700,fontSize:13,marginBottom:10,color:"var(--smoke)",textTransform:"uppercase",letterSpacing:1}}>📋 Day {currentDay} — 5 Lectures</p>
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {lectures.map((l,i)=>(
                  <button key={i} onClick={()=>setActiveLecture(i)} style={{textAlign:"left",padding:"8px 12px",borderRadius:8,border:i===activeLecture?"1.5px solid var(--gold)":"1.5px solid var(--pearl)",background:i===activeLecture?"var(--gold-light)":"transparent",cursor:"pointer",fontSize:13,fontWeight:i===activeLecture?700:400,color:i===activeLecture?"var(--ink)":"var(--smoke)",transition:"all .2s"}}>{i+1}. {l.title}</button>
                ))}
              </div>
            </div>
          </div>

          <div style={{flex:1,minWidth:280}}>
            <div className="card">
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20,paddingBottom:16,borderBottom:"1px solid var(--pearl)"}}>
                <div style={{width:40,height:40,borderRadius:"50%",background:"linear-gradient(135deg,var(--gold-light),var(--gold))",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:16,flexShrink:0}}>{activeLecture+1}</div>
                <h2 style={{fontSize:20,lineHeight:1.3}}>{lectures[activeLecture].title}</h2>
              </div>

              {/* ← FIXED: renders new field names (coreIdea, example, action, mistake) AND old field (body) */}
              <div style={{marginBottom:20}}>
                {lectures[activeLecture].body&&(
                  <div style={{fontSize:16,lineHeight:1.9,color:"var(--ink)",whiteSpace:"pre-wrap",marginBottom:16}}>{lectures[activeLecture].body}</div>
                )}
                {lectures[activeLecture].coreIdea&&(
                  <div className="lec-section">
                    <div className="lec-label">💡 Core Idea</div>
                    <div className="lec-content">{lectures[activeLecture].coreIdea}</div>
                  </div>
                )}
                {lectures[activeLecture].example&&(
                  <div className="lec-section" style={{marginTop:14,padding:"12px 16px",background:"#F8F9FF",borderRadius:10,border:"1px solid var(--pearl)"}}>
                    <div className="lec-label">📌 Real World Example</div>
                    <div className="lec-content">{lectures[activeLecture].example}</div>
                  </div>
                )}
                {lectures[activeLecture].action&&(
                  <div className="lec-section" style={{marginTop:14,padding:"12px 16px",background:"#F0FDF4",borderRadius:10,border:"1px solid #86EFAC"}}>
                    <div className="lec-label" style={{color:"#16A34A"}}>✅ Try This Today</div>
                    <div className="lec-content">{lectures[activeLecture].action}</div>
                  </div>
                )}
                {lectures[activeLecture].mistake&&(
                  <div className="lec-section" style={{marginTop:14,padding:"12px 16px",background:"#FFF5F5",borderRadius:10,border:"1px solid #FECACA"}}>
                    <div className="lec-label" style={{color:"var(--ember)"}}>⚠️ Common Mistake</div>
                    <div className="lec-content">{lectures[activeLecture].mistake}</div>
                  </div>
                )}
              </div>

              {/* Key Takeaway — works for both keyTakeaway and takeaway field names */}
              {getLectureKeyTakeaway(lectures[activeLecture])&&(
                <div style={{background:"linear-gradient(135deg,var(--gold-light),#FFF8E7)",border:"1.5px solid var(--gold)",borderRadius:12,padding:"14px 18px",marginBottom:20}}>
                  <p style={{fontSize:12,fontWeight:700,color:"var(--gold2)",textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>⚡ Key Takeaway</p>
                  <p style={{fontSize:15,fontWeight:600,color:"var(--ink)"}}>{getLectureKeyTakeaway(lectures[activeLecture])}</p>
                </div>
              )}

              {lectures[activeLecture].homework&&(
                <div style={{background:"linear-gradient(135deg,#F0FDF4,#DCFCE7)",border:"2px solid #86EFAC",borderRadius:14,padding:"18px 20px",marginBottom:20}}>
                  <p style={{fontSize:13,fontWeight:700,color:"#16A34A",textTransform:"uppercase",letterSpacing:1,marginBottom:12}}>📝 Today's Homework</p>
                  {lectures[activeLecture].homework.map((task,i)=>(
                    <div key={i} style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:i<lectures[activeLecture].homework.length-1?12:0}}>
                      <div style={{width:26,height:26,borderRadius:"50%",background:"#16A34A",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:13,flexShrink:0}}>{i+1}</div>
                      <p style={{fontSize:15,lineHeight:1.6,color:"var(--ink)",margin:0}}>{task}</p>
                    </div>
                  ))}
                </div>
              )}

              <div style={{display:"flex",gap:10,justifyContent:"space-between"}}>
                <button className="btn-outline" onClick={()=>setActiveLecture(a=>Math.max(0,a-1))} disabled={activeLecture===0} style={{flex:1}}>← Previous</button>
                {activeLecture<lectures.length-1?(
                  <button className="btn-primary" onClick={()=>setActiveLecture(a=>a+1)} style={{flex:1}}>Next Lecture →</button>
                ):(
                  <button className="btn-primary" onClick={()=>{markDone();setShowTask(true);window.scrollTo({top:document.body.scrollHeight,behavior:"smooth"});}} disabled={dayDone} style={{flex:1,background:dayDone?"var(--emerald)":"linear-gradient(135deg,#7C3AED,#5B21B6)"}}>
                    {dayDone?"✅ Done! Scroll Down 👇":"🎯 Complete & Start Task"}
                  </button>
                )}
              </div>
            </div>

            <div style={{marginTop:12,marginBottom:24}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"var(--mist)",marginBottom:6}}><span>Today's Progress</span><span>{activeLecture+1} / {lectures.length}</span></div>
              <div style={{background:"var(--pearl)",borderRadius:999,height:6}}><div style={{height:"100%",borderRadius:999,background:"linear-gradient(90deg,var(--gold),#E8C97A)",width:`${((activeLecture+1)/lectures.length)*100}%`,transition:"width .3s ease"}}/></div>
            </div>

            <div className="card" style={{borderTop:"3px solid var(--gold)"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}><span style={{fontSize:24}}>🧙‍♂️</span><h3>Ask Professor Max</h3></div>
              <p style={{color:"var(--smoke)",fontSize:13,marginBottom:14,fontStyle:"italic"}}>"There are no stupid questions. Only questions that haven't been asked yet."</p>
              <textarea placeholder={`e.g. I don't understand how ${weekTopic} works in real life...`} value={doubt} onChange={e=>setDoubt(e.target.value)} style={{width:"100%",minHeight:90,padding:12,borderRadius:10,border:"1.5px solid var(--pearl)",fontSize:14,resize:"vertical",boxSizing:"border-box"}}/>
              <button className="btn-primary" onClick={submitDoubt} disabled={loadingDoubt||!doubt.trim()} style={{marginTop:10}}>{loadingDoubt?"Professor is thinking… 🤔":"Ask the Professor 🧙‍♂️"}</button>
              {loadingDoubt&&<div style={{textAlign:"center",marginTop:20}}><div className="dots"><span/><span/><span/></div></div>}
              {answer&&(<div style={{marginTop:16,background:"linear-gradient(135deg,#F0F9FF,#E0F2FE)",border:"1.5px solid #BAE6FD",borderLeft:"5px solid var(--sky-ink)",borderRadius:14,padding:"16px 20px",lineHeight:1.85,whiteSpace:"pre-wrap",fontSize:15}}><div style={{fontSize:11,fontWeight:700,color:"var(--sky-ink)",marginBottom:8,textTransform:"uppercase",letterSpacing:1}}>🧙‍♂️ Professor Max Replies:</div>{answer}</div>)}
            </div>
          </div>
        </div>
      )}

      {showTask&&lectures&&(()=>{
        const task=getWeeklyTask();
        return (
          <div style={{marginTop:32}} id="daily-task">
            <div style={{background:"linear-gradient(135deg,#4C1D95,#7C3AED)",borderRadius:16,padding:"24px 28px",marginBottom:24,borderLeft:"4px solid #A78BFA"}}>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}><span className="pill" style={{background:"#7C3AED",color:"#fff"}}>🎯 DAILY TASK</span><span className="pill" style={{background:"#A78BFA",color:"#fff"}}>Apply today's 5 lectures</span></div>
              <h2 style={{color:"#fff",fontSize:22,marginBottom:8}}>{task.title}</h2>
              <p style={{color:"rgba(255,255,255,0.75)",fontSize:14,lineHeight:1.6}}>{task.description}</p>
            </div>
            {!taskSubmitted?(
              <div style={{display:"flex",flexDirection:"column",gap:20}}>
                {task.steps.map((step,si)=>(
                  <div key={step.id} className="card" style={{borderLeft:`4px solid ${["#7C3AED","#2563EB","#059669","#D97706","#DC2626"][si]}`}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}><div style={{width:32,height:32,borderRadius:"50%",flexShrink:0,background:["#7C3AED","#2563EB","#059669","#D97706","#DC2626"][si],color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:14}}>{si+1}</div><h3 style={{fontSize:17}}>{step.label}</h3></div>
                    <p style={{color:"var(--smoke)",fontSize:14,marginBottom:12,lineHeight:1.6,fontStyle:"italic"}}>{step.prompt}</p>
                    <textarea value={taskSteps[step.id]||""} onChange={e=>setTaskSteps(prev=>({...prev,[step.id]:e.target.value}))} placeholder={step.placeholder} style={{width:"100%",minHeight:110,padding:"12px 14px",borderRadius:10,border:`1.5px solid ${taskSteps[step.id]?.trim().length>10?"#10B981":"var(--pearl)"}`,fontSize:14,resize:"vertical",boxSizing:"border-box",lineHeight:1.7,color:"var(--ink)",background:"var(--paper)",transition:"border-color .2s"}}/>
                    {taskSteps[step.id]?.trim().length>10&&<p style={{color:"#10B981",fontSize:12,marginTop:4,fontWeight:600}}>✓ Great answer!</p>}
                  </div>
                ))}
                <div className="card" style={{borderTop:"3px solid #7C3AED"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}><span style={{fontSize:22}}>🧙‍♂️</span><h3>Stuck? Ask Professor Max</h3></div>
                  <textarea value={taskDoubt} onChange={e=>setTaskDoubt(e.target.value)} placeholder="e.g. I'm stuck on step 2..." style={{width:"100%",minHeight:80,padding:"10px 12px",borderRadius:10,border:"1.5px solid var(--pearl)",fontSize:14,resize:"vertical",boxSizing:"border-box"}}/>
                  <button className="btn-primary" onClick={submitTaskDoubt} disabled={loadingTaskDoubt||!taskDoubt.trim()} style={{marginTop:10,background:"linear-gradient(135deg,#7C3AED,#5B21B6)"}}>{loadingTaskDoubt?"Thinking… 🤔":"Get Help 🧙‍♂️"}</button>
                  {taskDoubtAnswer&&<div style={{marginTop:14,background:"linear-gradient(135deg,#F5F3FF,#EDE9FE)",border:"1.5px solid #A78BFA",borderLeft:"5px solid #7C3AED",borderRadius:12,padding:"14px 18px",lineHeight:1.85,whiteSpace:"pre-wrap",fontSize:15}}><div style={{fontSize:11,fontWeight:700,color:"#7C3AED",marginBottom:8,textTransform:"uppercase",letterSpacing:1}}>🧙‍♂️ Professor's Guidance:</div>{taskDoubtAnswer}</div>}
                </div>
                <button className="btn-primary" onClick={submitTask} disabled={loadingFeedback||!task.steps.every(s=>taskSteps[s.id]?.trim().length>10)} style={{width:"100%",padding:"16px",fontSize:17,fontWeight:700,background:task.steps.every(s=>taskSteps[s.id]?.trim().length>10)?"linear-gradient(135deg,#7C3AED,#5B21B6)":"var(--pearl)",color:task.steps.every(s=>taskSteps[s.id]?.trim().length>10)?"#fff":"var(--smoke)",borderRadius:14,transition:"all .2s"}}>
                  {loadingFeedback?"Professor is reviewing… 🧙‍♂️":"Submit for AI Feedback 🚀"}
                </button>
              </div>
            ):(
              <div className="card" style={{borderTop:"4px solid #7C3AED"}}>
                <div style={{textAlign:"center",marginBottom:24}}><div style={{fontSize:56,marginBottom:8}}>🏆</div><h2 style={{fontSize:22,marginBottom:4}}>Task Complete!</h2><p style={{color:"var(--smoke)"}}>Here's Professor Max's feedback</p></div>
                <div style={{background:"linear-gradient(135deg,#F5F3FF,#EDE9FE)",border:"1.5px solid #A78BFA",borderLeft:"5px solid #7C3AED",borderRadius:14,padding:"20px 24px",lineHeight:1.9,whiteSpace:"pre-wrap",fontSize:15,marginBottom:20}}><div style={{fontSize:11,fontWeight:700,color:"#7C3AED",marginBottom:10,textTransform:"uppercase",letterSpacing:1}}>🧙‍♂️ Professor Max's Feedback:</div>{taskFeedback}</div>
                {task.steps.map((step,si)=>(<div key={step.id} style={{marginBottom:14,paddingBottom:14,borderBottom:si<task.steps.length-1?"1px solid var(--pearl)":"none"}}><p style={{fontWeight:700,fontSize:13,color:"#7C3AED",marginBottom:4}}>{step.label}</p><p style={{fontSize:14,color:"var(--ink)",lineHeight:1.7}}>{taskSteps[step.id]}</p></div>))}
                <button className="btn-outline" style={{width:"100%",marginTop:8}} onClick={()=>{setTaskSubmitted(false);setTaskFeedback("");}}>Revise & Resubmit ✏️</button>
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

 const loadTest = async () => {
  setLoading(true); setSubmitted(false); setAnswers({}); setCurrentQ(0);
  let allQuestions = [];
  try {
    const prompt = `Create 25 multiple choice questions for a student learning "${roadmap.title}" on the topic "${topic}".

Rules:
- Each question must be specific to "${roadmap.title}"
- 4 options per question labeled A, B, C, D
- Mix easy, medium and hard questions
- Return ONLY this JSON structure, nothing else:

{"questions":[{"q":"Question here?","options":["A) answer","B) answer","C) answer","D) answer"],"answer":"A","explanation":"Why this is correct"}]}`;

    const raw = await askClaude([{role:"user", content:prompt}]);
    console.log("Test raw:", raw?.substring(0, 500));

    let cleaned = raw.trim().replace(/```json|```/gi, "").replace(/,(\s*[}\]])/g, "$1");
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const d = JSON.parse(jsonMatch[0]);
      if (d.questions && Array.isArray(d.questions) && d.questions.length > 0) {
        allQuestions = d.questions.slice(0, 25);
        console.log("✅ Parsed", allQuestions.length, "questions");
      }
    }
  } catch(e) {
    console.warn("Test parse failed:", e.message);
  }

  // only use fallback if AI completely failed
  if (allQuestions.length === 0) {
    console.log("Using fallback questions");
    allQuestions = Array.from({length:25}, (_,i) => ({
      q: `Question ${i+1}: What is an important concept in ${topic}?`,
      options: ["A) Option A","B) Option B","C) Option C","D) Option D"],
      answer: "A",
      explanation: `This is a key concept in ${topic}. Keep studying!`
    }));
  }

  setQuestions(allQuestions);
  setLoading(false);
};

  const submit=()=>{let s=0;questions.forEach((q,i)=>{if(answers[i]===q.answer)s++;});setScore(s);setSubmitted(true);setCurrentQ(0);};
  const pct=questions?Math.round((Object.keys(answers).length/questions.length)*100):0;

  return (
    <div className="page container" style={{paddingTop:24,paddingBottom:60}}>
      <div style={{background:"linear-gradient(135deg,var(--ink),#1A1A2E)",borderRadius:16,padding:"20px 24px",marginBottom:24,borderLeft:"4px solid var(--gold)"}}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:8}}><span className="pill">Month {currentMonth}</span><span className="pill">Week {currentWeek}</span><span className="pill" style={{background:"var(--gold)",color:"var(--ink)"}}>📝 25 Questions</span></div>
        <h2 style={{color:"#fff",fontSize:20,marginBottom:4}}>Weekly Test: {topic}</h2>
        <p style={{color:"rgba(255,255,255,0.6)",fontSize:13}}>Test your knowledge across all this week's material</p>
      </div>
      {!questions&&!loading&&(<div style={{textAlign:"center",padding:"60px 20px"}}><div style={{fontSize:64,marginBottom:16}}>📝</div><h2 style={{marginBottom:8}}>Ready for your weekly test?</h2><p style={{color:"var(--smoke)",marginBottom:24,maxWidth:400,margin:"0 auto 24px"}}>25 questions. No timer — take your time!</p><button className="btn-primary" style={{fontSize:16,padding:"14px 32px"}} onClick={loadTest}>Start Test 🚀</button></div>)}
      {loading&&(<div style={{textAlign:"center",padding:"80px 20px"}}><div style={{fontSize:56,marginBottom:16}}>🧠</div><div className="dots"><span/><span/><span/></div><p style={{color:"var(--smoke)",marginTop:16,fontStyle:"italic"}}>Generating questions on {topic}…</p></div>)}
      {questions&&!submitted&&(
        <div>
          <div className="card" style={{marginBottom:16,padding:"14px 20px"}}><div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:8}}><span style={{fontWeight:600}}>Question {currentQ+1} of {questions.length}</span><span style={{color:"var(--gold2)",fontWeight:700}}>{Object.keys(answers).length} answered</span></div><div style={{background:"var(--pearl)",borderRadius:999,height:8}}><div style={{height:"100%",borderRadius:999,background:"linear-gradient(90deg,var(--gold),#E8C97A)",width:`${pct}%`,transition:"width .3s"}}/></div></div>
          <div className="card" style={{marginBottom:16,padding:"14px 20px"}}><p style={{fontSize:12,fontWeight:700,color:"var(--smoke)",textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Jump to question:</p><div style={{display:"flex",flexWrap:"wrap",gap:6}}>{questions.map((_,i)=>(<button key={i} onClick={()=>setCurrentQ(i)} style={{width:32,height:32,borderRadius:8,border:"1.5px solid",borderColor:i===currentQ?"var(--gold)":answers[i]?"var(--emerald)":"var(--pearl)",background:i===currentQ?"var(--gold)":answers[i]?"#ECFDF5":"transparent",color:i===currentQ?"var(--ink)":answers[i]?"var(--emerald)":"var(--smoke)",fontWeight:700,fontSize:11,cursor:"pointer"}}>{i+1}</button>))}</div></div>
          <div className="card" style={{marginBottom:16}}>
            <p style={{fontSize:12,fontWeight:700,color:"var(--gold2)",textTransform:"uppercase",letterSpacing:1,marginBottom:12}}>Question {currentQ+1}</p>
            <p style={{fontSize:17,fontWeight:600,lineHeight:1.6,marginBottom:20}}>{questions[currentQ].q}</p>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {questions[currentQ].options.map((opt,j)=>{const letter=["A","B","C","D"][j];const selected=answers[currentQ]===letter;return <button key={j} onClick={()=>setAnswers(a=>({...a,[currentQ]:letter}))} style={{textAlign:"left",padding:"12px 16px",borderRadius:12,border:selected?"2px solid var(--gold)":"1.5px solid var(--pearl)",background:selected?"var(--gold-light)":"var(--paper)",cursor:"pointer",fontSize:15,fontWeight:selected?700:400,transition:"all .15s"}}>{opt}</button>;})}
            </div>
          </div>
          <div style={{display:"flex",gap:10}}>
            <button className="btn-outline" onClick={()=>setCurrentQ(q=>Math.max(0,q-1))} disabled={currentQ===0} style={{flex:1}}>← Previous</button>
            {currentQ<questions.length-1?<button className="btn-primary" onClick={()=>setCurrentQ(q=>q+1)} style={{flex:1}}>Next →</button>:<button className="btn-primary" onClick={submit} disabled={Object.keys(answers).length<questions.length} style={{flex:1,background:"var(--emerald)"}}>Submit All ✓</button>}
          </div>
        </div>
      )}
      {submitted&&(
        <div>
          <div className="card" style={{textAlign:"center",marginBottom:24,background:score/questions.length>=0.8?"linear-gradient(135deg,#ECFDF5,#D1FAE5)":score/questions.length>=0.6?"linear-gradient(135deg,#FFF8E7,var(--gold-light))":"linear-gradient(135deg,#FFF5F5,#FFE4E4)"}}>
            <div style={{fontSize:64,marginBottom:8}}>{score/questions.length>=0.8?"🏆":score/questions.length>=0.6?"👍":"📚"}</div>
            <h2 style={{fontSize:28,marginBottom:4}}>{score} / {questions.length}</h2>
            <p style={{fontSize:18,fontWeight:600,marginBottom:8}}>{Math.round(score/questions.length*100)}% — {score/questions.length>=0.8?"Outstanding! 🌟":score/questions.length>=0.6?"Good job! 💪":"Keep studying! 📖"}</p>
            <p style={{color:"var(--smoke)",fontSize:14}}>{score} correct • {questions.length-score} incorrect</p>
          </div>
          <h3 style={{marginBottom:16}}>📋 Full Review</h3>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {questions.map((q,i)=>{const correct=answers[i]===q.answer;return(<div key={i} className="card" style={{borderLeft:`4px solid ${correct?"var(--emerald)":"var(--ember)"}`,padding:"16px 20px"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}><p style={{fontWeight:600,fontSize:15,flex:1,lineHeight:1.5}}>{i+1}. {q.q}</p><span style={{marginLeft:12,fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:999,flexShrink:0,background:correct?"#ECFDF5":"#FFF5F5",color:correct?"var(--emerald)":"var(--ember)"}}>{correct?"✓ Correct":"✗ Wrong"}</span></div><p style={{fontSize:13,color:"var(--smoke)",marginBottom:6}}>Your answer: <strong>{answers[i]}</strong> • Correct: <strong style={{color:"var(--emerald)"}}>{q.answer}</strong></p><p style={{fontSize:13,color:"var(--smoke)",fontStyle:"italic",lineHeight:1.5}}>💡 {q.explanation}</p></div>);})}
          </div>
          <button className="btn-primary" style={{width:"100%",marginTop:20}} onClick={loadTest}>Retake Test 🔄</button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const[page,setPage]=useState("loading");const[user,setUser]=useState(null);const[profile,setProfile]=useState(null);const[roadmap,setRoadmap]=useState(null);const[progress,setProgress]=useState(null);const[isDemo,setIsDemo]=useState(false);
  const[showEmailSettings,setShowEmailSettings]=useState(false);const[emailConfigured,setEmailConfigured]=useState(()=>{try{return!!(localStorage.getItem("ejs_service")&&localStorage.getItem("ejs_key"));}catch{return false;}});const[streakAlert,setStreakAlert]=useState(null);

  useEffect(()=>{
    const init=async()=>{const{data:{session}}=await supabase.auth.getSession();if(session?.user)await loadUserData(session.user);else setPage("landing");};
    init();
    const{data:{subscription}}=supabase.auth.onAuthStateChange(async(_event,session)=>{if(session?.user)await loadUserData(session.user);});
    return()=>subscription.unsubscribe();
  },[]);

  const loadUserData=async(authUser)=>{
    setUser(authUser);const prof=await getProfile(authUser.id);setProfile(prof);const rm=await getRoadmap(authUser.id);const pg=await getProgress(authUser.id);
    if(rm?.data){
      setRoadmap(rm.data);const appProgress=dbToProgress(pg);setProgress(appProgress);
      const today=new Date().toISOString().slice(0,10);const lastVisit=pg?.last_visit;
      if(lastVisit&&lastVisit!==today){const yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10);if(lastVisit!==yesterday){setStreakAlert("lost");const resetProg={...appProgress,streak:0};setProgress(resetProg);await upsertProgress(authUser.id,{...progressToDb(resetProg),streak:0});sendStreakLostEmail(prof?.full_name||authUser.user_metadata?.full_name||"Student",authUser.email,appProgress.streak);}}
      await upsertProgress(authUser.id,{last_visit:today});setPage("dashboard");
    }else{
      if(!prof&&authUser.user_metadata?.full_name){await upsertProfile(authUser.id,{full_name:authUser.user_metadata.full_name,age:null,grade:null});setProfile({full_name:authUser.user_metadata.full_name});}
      setPage("onboard");
    }
  };

  const onAuth=async(authUser,prof,hasExistingRoadmap)=>{setUser(authUser);setProfile(prof);if(hasExistingRoadmap)await loadUserData(authUser);else setPage("onboard");};
  const logout=async()=>{await supabase.auth.signOut();setUser(null);setProfile(null);setRoadmap(null);setProgress(null);setPage("landing");};
  const startDemo=()=>{setRoadmap(DEMO_ROADMAP);setProgress(DEMO_PROGRESS);setIsDemo(true);setPage("dashboard");};
  const exitDemo=()=>{setIsDemo(false);setRoadmap(null);setProgress(null);setUser(null);setPage("landing");};
  const handleProgressUpdate=(newProgress)=>setProgress(newProgress);
  const showNav=["dashboard","learn","test"].includes(page);const navUser=isDemo?{email:"demo@velorn.app"}:user;

  if(page==="loading")return(<div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",flexDirection:"column",gap:20}}><div style={{fontSize:48}}>🚀</div><div className="dots"><span/><span/><span/></div><p style={{color:"var(--smoke)"}}>Loading Velorn…</p></div>);

  return (
    <>
      <style>{css}</style>
      {streakAlert==="lost"&&(<div style={{background:"linear-gradient(135deg,#FEE2E2,#FECACA)",borderBottom:"2px solid var(--ember)",padding:"12px 24px",textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center",gap:12,fontSize:14,color:"#991B1B",fontWeight:500}}><span style={{fontSize:20}}>💔</span><span>You lost your streak! Come back today and start fresh 💪{emailConfigured&&" A reminder email has been sent."}</span><button onClick={()=>setStreakAlert(null)} style={{background:"none",border:"none",cursor:"pointer",color:"#991B1B",fontSize:18,marginLeft:8}}>✕</button></div>)}
      {showNav&&<Nav user={navUser} onLogout={isDemo?exitDemo:logout} onNav={setPage} page={page} onOpenEmailSettings={()=>setShowEmailSettings(true)} emailConfigured={emailConfigured} isDemo={isDemo} onSignUp={()=>{exitDemo();setPage("auth");}}/>}
      {isDemo&&(<div style={{background:"linear-gradient(135deg,#1A1A2E,#2D1B69)",borderBottom:"2px solid var(--gold)",padding:"10px 24px",textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center",gap:12,fontSize:14,color:"var(--gold-light)",fontWeight:500,flexWrap:"wrap"}}><span>👀 You're in Demo Mode — exploring a sample Entrepreneurship roadmap</span><button onClick={()=>{exitDemo();setPage("auth");}} style={{background:"var(--gold)",color:"var(--ink)",border:"none",borderRadius:8,padding:"5px 14px",fontSize:13,fontWeight:700,cursor:"pointer"}}>Sign Up Free →</button></div>)}
      {showEmailSettings&&!isDemo&&<EmailSettingsModal onClose={()=>{setShowEmailSettings(false);try{setEmailConfigured(!!(localStorage.getItem("ejs_service")&&localStorage.getItem("ejs_key")));}catch{}}} userEmail={user?.email} userName={profile?.full_name||user?.user_metadata?.full_name}/>}
      {page==="landing"&&<Landing onStart={()=>setPage("auth")} onDemo={startDemo}/>}
      {page==="auth"&&<Auth onAuth={onAuth}/>}
      {page==="onboard"&&user&&<Onboarding user={user} profile={profile} onDone={(rm,pg)=>{setRoadmap(rm);setProgress(pg);setPage("dashboard");}}/>}
      {page==="dashboard"&&roadmap&&progress&&<Dashboard user={user} roadmap={roadmap} progress={progress} onUpdateProgress={handleProgressUpdate} onNav={setPage} isDemo={isDemo}/>}
      {page==="learn"&&roadmap&&progress&&<Learn user={user} progress={progress} roadmap={roadmap} onUpdateProgress={handleProgressUpdate} isDemo={isDemo} onSignUp={()=>{exitDemo();setPage("auth");}}/>}
      {page==="test"&&roadmap&&progress&&<WeeklyTest progress={progress} roadmap={roadmap}/>}
    </>
  );
}