import {createRoot} from 'react-dom/client';
import {useCallback,useEffect,useState} from 'react';
import {createClient} from '@supabase/supabase-js';
import {LayoutDashboard,ClipboardList,Users,UserRound,Megaphone,History,Globe,ChevronRight,ExternalLink,LogOut,FileText} from 'lucide-react';

// Publishable key: safe in the browser. All access is enforced by Row Level Security in the database.
const sb:any=createClient('https://iaionntcwjblvndmdesw.supabase.co','sb_publishable_1Qg2Z-_1-QvviWwr-ZM9_w_3nmqnxX7');

const css=`*{box-sizing:border-box}body{margin:0;background:#EDE6D6;color:#1A1217;font:18px 'Cormorant Garamond',Georgia,serif}
h1,h2,h3,.brand{font-family:Cinzel,serif;font-weight:600}.c{padding:60px 24px;text-align:center}
.wrap{display:flex;min-height:100vh}.side{width:230px;background:#1A1217;color:#EDE6D6;padding:22px 14px;flex-shrink:0}
.side .brand{font-size:1.1rem;margin:0 8px 22px}.side button,.side a{display:block;width:100%;text-align:left;background:none;border:0;border-left:3px solid transparent;color:#EDE6D6;padding:11px 9px;font:inherit;cursor:pointer;border-radius:3px;text-decoration:none}
.side button.on,.side button:hover,.side a:hover{background:#30262B}.side button.on{border-left-color:#2F6B34}.main{flex:1;padding:28px;min-width:0}
input,textarea,select{font:inherit;padding:7px 9px;border:1px solid #BAB1A0;background:#F7F2E6;color:#1A1217;border-radius:2px;max-width:100%}input:focus,textarea:focus,select:focus{outline:none;border-color:#2F6B34;box-shadow:0 0 0 2px #2F6B3420}
textarea{width:100%;min-height:90px}.btn{background:#1A1217;color:#EDE6D6;border:1px solid #1A1217;padding:9px 18px;font:inherit;cursor:pointer;border-radius:2px;text-decoration:none;display:inline-block}.btn:hover{background:#30262B;border-color:#30262B}.btn.red{background:#8a2b2b}.btn.ghost{background:none;color:#1A1217;border:1px solid #BAB1A0}.btn.ghost:hover{background:#E5DDCF;border-color:#80766F}.btn:disabled{opacity:.5}
.tw{overflow-x:auto;margin:14px 0}table{border-collapse:collapse;width:100%;font-size:16px}td,th{border-bottom:1px solid #BAB1A0;padding:6px;text-align:left;vertical-align:top}th{font-family:Cinzel,serif;font-size:.8rem}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px}.card{background:#F7F2E6;padding:18px;border:1px solid #BAB1A0;border-left:3px solid #2F6B34}.card b{font-size:2.2rem;display:block}
.box{max-width:440px;margin:8vh auto;padding:30px;background:#F7F2E6;border:1px solid #BAB1A0;box-shadow:3px 5px 0 #BAB1A055}.box input,.box select,.box textarea{width:100%;margin:8px 0}.msg{margin:10px 0;color:#2F6B34}
.toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:12px 0}
.badge{display:inline-block;padding:2px 10px;border-radius:12px;font-size:.8rem;background:#1A121722;margin-left:6px;font-family:Cormorant Garamond,serif}.badge.g{background:#2F6B3433;color:#1F4A25}.badge.r{background:#8a2b2b33;color:#6b1f1f}
.tabs{display:flex;gap:8px;margin-bottom:14px}.tabs button{background:none;border:1px solid #BAB1A0;padding:6px 14px;font:inherit;cursor:pointer;color:#1A1217}.tabs button.on{background:#1A1217;color:#EDE6D6}
@media(max-width:760px){.wrap{flex-direction:column}.side{width:100%;display:flex;flex-wrap:wrap;gap:4px;padding:10px}.side .brand{width:100%;margin:4px}.side button,.side a{width:auto}.main{padding:16px}}
/* Veritas administration dashboard: Willow-inspired structure, Veritas palette */
.admin-layout{min-height:100vh;display:flex;background:#EDE6D6;color:#1A1217;font:15px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.admin-sidebar{width:258px;min-width:258px;height:100vh;position:sticky;top:0;display:flex;flex-direction:column;overflow:hidden;background:#1A1217;border-right:1px solid #51464a;padding:19px 13px 13px;color:#EDE6D6}
.admin-brand{padding:5px 10px 21px;border-bottom:1px solid #51464a}
.admin-wordmark{font-family:Cinzel,Georgia,serif;font-weight:700;font-size:19px;letter-spacing:.075em;color:#EDE6D6}
.admin-wordmark span{color:#BAB1A0}
.admin-brand-sub{margin-top:4px;font-size:10px;letter-spacing:.22em;color:#BAB1A0;text-transform:uppercase}
.admin-nav-scroll{flex:1;min-height:0;overflow-y:auto;padding:13px 0 18px}
.admin-nav-group{margin:0 0 17px}
.admin-nav-group-title{padding:0 12px 7px;color:#BAB1A0;font-size:10px;font-weight:700;letter-spacing:.19em;text-transform:uppercase}
.admin-nav-item{width:100%;display:flex;align-items:center;gap:12px;min-height:43px;margin:2px 0;padding:9px 12px;border:0;border-radius:8px;background:transparent;color:#D7CCBD;font:inherit;text-align:left;cursor:pointer;position:relative}
.admin-nav-item svg{color:#BAB1A0;flex:0 0 auto}
.admin-nav-item:hover{background:#30262B;color:#EDE6D6}
.admin-nav-item.active{background:#30262B;color:#EDE6D6;font-weight:650}
.admin-nav-item.active:before{content:"";position:absolute;left:0;top:8px;bottom:8px;width:3px;border-radius:4px;background:#2F6B34}
.admin-nav-item.active svg{color:#EDE6D6}
.admin-sidebar-footer{border-top:1px solid #51464a;padding-top:12px}
.admin-profile{display:flex;align-items:center;gap:10px;padding:10px 9px;border:1px solid #51464a;background:#30262B;border-radius:9px;min-width:0}
.admin-avatar{width:34px;height:34px;flex:0 0 auto;border-radius:50%;display:grid;place-items:center;background:#51464a;color:#EDE6D6;font-size:11px;font-weight:750;border:1px solid #BAB1A0}
.admin-profile-copy{min-width:0;display:flex;flex-direction:column;line-height:1.35}
.admin-profile-copy strong{font-size:12px;color:#EDE6D6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.admin-profile-copy span{font-size:11px;color:#BAB1A0;margin-top:3px}
.admin-site-link{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:12px 9px 2px;color:#D7CCBD;text-decoration:none;font-size:12px}
.admin-site-link span{display:flex;align-items:center;gap:8px}
.admin-site-link:hover{color:#EDE6D6}
.admin-main-column{flex:1;min-width:0;display:flex;flex-direction:column;background:#EDE6D6}
.admin-topbar{height:70px;min-height:70px;position:sticky;top:0;z-index:20;display:flex;align-items:center;justify-content:space-between;gap:18px;padding:0 30px;background:rgba(237,230,214,.97);backdrop-filter:blur(14px);border-bottom:1px solid #BAB1A0}
.admin-breadcrumb{display:flex;align-items:center;gap:10px;min-width:0;color:#80766F;font-size:12px;letter-spacing:.12em;text-transform:uppercase}
.admin-breadcrumb svg{color:#9B9086}
.admin-breadcrumb strong{color:#1A1217;font-size:14px;letter-spacing:0;text-transform:none;white-space:nowrap}
.admin-top-actions{display:flex;align-items:center;gap:10px;flex:0 0 auto}
.admin-role-pill{display:inline-flex;align-items:center;gap:7px;border:1px solid #BAB1A0;background:#F7F2E6;color:#51464A;border-radius:99px;padding:6px 11px;font-size:10px;font-weight:700;letter-spacing:.12em}
.admin-role-dot{width:7px;height:7px;border-radius:50%;background:#2F6B34;box-shadow:0 0 0 3px #2F6B3418}
.admin-top-link{display:inline-flex;align-items:center;gap:7px;padding:8px 11px;border:1px solid #BAB1A0;border-radius:8px;color:#51464A;text-decoration:none;font-size:12px}
.admin-top-link:hover{background:#E5DDCF;color:#1A1217}
.admin-topbar .btn{min-height:35px;padding:7px 12px;font-size:12px}
.admin-content{width:100%;padding:29px 30px 52px;min-width:0;background:#EDE6D6}
.admin-layout h1,.admin-layout h2,.admin-layout h3,.admin-layout h4{font-family:Cinzel,Georgia,serif;letter-spacing:0;color:#1A1217}
.admin-layout h1{font-size:28px;line-height:1.2;margin:0 0 8px;font-weight:680}
.admin-layout h2{font-size:23px;line-height:1.25;margin:0 0 8px;font-weight:670}
.admin-layout h3{font-size:16px;font-weight:650}
.admin-layout p{color:#61575A}
.admin-page{display:flex;flex-direction:column;gap:18px}
.admin-page-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:1px}
.admin-page-heading p{margin:4px 0 0;max-width:720px}
.admin-kicker{margin:0 0 7px!important;color:#756B64!important;font-size:10px!important;font-weight:750;letter-spacing:.2em;text-transform:uppercase}
.admin-stat-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px}
.admin-stat-card{min-width:0;padding:16px 17px;border:1px solid #BAB1A0;border-radius:10px;background:#F7F2E6;box-shadow:0 5px 18px rgba(26,18,23,.045)}
.admin-stat-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
.admin-stat-label{display:block;color:#756B64;font-size:10px;font-weight:700;letter-spacing:.13em;text-transform:uppercase}
.admin-stat-icon{color:#80766F}
.admin-stat-value{display:block;margin-top:8px;color:#1A1217;font-size:29px;line-height:1.15;font-weight:650;font-variant-numeric:tabular-nums}
.admin-filter-panel,.admin-panel{padding:18px;border:1px solid #BAB1A0;border-radius:11px;background:#F7F2E6}
.admin-filter-heading{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px}
.admin-filter-heading .admin-kicker{margin:0!important}
.admin-filter-count{color:#756B64;font-size:11px}
.admin-filter-grid{display:grid;grid-template-columns:minmax(220px,1.5fr) repeat(2,minmax(150px,1fr));gap:11px;align-items:center}
.admin-filter-grid-wide{grid-template-columns:minmax(210px,1.5fr) repeat(2,minmax(140px,1fr))}
.admin-layout input:not([type=checkbox]):not([type=radio]),.admin-layout select,.admin-layout textarea{background:#FBF8F1;color:#1A1217;border:1px solid #BAB1A0;border-radius:8px;font:inherit;padding:10px 12px;max-width:100%}
.admin-layout input::placeholder,.admin-layout textarea::placeholder{color:#8D8379}
.admin-layout input:focus,.admin-layout select:focus,.admin-layout textarea:focus{outline:none;border-color:#2F6B34;box-shadow:0 0 0 3px #2F6B3416}
.admin-toolbar-actions{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-top:13px}
.admin-layout .toolbar{gap:9px}
.admin-layout .btn{background:#1A1217;color:#EDE6D6;border:1px solid #1A1217;border-radius:8px;padding:9px 14px;font-family:inherit;font-size:13px;font-weight:650;letter-spacing:0;text-transform:none;box-shadow:none}
.admin-layout .btn:hover{background:#30262B;border-color:#30262B}
.admin-layout .btn.ghost{background:transparent;color:#1A1217;border:1px solid #8E837D}
.admin-layout .btn.ghost:hover{background:#E5DDCF;color:#1A1217;border-color:#51464A}
.admin-layout .btn.red{background:#6B3438;border-color:#6B3438;color:#FFF0ED}
.admin-layout .btn.red:hover{background:#54282C}
.admin-layout .btn:disabled{opacity:.45}
.admin-layout .card{background:#FBF8F1;color:#1A1217;border:1px solid #BAB1A0;border-radius:10px;border-left:1px solid #BAB1A0;box-shadow:none}
.admin-layout .card p,.admin-layout .card span{color:inherit}
.admin-layout .card b.stat{color:#1A1217;font-size:30px}
.admin-layout .badge{background:#E5DDCF;color:#51464A;border:1px solid #BAB1A0;border-radius:99px;font-family:inherit;font-size:10px;letter-spacing:.04em}
.admin-layout .badge.g{background:#E6EDE2;color:#2F6B34;border-color:#9CAF91}
.admin-layout .badge.r{background:#F0DFDA;color:#71393B;border-color:#C5A19A}
.admin-layout .msg{color:#2F6B34}
.admin-layout .err{background:#F1DFDC;border-left-color:#8A2B2B;color:#6B1F1F}
.admin-layout .tw{border:1px solid #BAB1A0;border-radius:10px;background:#FBF8F1}
.admin-layout table{color:#1A1217;font-size:13px}
.admin-layout td,.admin-layout th{border-bottom:1px solid #D2C9BB;padding:12px 11px}
.admin-layout th{color:#51464A;background:#E5DDCF;font-family:inherit;font-size:10px;letter-spacing:.13em}
.admin-layout tbody tr:hover{background:#F1EBDD}
.admin-layout .tabs button{color:#51464A;border-color:#BAB1A0}
.admin-layout .tabs button.on{background:#1A1217;color:#EDE6D6}
.admin-layout .application-card{margin:0 0 12px!important;padding:17px 18px}
.admin-layout .dossier-grid{background:#F1EBDD;border:1px solid #BAB1A0;border-radius:8px}
.admin-layout .dossier-q{border-top-color:#D2C9BB}
.admin-layout .dossier-q b{color:#2F6B34}
.admin-layout .review-k{color:#756B64}
.admin-empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:190px;padding:30px;border:1px solid #BAB1A0;border-radius:11px;background:#F7F2E6;text-align:center}
.admin-empty-state svg{color:#756B64}
.admin-empty-state strong{color:#1A1217;font-size:15px}
.admin-empty-state p{margin:0;color:#756B64;font-size:13px}
.admin-activity{margin-top:20px}
.admin-activity-list{display:grid;gap:0}
.admin-activity-row{display:flex;justify-content:space-between;gap:14px;padding:11px 0;border-bottom:1px solid #D2C9BB;color:#1A1217;font-size:13px}
.admin-activity-row:last-child{border-bottom:0}
.admin-activity-row time{color:#756B64;white-space:nowrap;font-size:11px}
.admin-layout .box{background:#F7F2E6;color:#1A1217;border:1px solid #BAB1A0;box-shadow:none}
@media(max-width:1100px){.admin-sidebar{width:232px;min-width:232px}.admin-content{padding:24px 22px}.admin-topbar{padding:0 22px}.admin-stat-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:760px){
 .admin-layout{display:block}.admin-sidebar{position:relative;width:100%;min-width:0;height:auto;padding:12px 12px 8px}
 .admin-brand{padding:3px 7px 12px}.admin-nav-scroll{display:flex;gap:13px;overflow-x:auto;overflow-y:hidden;padding:9px 0 5px}
 .admin-nav-group{display:flex;align-items:center;gap:4px;margin:0;flex:0 0 auto}.admin-nav-group-title{display:none}
 .admin-nav-item{width:auto;min-height:38px;white-space:nowrap;padding:8px 10px;font-size:12px}
 .admin-nav-item.active:before{top:auto;right:8px;bottom:0;left:8px;width:auto;height:2px}
 .admin-sidebar-footer{display:none}.admin-topbar{position:relative;height:auto;min-height:58px;padding:10px 14px;align-items:flex-start;flex-direction:column;gap:9px}
 .admin-top-actions{flex-wrap:wrap}.admin-content{padding:20px 14px 36px}
 .admin-page-heading{flex-direction:column}.admin-filter-grid,.admin-filter-grid-wide{grid-template-columns:1fr}
}
@media(max-width:480px){.admin-stat-grid{grid-template-columns:1fr 1fr;gap:8px}.admin-stat-card{padding:12px}.admin-stat-value{font-size:24px}.admin-top-link{padding:7px 9px}}
`;

