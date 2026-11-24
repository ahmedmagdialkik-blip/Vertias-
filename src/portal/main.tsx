import {createRoot} from 'react-dom/client';
import {useCallback,useEffect,useState} from 'react';
import {createClient} from '@supabase/supabase-js';

// Publishable key: safe in the browser. All access is enforced by Row Level Security in the database.
const sb:any=createClient('https://iaionntcwjblvndmdesw.supabase.co','sb_publishable_1Qg2Z-_1-QvviWwr-ZM9_w_3nmqnxX7');

const css=`*{box-sizing:border-box}body{margin:0;background:#EDE6D6;color:#1A1217;font:18px 'Cormorant Garamond',Georgia,serif}
h1,h2,h3,.brand{font-family:Cinzel,serif;font-weight:600}.c{padding:60px 24px;text-align:center}
.wrap{display:flex;min-height:100vh}.side{width:230px;background:#1A1217;color:#EDE6D6;padding:22px 14px;flex-shrink:0}
.side .brand{font-size:1.1rem;margin:0 8px 22px}.side button,.side a{display:block;width:100%;text-align:left;background:none;border:0;color:#EDE6D6;padding:11px 12px;font:inherit;cursor:pointer;border-radius:3px;text-decoration:none}
.side button.on,.side button:hover,.side a:hover{background:#2F6B34}.main{flex:1;padding:28px;min-width:0}
input,textarea,select{font:inherit;padding:7px 9px;border:1px solid #1A121755;background:#F7F2E6;border-radius:2px;max-width:100%}
textarea{width:100%;min-height:90px}.btn{background:#2F6B34;color:#fff;border:0;padding:9px 18px;font:inherit;cursor:pointer;border-radius:2px}.btn.red{background:#8a2b2b}.btn.ghost{background:none;color:#1A1217;border:1px solid #1A1217}
.tw{overflow-x:auto;margin:14px 0}table{border-collapse:collapse;width:100%;font-size:16px}td,th{border-bottom:1px solid #1A121733;padding:6px;text-align:left;vertical-align:top}th{font-family:Cinzel,serif;font-size:.8rem}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px}.card{background:#F7F2E6;padding:18px;border-left:4px solid #2F6B34}.card b{font-size:2.2rem;display:block}
.box{max-width:420px;margin:12vh auto;padding:30px;background:#F7F2E6;box-shadow:3px 5px 0 #1A121733}.box input{width:100%;margin:12px 0}.msg{margin:10px 0;color:#2F6B34}
.toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:12px 0}
@media(max-width:760px){.wrap{flex-direction:column}.side{width:100%;display:flex;flex-wrap:wrap;gap:4px;padding:10px}.side .brand{width:100%;margin:4px}.side button,.side a{width:auto}.main{padding:16px}}`;

function parseCSV(t:string){const rows:string[][]=[];let r:string[]=[],c='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];if(q){if(ch==='"'&&t[i+1]==='"'){c+='"';i++}else if(ch==='"')q=false;else c+=ch}else if(ch==='"')q=true;else if(ch===','){r.push(c);c=''}else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&t[i+1]==='\n')i++;r.push(c);c='';if(r.some(x=>x.trim()))rows.push(r);r=[]}else c+=ch}r.push(c);if(r.some(x=>x.trim()))rows.push(r);return rows}

function Login(){
  const [email,setEmail]=useState('');const [msg,setMsg]=useState('');const [busy,setBusy]=useState(false);
  const send=async(e:any)=>{e.preventDefault();setBusy(true);setMsg('');
    const {error}=await sb.auth.signInWithOtp({email:email.trim().toLowerCase(),options:{emailRedirectTo:location.origin+(location.pathname==='/admin'?'/admin':'/account')}});
    setBusy(false);
    setMsg(error?(error.status===429?'Too many emails were sent. Try again in a few minutes.':"We couldn't sign you in. Your email must be on the team list. Ask an admin to add it."):'Check your inbox for your login link.')};
  return <form className="box" onSubmit={send}><h2 style={{margin:0}}>Veritas MUN</h2><p>Team login. Enter the email you gave on the team form and we'll send you a login link.</p>
    <input type="email" required placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)} aria-label="Email"/>
    <button className="btn" disabled={busy}>{busy?'Sending...':'Send login link'}</button><div className="msg" role="status">{msg}</div></form>;
}

