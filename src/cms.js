// Loads content edited in the admin panel and applies it to the public site.
// If anything fails, the site keeps its built-in content.
const API = 'https://iaionntcwjblvndmdesw.supabase.co/rest/v1';
const KEY = 'sb_publishable_1Qg2Z-_1-QvviWwr-ZM9_w_3nmqnxX7'; // public key; the database enforces access rules
const get = (t, q = '') =>
  fetch(`${API}/${t}?select=*${q}`, { headers: { apikey: KEY } }).then((r) => (r.ok ? r.json() : Promise.reject(r.status)));
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

function style() {
  const s = document.createElement('style');
  s.textContent = `.cms-list{display:grid;gap:22px;max-width:46rem}.cms-item{border-top:1px solid currentColor;padding-top:14px}
.cms-h{margin:0 0 6px;font-family:Cinzel,serif;font-size:1.35rem}.cms-p{margin:4px 0;font-size:1.2rem;line-height:1.5;opacity:.9;white-space:pre-wrap}.cms-when{margin:0;font-size:.95rem;opacity:.7}`;
  document.head.appendChild(s);
}

function section(id, v) {
  const stage = document.querySelector(`#${id} .tba-stage`);
  if (!stage || !v || typeof v !== 'object' || v.tba !== false) return; // still TBA
  const box = el('div', 'cms-list');
  (v.items || []).forEach((it) => {
    const row = el('div', 'cms-item');
    if (id === 'faq') row.append(el('h3', 'cms-h', it.q), el('p', 'cms-p', it.a));
    else if (id === 'schedule') row.append(el('p', 'cms-when', it.when), el('h3', 'cms-h', it.title), el('p', 'cms-p', it.details));
    else row.append(el('h3', 'cms-h', it.name), el('p', 'cms-p', it.details));
    box.append(row);
  });
  if (box.children.length) stage.replaceWith(box);
}

function cards(rows) {
  const cl = document.querySelector('.secretariat-cluster');
  if (!cl || !rows.length) return;
  const ents = [...cl.querySelectorAll('.secretariat-entry')];
  const used = new Set();
  const nameOf = (x) => (x.querySelector('.secretariat-name')?.textContent || '').trim().toLowerCase();
  rows.sort((a, b) => a.sort_order - b.sort_order).forEach((r) => {
    let e = ents.find((x) => nameOf(x) === r.full_name.trim().toLowerCase());
    if (!e) {
      e = ents[0] && ents[0].cloneNode(true);
      if (!e) return;
      e.className = 'secretariat-entry';
      e.querySelector('.secretariat-name').textContent = r.full_name;
      cl.append(e);
    }
    used.add(e);
    const role = e.querySelector('.secretariat-role');
    if (role && r.title) role.textContent = r.title;
    const img = e.querySelector('img');
    if (img && r.photo_url) { img.src = r.photo_url; img.alt = r.full_name; img.parentElement.classList.remove('is-missing'); }
  });
  ents.forEach((e) => { if (!used.has(e)) e.style.display = 'none'; });
}

(async () => {
  try {
    const [c, t] = await Promise.all([get('site_content'), get('team_cards', '&order=sort_order')]);
    const m = Object.fromEntries(c.map((r) => [r.key, r.value]));
    style();
    if (typeof m.hero_tagline === 'string' && m.hero_tagline.trim()) {
      const tag = document.querySelector('.hero-tag');
      if (tag) tag.textContent = m.hero_tagline;
    }
    if (typeof m.about_text === 'string' && m.about_text.trim()) {
      const box = document.querySelector('.about-prose');
      if (box) {
        box.textContent = '';
        m.about_text.split(/\n\s*\n/).forEach((p, i) => box.append(el('p', i === 0 ? 'dropcap' : '', p.trim())));
      }
    }
    ['committees', 'schedule', 'faq'].forEach((id) => section(id, m[id]));
    cards(t);
  } catch (e) { /* keep built-in content */ }
})();