function parseCSV(t:string){const rows:string[][]=[];let r:string[]=[],c='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];if(q){if(ch==='"'&&t[i+1]==='"'){c+='"';i++}else if(ch==='"')q=false;else c+=ch}else if(ch==='"')q=true;else if(ch===','){r.push(c);c=''}else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&t[i+1]==='\n')i++;r.push(c);c='';if(r.some(x=>x.trim()))rows.push(r);r=[]}else c+=ch}r.push(c);if(r.some(x=>x.trim()))rows.push(r);return rows}

// ---------- Sign in / create account (email + password, no email confirmation step) ----------
function Auth({recovery}:any){
  const [mode,setMode]=useState<string>(recovery?'reset':'in');
  const [email,setEmail]=useState('');const [pw,setPw]=useState('');const [pw2,setPw2]=useState('');const [msg,setMsg]=useState('');const [busy,setBusy]=useState(false);
  const go=async(e:any)=>{e.preventDefault();setMsg('');const em=email.trim().toLowerCase();
    if((mode==='up'||mode==='reset')&&pw.length<10){setMsg('Your password must be at least 10 characters.');return}
    if((mode==='up'||mode==='reset')&&pw!==pw2){setMsg('The passwords do not match.');return}
    setBusy(true);
    if(mode==='in'){const {error}=await sb.auth.signInWithPassword({email:em,password:pw});if(error)setMsg(/confirm/i.test(error.message)?'Please confirm your email first. Check your inbox for the confirmation message.':'Wrong email or password. If you forgot it, use Forgot password.')}
    else if(mode==='up'){const {data,error}=await sb.auth.signUp({email:em,password:pw,options:{emailRedirectTo:location.origin+'/login'}});
      if(error)setMsg(/database error|not on the team/i.test(error.message)?"This email isn't on the team list. Use the email you gave on the team form, or ask an admin to add it.":/already registered/i.test(error.message)?'This email already has an account. Sign in, or use Forgot password.':error.status===429?'Too many attempts. Try again in a few minutes.':error.message);
      else if(!data.session){const r=await sb.auth.signInWithPassword({email:em,password:pw});if(r.error)setMsg('Account created. Now sign in with your email and password.')}}
    else if(mode==='forgot'){await sb.auth.resetPasswordForEmail(em,{redirectTo:location.origin+'/login'});setMsg('If that email has an account, a reset link is on its way.')}
    else{const {error}=await sb.auth.updateUser({password:pw});setMsg(error?error.message:'Password updated.');if(!error)setTimeout(()=>{location.href='/account'},800)}
    setBusy(false)};
  const t:any={in:'Sign in',up:'Create account',forgot:'Reset password',reset:'Choose a new password'};
  return <form className="box" onSubmit={go}><h2 style={{margin:0}}>Veritas MUN</h2><h3>{t[mode]}</h3>
    {mode==='up'&&<p>Use the email you gave on the team form. Choose a password and we'll set up your role automatically.</p>}
    {mode!=='reset'&&<input type="email" required placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} aria-label="Email" autoComplete="email"/>}
    {mode!=='forgot'&&<input type="password" required placeholder={mode==='in'?'Password':'New password (10+ characters)'} value={pw} onChange={e=>setPw(e.target.value)} aria-label="Password" autoComplete={mode==='in'?'current-password':'new-password'}/>}
    {(mode==='up'||mode==='reset')&&<input type="password" required placeholder="Repeat password" value={pw2} onChange={e=>setPw2(e.target.value)} aria-label="Repeat password" autoComplete="new-password"/>}
    <button className="btn" disabled={busy}>{busy?'Please wait...':t[mode]}</button><div className="msg" role="status">{msg}</div>
    {mode!=='reset'&&<div className="toolbar">{mode!=='in'&&<a href="#" onClick={e=>{e.preventDefault();setMode('in');setMsg('')}}>Sign in</a>}{mode!=='up'&&<a href="#" onClick={e=>{e.preventDefault();setMode('up');setMsg('')}}>Create account</a>}{mode==='in'&&<a href="#" onClick={e=>{e.preventDefault();setMode('forgot');setMsg('')}}>Forgot password?</a>}</div>}</form>;
}

// ---------- Public application form (/apply) ----------
function Apply(){
  const [f,setF]=useState<any>({track:'Volunteers'});const [msg,setMsg]=useState('');const [done,setDone]=useState(false);const [busy,setBusy]=useState(false);
  const set=(k:string)=>(e:any)=>setF({...f,[k]:e.target.value});
  const submit=async(e:any)=>{e.preventDefault();if(f.website)return;setBusy(true);
    const {error}=await sb.from('applications').insert({track:f.track,full_name:(f.full_name||'').trim(),email:(f.email||'').trim().toLowerCase(),phone:f.phone,school:f.school,grade:f.grade,experience:f.experience,why:f.why});
    setBusy(false);if(error)setMsg(error.code==='23505'?'You have already applied to this team.':'Something went wrong. Check your details and try again.');else setDone(true)};
  if(done)return <div className="box"><h2>Thank you</h2><p>Your application was received. The team will review it and get back to you.</p><a className="btn" href="/">Back to the site</a></div>;
  return <form className="box" onSubmit={submit} style={{maxWidth:560}}><h2 style={{margin:0}}>Apply to join</h2><p>Applications are reviewed by the team head and then decided by the Secretariat.</p>
    <select value={f.track} onChange={set('track')} aria-label="Team"><option>Volunteers</option><option>Security</option></select>
    <input required placeholder="Full name" onChange={set('full_name')} aria-label="Full name"/><input required type="email" placeholder="Email" onChange={set('email')} aria-label="Email"/>
    <input placeholder="Phone" onChange={set('phone')} aria-label="Phone"/><input placeholder="School" onChange={set('school')} aria-label="School"/><input placeholder="Grade" onChange={set('grade')} aria-label="Grade"/>
    <textarea placeholder="Relevant experience" onChange={set('experience')} aria-label="Experience"/><textarea placeholder="Why do you want to join?" onChange={set('why')} aria-label="Why"/>
    <input name="website" tabIndex={-1} autoComplete="off" onChange={set('website')} style={{position:'absolute',left:'-9999px'}} aria-hidden="true"/>
    <button className="btn" disabled={busy}>{busy?'Sending...':'Submit application'}</button><div className="msg" role="status">{msg}</div></form>;
}

function Account({me}:any){
  const [ann,setAnn]=useState<any[]>([]);
  useEffect(()=>{sb.from('announcements').select('*').order('created_at',{ascending:false}).then(({data}:any)=>setAnn(data||[]))},[]);
  return <div className="main" style={{maxWidth:760,margin:'0 auto'}}>
    <h1>Welcome, {(me.full_name||'').split(' ')[0]}</h1>
    <div className="card"><b style={{fontSize:'1.4rem'}}>{me.full_name}</b>{me.position||'Member'}{me.department?' \u00b7 '+me.department:''}<br/>Access level: {me.role}</div>
    <h2>Announcements</h2>{ann.length?ann.map(a=><div className="card" key={a.id} style={{marginBottom:12}}><h3 style={{margin:0}}>{a.title}</h3><p style={{whiteSpace:'pre-wrap'}}>{a.body}</p></div>):<p>No announcements yet.</p>}
    <div className="toolbar">{(me.role==='admin'||me.role==='head')&&<a className="btn" href="/admin">{me.role==='admin'?'Admin panel':'Review applications'}</a>}<a className="btn ghost" href="/">Back to site</a><button className="btn ghost" onClick={()=>sb.auth.signOut()}>Sign out</button></div></div>;
}

// ---------- Applications: heads recommend, Secretariat + IT decide ----------
function AppCard({a,me,reload}:any){
  const [open,setOpen]=useState(false);const [note,setNote]=useState('');const [msg,setMsg]=useState('');
  const rpc=async(fn:string,args:any)=>{const {error}=await sb.rpc(fn,args);setMsg(error?error.message:'Saved');if(!error){setNote('');reload()}};
  const rec=a.recommendation;const admin=me.role==='admin';
  return <div className="card application-card">
    <div className="toolbar" style={{margin:0}}><b style={{fontSize:'1.25rem',display:'inline'}}>{a.full_name}</b><span className="badge">{a.track}</span>
      <span className={'badge '+(a.status==='accepted'?'g':a.status==='rejected'?'r':'')}>{a.status}</span>
      {rec&&<span className={'badge '+(rec==='accept'?'g':'r')}>head recommends {rec}</span>}
      <span style={{opacity:.6,fontSize:'.9rem'}}>{new Date(a.created_at).toLocaleDateString()}</span><button className="btn ghost" onClick={()=>setOpen(!open)}>{open?'Close':'Open'}</button></div>
    {open&&<div>
      <p>{a.email}{a.phone?' \u00b7 '+a.phone:''}<br/>{a.school}{a.grade?' \u00b7 Grade '+a.grade:''}</p>
      {a.experience&&<p><b style={{fontSize:'1rem',display:'inline'}}>Experience:</b> <span style={{whiteSpace:'pre-wrap'}}>{a.experience}</span></p>}
      {a.why&&<p><b style={{fontSize:'1rem',display:'inline'}}>Why:</b> <span style={{whiteSpace:'pre-wrap'}}>{a.why}</span></p>}
      {a.recommendation_note&&<p><i>Head's note: {a.recommendation_note}</i></p>}{a.decision_note&&<p><i>Decision note: {a.decision_note}</i></p>}
      <textarea placeholder="Note (optional)" value={note} onChange={e=>setNote(e.target.value)} aria-label="Note"/>
      <div className="toolbar">
        {a.status==='pending'&&<><button className="btn" onClick={()=>rpc('recommend_application',{app_id:a.id,rec:'accept',note})}>Recommend accept</button><button className="btn red" onClick={()=>rpc('recommend_application',{app_id:a.id,rec:'reject',note})}>Recommend reject</button></>}
        {admin&&<><span style={{opacity:.6}}>Final decision:</span><button className="btn" onClick={()=>rpc('decide_application',{app_id:a.id,decision:'accepted',note})}>Accept</button><button className="btn red" onClick={()=>rpc('decide_application',{app_id:a.id,decision:'rejected',note})}>Reject</button>{a.status!=='pending'&&<button className="btn ghost" onClick={()=>rpc('decide_application',{app_id:a.id,decision:'pending',note})}>Reopen</button>}</>}
        <span className="msg">{msg}</span></div></div>}</div>;
}

function Applications({me}:any){
  const [rows,setRows]=useState<any[]>([]);
  const [q,setQ]=useState('');
  const [st,setSt]=useState('pending');
  const [tr,setTr]=useState('all');
  const [err,setErr]=useState('');
  const load=useCallback(async()=>{
    const {data,error}=await sb.from('applications').select('*').order('created_at',{ascending:false});
    setErr(error?error.message:'');
    setRows(data||[]);
  },[]);
  useEffect(()=>{load()},[load]);
  const shown=rows.filter(r=>(st==='all'||r.status===st)&&(tr==='all'||r.track===tr)&&(!q||JSON.stringify(r).toLowerCase().includes(q.toLowerCase())));
  const counts={
    total:rows.length,
    pending:rows.filter(r=>r.status==='pending').length,
    accepted:rows.filter(r=>r.status==='accepted').length,
    rejected:rows.filter(r=>r.status==='rejected').length
  };
  return <div className="admin-page">
    <div className="admin-page-heading">
      <div>
        <p className="admin-kicker">{me.role==='admin'?'OPERATIONS / EXECUTIVE REVIEW':'DEPARTMENT REVIEW / RECOMMENDATIONS'}</p>
        <h1>Applications</h1>
        <p>{me.role==='admin'?'Review department recommendations and record the final Executive Board decision.':'Review applications and recommend acceptance or rejection. The Secretariat and IT make the final decision.'}</p>
      </div>
      <button className="btn ghost" onClick={load}>Refresh applications</button>
    </div>
    <div className="admin-stat-grid">
      <div className="admin-stat-card"><div className="admin-stat-top"><span className="admin-stat-label">Total submissions</span><FileText className="admin-stat-icon" size={17}/></div><strong className="admin-stat-value">{counts.total}</strong></div>
      <div className="admin-stat-card"><div className="admin-stat-top"><span className="admin-stat-label">Pending review</span><ClipboardList className="admin-stat-icon" size={17}/></div><strong className="admin-stat-value">{counts.pending}</strong></div>
      <div className="admin-stat-card"><div className="admin-stat-top"><span className="admin-stat-label">Accepted</span><Users className="admin-stat-icon" size={17}/></div><strong className="admin-stat-value">{counts.accepted}</strong></div>
      <div className="admin-stat-card"><div className="admin-stat-top"><span className="admin-stat-label">Rejected</span><History className="admin-stat-icon" size={17}/></div><strong className="admin-stat-value">{counts.rejected}</strong></div>
    </div>
    <div className="admin-filter-panel">
      <div className="admin-filter-heading"><span className="admin-kicker">APPLICATION DIRECTORY</span><span className="admin-filter-count">Showing {shown.length} of {rows.length}</span></div>
      <div className={'admin-filter-grid'+(me.role==='admin'?' admin-filter-grid-wide':'')}>
        <input placeholder="Search name, school, email..." value={q} onChange={e=>setQ(e.target.value)} aria-label="Search applications"/>
        <select value={st} onChange={e=>setSt(e.target.value)} aria-label="Status">
          <option value="pending">Pending applications</option><option value="accepted">Accepted</option><option value="rejected">Rejected</option><option value="all">All statuses</option>
        </select>
        {me.role==='admin'&&<select value={tr} onChange={e=>setTr(e.target.value)} aria-label="Department">
          <option value="all">All departments</option><option>Volunteers</option><option>Security</option>
        </select>}
      </div>
      <div className="admin-toolbar-actions"><button className="btn ghost" onClick={load}>Refresh</button>{err&&<span className="err" role="alert">{err}</span>}</div>
    </div>
    {shown.length?shown.map(a=><AppCard key={a.id+a.status+String(a.recommendation)} a={a} me={me} reload={load}/>):<div className="admin-empty-state"><FileText size={25} strokeWidth={1.6}/><strong>{err?'Applications could not be loaded':'No applications found'}</strong><p>{err?'Check the database connection and access permissions, then refresh.':'Applications that match your current filters will appear here.'}</p></div>}
  </div>;
}
function Crud({table,cols,order='created_at',log,pre}:any){
  const [rows,setRows]=useState<any[]>([]);const [q,setQ]=useState('');const [neu,setNeu]=useState<any>({});const [msg,setMsg]=useState('');
  const load=useCallback(async()=>{const {data,error}=await sb.from(table).select('*').order(order,{ascending:order!=='created_at'});if(error)setMsg(error.message);setRows(data||[])},[table,order]);
  useEffect(()=>{load()},[load]);
  const save=async(id:any,k:string,v:any)=>{const {error}=await sb.from(table).update({[k]:v}).eq('id',id);setMsg(error?error.message:'Saved');if(!error){log(`update ${table}`,{id,field:k});load()}};
  const add=async()=>{const {error}=await sb.from(table).insert(neu);setMsg(error?error.message:'Added');if(!error){log(`add ${table}`,neu);setNeu({});load()}};
  const del=async(id:any)=>{if(!confirm('Delete this row? This cannot be undone.'))return;const {error}=await sb.from(table).delete().eq('id',id);setMsg(error?error.message:'Deleted');if(!error){log(`delete ${table}`,{id});load()}};
  const shown=rows.filter(r=>!q||JSON.stringify(r).toLowerCase().includes(q.toLowerCase()));
  const cell=(r:any,c:any)=>{const key=r.id+String(r[c.k]);
    if(c.t==='bool')return <input key={key} type="checkbox" defaultChecked={!!r[c.k]} onChange={e=>save(r.id,c.k,e.target.checked)}/>;
    if(c.t==='area')return <textarea key={key} defaultValue={r[c.k]||''} onBlur={e=>e.target.value!==(r[c.k]||'')&&save(r.id,c.k,e.target.value)}/>;
    return <input key={key} type={c.t==='num'?'number':'text'} defaultValue={r[c.k]??''} style={{width:c.t==='num'?80:170}} onBlur={e=>{const v=c.t==='num'?Number(e.target.value):e.target.value;v!==r[c.k]&&save(r.id,c.k,v)}}/>};
  return <div>{pre}<div className="toolbar"><input placeholder="Search" value={q} onChange={e=>setQ(e.target.value)} aria-label="Search"/><span className="msg">{msg}</span></div>
    <div className="tw"><table><thead><tr>{cols.map((c:any)=><th key={c.k}>{c.l}</th>)}<th/></tr></thead><tbody>
      {shown.map(r=><tr key={r.id}>{cols.map((c:any)=><td key={c.k}>{cell(r,c)}</td>)}<td><button className="btn red" onClick={()=>del(r.id)}>Delete</button></td></tr>)}
      <tr>{cols.map((c:any)=><td key={c.k}>{c.t==='bool'?<input type="checkbox" checked={neu[c.k]??true} onChange={e=>setNeu({...neu,[c.k]:e.target.checked})}/>:c.t==='area'?<textarea value={neu[c.k]||''} onChange={e=>setNeu({...neu,[c.k]:e.target.value})}/>:<input placeholder={'New '+c.l.toLowerCase()} type={c.t==='num'?'number':'text'} value={neu[c.k]??''} style={{width:c.t==='num'?80:170}} onChange={e=>setNeu({...neu,[c.k]:c.t==='num'?Number(e.target.value):e.target.value})}/>}</td>)}<td><button className="btn" onClick={add}>Add</button></td></tr>
    </tbody></table></div></div>;
}

function Roster({log}:any){
  const [tick,setTick]=useState(0);const [msg,setMsg]=useState('');
  const importCsv=async(f:File)=>{const rows=parseCSV(await f.text());const head=rows[0].map(h=>h.trim().toLowerCase());const ix=(n:string)=>head.indexOf(n);
    if(ix('email')<0||ix('full_name')<0){setMsg('CSV needs columns: full_name, email, phone, department, position');return}
    const seen=new Set<string>();const bad:string[]=[];const out:any[]=[];
    rows.slice(1).forEach((r,i)=>{const email=(r[ix('email')]||'').trim().toLowerCase();const name=(r[ix('full_name')]||'').trim();
      if(!name||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){bad.push('row '+(i+2));return}if(seen.has(email)){bad.push('duplicate row '+(i+2));return}seen.add(email);
      out.push({full_name:name,email,phone:ix('phone')>=0?r[ix('phone')]?.trim():null,department:ix('department')>=0?r[ix('department')]?.trim():null,position:ix('position')>=0?r[ix('position')]?.trim():null})});
    if(!out.length){setMsg('Nothing valid to import. Skipped: '+bad.join(', '));return}
    if(!confirm(`Import ${out.length} people? ${bad.length} rows will be skipped (missing or invalid email, or duplicates).`))return;
    const {error}=await sb.from('roster').upsert(out,{onConflict:'email'});setMsg(error?error.message:`Imported ${out.length}. Skipped: ${bad.join(', ')||'none'}`);
    if(!error){log('import roster',{count:out.length,skipped:bad.length});setTick(tick+1)}};
  const exportCsv=async()=>{const {data}=await sb.from('roster').select('full_name,email,phone,department,position');const h=['full_name','email','phone','department','position'];
    const csv=[h.join(',')].concat((data||[]).map((r:any)=>h.map(k=>'"'+String(r[k]??'').replace(/"/g,'""')+'"').join(','))).join('\n');
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='roster.csv';a.click();log('export roster')};
  return <div><h2>Roster</h2><p>Only emails on this list can create an account. Roles are set automatically: department <b style={{fontSize:'1rem',display:'inline'}}>Secretaries</b> or <b style={{fontSize:'1rem',display:'inline'}}>IT</b> gets the admin panel; anyone with "head" in their position (for example "Head" or "Co-head") can review applications for their own department (Volunteers or Security). Staff accounts start inactive: tick Active in Accounts to approve them.</p>
    <div className="toolbar"><label className="btn ghost">Import CSV<input type="file" accept=".csv" hidden onChange={e=>e.target.files?.[0]&&importCsv(e.target.files[0])}/></label><button className="btn ghost" onClick={exportCsv}>Export CSV</button><span className="msg">{msg}</span></div>
    <Crud key={tick} table="roster" order="full_name" log={log} cols={[{k:'full_name',l:'Name'},{k:'email',l:'Email'},{k:'phone',l:'Phone'},{k:'department',l:'Department'},{k:'position',l:'Position'}]}/></div>;
}

function Accounts({log}:any){
  const [rows,setRows]=useState<any[]>([]);const [msg,setMsg]=useState('');
  const load=useCallback(async()=>{const {data}=await sb.from('profiles').select('*').order('active').order('created_at');setRows(data||[])},[]);useEffect(()=>{load()},[load]);
  const upd=async(id:string,patch:any)=>{const {error}=await sb.from('profiles').update(patch).eq('id',id);setMsg(error?error.message:'Saved');if(!error){log('update account',{id,...patch});load()}};
  return <div><h2>Accounts</h2><p>People who have signed up. Inactive staff accounts are waiting for your approval: tick Active to let them in. You can also change roles here.</p><span className="msg">{msg}</span>
    <div className="tw"><table><thead><tr><th>Name</th><th>Position</th><th>Department</th><th>Role</th><th>Active</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.full_name}</td><td>{r.position}</td><td>{r.department}</td>
      <td><select value={r.role} onChange={e=>upd(r.id,{role:e.target.value})}><option>member</option><option>head</option><option>admin</option></select></td>
      <td><input type="checkbox" checked={r.active} onChange={e=>upd(r.id,{active:e.target.checked})}/></td></tr>)}</tbody></table></div></div>;
}

const DEFAULTS:any={hero_tagline:'Where diplomacy meets truth.',about_text:'',committees:{tba:true,items:[]},schedule:{tba:true,items:[]},faq:{tba:true,items:[]},register:{tba:true,link:''}};
function Content({log}:any){
  const [rows,setRows]=useState<any[]>([]);const [msg,setMsg]=useState('');const [nk,setNk]=useState('');
  const load=useCallback(async()=>{const {data}=await sb.from('site_content').select('*').order('key');setRows(data||[])},[]);useEffect(()=>{load()},[load]);
  const put=async(key:string,raw:any)=>{let value=raw;if(typeof raw==='string'){try{value=JSON.parse(raw)}catch{value=raw}}
    const {error}=await sb.from('site_content').upsert({key,value,updated_at:new Date().toISOString()});setMsg(error?error.message:`Saved "${key}"`);if(!error){log('update content',{key});load()}};
  const del=async(key:string)=>{if(!confirm(`Delete "${key}"?`))return;const {error}=await sb.from('site_content').delete().eq('key',key);setMsg(error?error.message:'Deleted');if(!error){log('delete content',{key});load()}};
  const seed=async()=>{for(const k of Object.keys(DEFAULTS))if(!rows.find(r=>r.key===k))await put(k,DEFAULTS[k])};
  return <div><h2>Site content</h2><p>Text and settings for the public site. Plain text is saved as text. Sections use JSON, for example <code>{'{"tba":false,"items":[...]}'}</code>.</p>
    <div className="toolbar"><button className="btn ghost" onClick={seed}>Add default keys</button><input placeholder="new key" value={nk} onChange={e=>setNk(e.target.value.replace(/\W/g,'_'))}/><button className="btn" onClick={()=>{if(nk){put(nk,'');setNk('')}}}>Add key</button><span className="msg">{msg}</span></div>
    {rows.map(r=>{const v=typeof r.value==='string'?r.value:JSON.stringify(r.value,null,1);return <div className="card" key={r.key+v} style={{marginBottom:12}}><b style={{fontSize:'1.1rem'}}>{r.key}</b>
      <textarea id={'k_'+r.key} defaultValue={v}/><div className="toolbar"><button className="btn" onClick={()=>put(r.key,(document.getElementById('k_'+r.key) as HTMLTextAreaElement).value)}>Save</button><button className="btn red" onClick={()=>del(r.key)}>Delete</button></div></div>})}</div>;
}

function Overview(){
  const [n,setN]=useState<any>({});
  const [recent,setRecent]=useState<any[]>([]);
  useEffect(()=>{(async()=>{
    const c=async(t:string,f?:any)=>{let q=sb.from(t).select('id',{count:'exact',head:true});if(f)q=f(q);return (await q).count||0};
    const [r,p,pend,wait,appr]=await Promise.all([
      c('roster'),c('profiles'),
      c('applications',(q:any)=>q.eq('status','pending')),
      c('applications',(q:any)=>q.eq('status','pending').not('recommendation','is',null)),
      c('profiles',(q:any)=>q.eq('active',false))
    ]);
    setN({r,p,w:Math.max(r-p,0),pend,wait,appr});
    const {data}=await sb.from('audit_log').select('*').order('created_at',{ascending:false}).limit(8);
    setRecent(data||[]);
  })()},[]);
  return <div className="admin-page">
    <div className="admin-page-heading">
      <div><p className="admin-kicker">VERITAS MUN / ADMINISTRATION</p><h1>Executive overview</h1><p>A central view of team access, application progress and recent administration activity.</p></div>
    </div>
    <div className="admin-stat-grid">
      <div className="admin-stat-card"><div className="admin-stat-top"><span className="admin-stat-label">Accounts awaiting approval</span><UserRound className="admin-stat-icon" size={17}/></div><strong className="admin-stat-value">{n.appr??'-'}</strong></div>
      <div className="admin-stat-card"><div className="admin-stat-top"><span className="admin-stat-label">Pending applications</span><ClipboardList className="admin-stat-icon" size={17}/></div><strong className="admin-stat-value">{n.pend??'-'}</strong></div>
      <div className="admin-stat-card"><div className="admin-stat-top"><span className="admin-stat-label">Awaiting final decision</span><History className="admin-stat-icon" size={17}/></div><strong className="admin-stat-value">{n.wait??'-'}</strong></div>
      <div className="admin-stat-card"><div className="admin-stat-top"><span className="admin-stat-label">On the team roster</span><Users className="admin-stat-icon" size={17}/></div><strong className="admin-stat-value">{n.r??'-'}</strong></div>
    </div>
    <div className="admin-stat-grid">
      <div className="admin-stat-card"><div className="admin-stat-top"><span className="admin-stat-label">Registered accounts</span><UserRound className="admin-stat-icon" size={17}/></div><strong className="admin-stat-value">{n.p??'-'}</strong></div>
      <div className="admin-stat-card"><div className="admin-stat-top"><span className="admin-stat-label">Not registered yet</span><Users className="admin-stat-icon" size={17}/></div><strong className="admin-stat-value">{n.w??'-'}</strong></div>
    </div>
    <div className="admin-panel admin-activity">
      <p className="admin-kicker">ADMINISTRATION / HISTORY</p><h2>Recent activity</h2>
      {recent.length?<div className="admin-activity-list">{recent.map(x=><div className="admin-activity-row" key={x.id}><span>{x.action}</span><time>{new Date(x.created_at).toLocaleString()}</time></div>)}</div>:<div className="admin-empty-state"><History size={22}/><strong>No activity recorded yet</strong><p>Changes made in the admin portal will appear here.</p></div>}
    </div>
  </div>;
}
function Admin({me}:any){
  const admin=me.role==='admin';
  const tabs=admin?['Overview','Applications','Roster','Accounts','Site content','Team cards','Announcements','Audit log']:['Applications'];
  const [tab,setTab]=useState(tabs[0]);
  const log=(action:string,details:any={})=>sb.from('audit_log').insert({user_id:me.id,action,details});
  const navGroups=admin?[
    {title:'Operations',items:[{label:'Overview',icon:LayoutDashboard},{label:'Applications',icon:ClipboardList}]},
    {title:'Team management',items:[{label:'Roster',icon:Users},{label:'Accounts',icon:UserRound},{label:'Announcements',icon:Megaphone},{label:'Audit log',icon:History}]},
    {title:'Website',items:[{label:'Site content',icon:Globe},{label:'Team cards',icon:Users}]}
  ]:[{title:'Department review',items:[{label:'Applications',icon:ClipboardList}]}];
  const initials=(me.full_name||'VM').split(' ').filter(Boolean).slice(0,2).map((part:string)=>part[0]).join('').toUpperCase();
  return <div className="admin-layout">
    <aside className="admin-sidebar">
      <div className="admin-brand"><div className="admin-wordmark">VERITAS <span>MUN</span></div><div className="admin-brand-sub">ADMINISTRATION PORTAL</div></div>
      <div className="admin-nav-scroll">
        {navGroups.map(group=><div className="admin-nav-group" key={group.title}>
          <div className="admin-nav-group-title">{group.title}</div>
          {group.items.map(item=>{const Icon=item.icon;return <button key={item.label} type="button" className={'admin-nav-item'+(tab===item.label?' active':'')} onClick={()=>setTab(item.label)} aria-current={tab===item.label?'page':undefined}><Icon size={17} strokeWidth={1.8}/><span>{item.label}</span></button>})}
        </div>)}
      </div>
      <div className="admin-sidebar-footer">
        <div className="admin-profile"><div className="admin-avatar">{initials}</div><div className="admin-profile-copy"><strong>{me.full_name||'Team member'}</strong><span>{me.position||me.role}</span></div></div>
        <a className="admin-site-link" href="/"><span><Globe size={15}/>Conference website</span><ExternalLink size={14}/></a>
      </div>
    </aside>
    <div className="admin-main-column">
      <header className="admin-topbar">
        <div className="admin-breadcrumb"><span>VERITAS MUN</span><ChevronRight size={14}/><strong>{tab}</strong></div>
        <div className="admin-top-actions">
          <span className="admin-role-pill"><span className="admin-role-dot"/>{admin?'ADMIN':'DEPARTMENT HEAD'}</span>
          <a className="admin-top-link" href="/account">My account</a>
          <button className="btn ghost" onClick={()=>sb.auth.signOut()}><LogOut size={14}/>Sign out</button>
        </div>
      </header>
      <main className="admin-content">
        {tab==='Overview'&&<Overview/>}
        {tab==='Applications'&&<Applications me={me}/>}
        {tab==='Roster'&&<div className="admin-page"><div className="admin-page-heading"><div><p className="admin-kicker">TEAM MANAGEMENT / DIRECTORY</p><h1>Team roster</h1><p>Manage roster records and import the approved team list.</p></div></div><Roster log={log}/></div>}
        {tab==='Accounts'&&<div className="admin-page"><div className="admin-page-heading"><div><p className="admin-kicker">TEAM MANAGEMENT / ACCESS</p><h1>Accounts</h1><p>Manage registered team accounts, roles and active access.</p></div></div><Accounts log={log}/></div>}
        {tab==='Site content'&&<div className="admin-page"><div className="admin-page-heading"><div><p className="admin-kicker">WEBSITE / CONTENT</p><h1>Site content</h1><p>Edit the copy and sections displayed on the public Veritas MUN website.</p></div></div><Content log={log}/></div>}
        {tab==='Team cards'&&<div className="admin-page"><div className="admin-page-heading"><div><p className="admin-kicker">WEBSITE / SECRETARIAT</p><h1>Team cards</h1><p>Manage the Secretariat cards shown on the public Veritas MUN website.</p></div></div><Crud table="team_cards" order="sort_order" log={log} cols={[{k:'sort_order',l:'Order',t:'num'},{k:'full_name',l:'Name'},{k:'title',l:'Title'},{k:'photo_url',l:'Photo URL'},{k:'visible',l:'Visible',t:'bool'}]}/></div>}
        {tab==='Announcements'&&<div className="admin-page"><div className="admin-page-heading"><div><p className="admin-kicker">TEAM MANAGEMENT / COMMUNICATIONS</p><h1>Announcements</h1><p>Share updates with the whole team, a department, or department heads.</p></div></div><Crud table="announcements" log={log} cols={[{k:'title',l:'Title'},{k:'body',l:'Message',t:'area'},{k:'audience',l:'Audience'}]}/></div>}
        {tab==='Audit log'&&<div className="admin-page"><div className="admin-page-heading"><div><p className="admin-kicker">ADMINISTRATION / HISTORY</p><h1>Audit log</h1><p>A record of administrative changes.</p></div></div><Crud table="audit_log" log={()=>{}} cols={[{k:'created_at',l:'When'},{k:'action',l:'Action'}]}/></div>}
      </main>
    </div>
  </div>;
}
function App(){
  const [s,setS]=useState<any>(undefined);const [me,setMe]=useState<any>(undefined);const [rec,setRec]=useState(false);
  useEffect(()=>{sb.auth.getSession().then(({data}:any)=>setS(data.session));const {data:l}=sb.auth.onAuthStateChange((ev:any,x:any)=>{if(ev==='PASSWORD_RECOVERY')setRec(true);setS(x)});return()=>l.subscription.unsubscribe()},[]);
  useEffect(()=>{if(s)sb.from('profiles').select('*').eq('id',s.user.id).maybeSingle().then(({data}:any)=>setMe(data));else setMe(undefined)},[s]);
  const path=location.pathname.replace(/\/$/,'');
  if(path==='/apply')return <Apply/>;
  if(s===undefined)return <p className="c">Loading...</p>;
  if(!s||rec)return <Auth recovery={rec}/>;
  if(me===undefined)return <p className="c">Loading...</p>;
  if(!me||!me.active){const wait=me&&(me.role==='admin'||me.role==='head');return <div className="box"><h2>{wait?'Waiting for approval':'No access'}</h2><p>{wait?'Your account is created. An admin needs to approve it before you can use the portal. Ask the Secretariat or IT.':'This account is not active. Contact an admin.'}</p><button className="btn ghost" onClick={()=>sb.auth.signOut()}>Sign out</button></div>}
  if(path==='/admin')return (me.role==='admin'||me.role==='head')?<Admin me={me}/>:<div className="box"><h2>Access denied</h2><p>This area is for the Secretariat, IT and department heads.</p><a className="btn" href="/account">My account</a></div>;
  return <Account me={me}/>;
}

const st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
createRoot(document.getElementById('root')!).render(<App/>);