function Account({me}:any){
  const [ann,setAnn]=useState<any[]>([]);
  useEffect(()=>{sb.from('announcements').select('*').order('created_at',{ascending:false}).then(({data}:any)=>setAnn(data||[]))},[]);
  return <div className="main" style={{maxWidth:760,margin:'0 auto'}}>
    <h1>Welcome, {(me.full_name||'').split(' ')[0]}</h1>
    <div className="card"><b style={{fontSize:'1.4rem'}}>{me.full_name}</b>{me.position||'Member'}{me.department?' · '+me.department:''}<br/>Access level: {me.role}</div>
    <h2>Announcements</h2>{ann.length?ann.map(a=><div className="card" key={a.id} style={{marginBottom:12}}><h3 style={{margin:0}}>{a.title}</h3><p style={{whiteSpace:'pre-wrap'}}>{a.body}</p></div>):<p>No announcements yet.</p>}
    <div className="toolbar">{me.role==='admin'&&<a className="btn" href="/admin">Admin panel</a>}<a className="btn ghost" href="/">Back to site</a><button className="btn ghost" onClick={()=>sb.auth.signOut()}>Sign out</button></div></div>;
}

function Crud({table,cols,order='created_at',log,pre}:any){
  const [rows,setRows]=useState<any[]>([]);const [q,setQ]=useState('');const [neu,setNeu]=useState<any>({});const [msg,setMsg]=useState('');
  const load=useCallback(async()=>{const {data,error}=await sb.from(table).select('*').order(order,{ascending:order==='sort_order'});if(error)setMsg(error.message);setRows(data||[])},[table,order]);
  useEffect(()=>{load()},[load]);
  const idk=table==='audit_log'?'id':'id';
  const save=async(id:any,k:string,v:any)=>{const {error}=await sb.from(table).update({[k]:v}).eq(idk,id);setMsg(error?error.message:'Saved');if(!error){log(`update ${table}`,{id,field:k});load()}};
  const add=async()=>{const {error}=await sb.from(table).insert(neu);setMsg(error?error.message:'Added');if(!error){log(`add ${table}`,neu);setNeu({});load()}};
  const del=async(id:any)=>{if(!confirm('Delete this row? This cannot be undone.'))return;const {error}=await sb.from(table).delete().eq(idk,id);setMsg(error?error.message:'Deleted');if(!error){log(`delete ${table}`,{id});load()}};
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
  return <div><h2>Roster</h2><p>Only emails on this list can sign up. People are recognised by their email when they log in.</p>
    <div className="toolbar"><label className="btn ghost">Import CSV<input type="file" accept=".csv" hidden onChange={e=>e.target.files?.[0]&&importCsv(e.target.files[0])}/></label><button className="btn ghost" onClick={exportCsv}>Export CSV</button><span className="msg">{msg}</span></div>
    <Crud key={tick} table="roster" order="full_name" log={log} cols={[{k:'full_name',l:'Name'},{k:'email',l:'Email'},{k:'phone',l:'Phone'},{k:'department',l:'Department'},{k:'position',l:'Position'}]}/></div>;
}

function Accounts({log}:any){
  const [rows,setRows]=useState<any[]>([]);const [msg,setMsg]=useState('');
  const load=useCallback(async()=>{const {data}=await sb.from('profiles').select('*').order('created_at');setRows(data||[])},[]);useEffect(()=>{load()},[load]);
  const upd=async(id:string,patch:any)=>{const {error}=await sb.from('profiles').update(patch).eq('id',id);setMsg(error?error.message:'Saved');if(!error){log('update account',{id,...patch});load()}};
  return <div><h2>Accounts</h2><p>People who have signed up. Change their access level or deactivate them.</p><span className="msg">{msg}</span>
    <div className="tw"><table><thead><tr><th>Name</th><th>Position</th><th>Department</th><th>Role</th><th>Active</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.full_name}</td><td>{r.position}</td><td>{r.department}</td>
      <td><select value={r.role} onChange={e=>upd(r.id,{role:e.target.value})}><option>member</option><option>head</option><option>admin</option></select></td>
      <td><input type="checkbox" checked={r.active} onChange={e=>upd(r.id,{active:e.target.checked})}/></td></tr>)}</tbody></table></div></div>;
}

const DEFAULTS:any={hero_title:'Veritas MUN',hero_tagline:'Where diplomacy meets truth.',about_text:'',committees:{tba:true,items:[]},schedule:{tba:true,items:[]},faq:{tba:true,items:[]},register:{tba:true,link:''}};
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
  const [n,setN]=useState<any>({});const [recent,setRecent]=useState<any[]>([]);
  useEffect(()=>{(async()=>{const c=async(t:string)=>(await sb.from(t).select('id',{count:'exact',head:true})).count||0;
    const [r,p,a]=await Promise.all([c('roster'),c('profiles'),c('announcements')]);setN({r,p,a,w:Math.max(r-p,0)});
    const {data}=await sb.from('audit_log').select('*').order('created_at',{ascending:false}).limit(8);setRecent(data||[])})()},[]);
  return <div><h2>Overview</h2><div className="cards"><div className="card"><b>{n.r??'-'}</b>On the roster</div><div className="card"><b>{n.p??'-'}</b>Signed up</div><div className="card"><b>{n.w??'-'}</b>Not signed up yet</div><div className="card"><b>{n.a??'-'}</b>Announcements</div></div>
    <h3>Recent activity</h3>{recent.length?recent.map(x=><p key={x.id} style={{margin:'4px 0'}}>{new Date(x.created_at).toLocaleString()}: {x.action}</p>):<p>Nothing yet.</p>}</div>;
}

function Admin({me}:any){
  const [tab,setTab]=useState('Overview');
  const log=(action:string,details:any={})=>sb.from('audit_log').insert({user_id:me.id,action,details});
  const tabs=['Overview','Roster','Accounts','Site content','Team cards','Announcements','Audit log'];
  return <div className="wrap"><nav className="side"><div className="brand">Veritas Admin</div>{tabs.map(t=><button key={t} className={t===tab?'on':''} onClick={()=>setTab(t)}>{t}</button>)}<a href="/account">My account</a><a href="/">View site</a><button onClick={()=>sb.auth.signOut()}>Sign out</button></nav>
    <main className="main">{tab==='Overview'&&<Overview/>}{tab==='Roster'&&<Roster log={log}/>}{tab==='Accounts'&&<Accounts log={log}/>}{tab==='Site content'&&<Content log={log}/>}
    {tab==='Team cards'&&<div><h2>Team cards</h2><p>People shown on the public Secretariat section. Lower sort order shows first.</p><Crud table="team_cards" order="sort_order" log={log} cols={[{k:'sort_order',l:'Order',t:'num'},{k:'full_name',l:'Name'},{k:'title',l:'Title'},{k:'photo_url',l:'Photo URL'},{k:'visible',l:'Visible',t:'bool'}]}/></div>}
    {tab==='Announcements'&&<div><h2>Announcements</h2><p>Audience: all, a department name, or heads.</p><Crud table="announcements" log={log} cols={[{k:'title',l:'Title'},{k:'body',l:'Message',t:'area'},{k:'audience',l:'Audience'}]}/></div>}
    {tab==='Audit log'&&<div><h2>Audit log</h2><Crud table="audit_log" log={()=>{}} cols={[{k:'created_at',l:'When'},{k:'action',l:'Action'}]}/></div>}</main></div>;
}

function App(){
  const [s,setS]=useState<any>(undefined);const [me,setMe]=useState<any>(undefined);
  useEffect(()=>{sb.auth.getSession().then(({data}:any)=>setS(data.session));const {data:l}=sb.auth.onAuthStateChange((_e:any,x:any)=>setS(x));return()=>l.subscription.unsubscribe()},[]);
  useEffect(()=>{if(s)sb.from('profiles').select('*').eq('id',s.user.id).maybeSingle().then(({data}:any)=>setMe(data));else setMe(undefined)},[s]);
  const path=location.pathname.replace(/\/$/,'');
  if(s===undefined)return <p className="c">Loading...</p>;
  if(!s)return <Login/>;
  if(me===undefined)return <p className="c">Loading...</p>;
  if(!me||!me.active)return <div className="box"><h2>No access</h2><p>This account is not active. Contact an admin.</p><button className="btn ghost" onClick={()=>sb.auth.signOut()}>Sign out</button></div>;
  if(path==='/admin')return me.role==='admin'?<Admin me={me}/>:<div className="box"><h2>Access denied</h2><p>The admin panel is for admins only.</p><a className="btn" href="/account">My account</a></div>;
  return <Account me={me}/>;
}

const st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
createRoot(document.getElementById('root')!).render(<App/>);
