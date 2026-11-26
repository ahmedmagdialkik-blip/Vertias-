// Loads content edited in the admin panel and delegates cleanly to the site's unified renderer.
// If anything fails, the site keeps its built-in content.
import { mergeSiteContentWithFallback } from './utils/portalLogic';
import { normalizeCommitteeRows } from './utils/committeesAndSettingsLogic';

const SUPABASE_URL = (import.meta.env?.VITE_SUPABASE_URL || '').trim() || 'https://iaionntcwjblvndmdesw.supabase.co';
const SUPABASE_KEY =
  (import.meta.env?.VITE_SUPABASE_ANON_KEY || '').trim() || 'sb_publishable_1Qg2Z-_1-QvviWwr-ZM9_w_3nmqnxX7';
const API = `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1`;

const get = (table, query = '') =>
  fetch(`${API}/${table}?select=*${query}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
  }).then((r) => (r.ok ? r.json() : Promise.reject(r.status)));

function normalizeLegacyContentRows(rows) {
  const mapped = [];
  const rowMap = new Map();
  for (const r of rows || []) {
    if (!r || !r.key) continue;
    rowMap.set(r.key, r.value);
    mapped.push(r);
  }
  // Support legacy flat keys ('hero_tagline', 'about_text', '{tba:false}') alongside structured keys
  if (typeof rowMap.get('hero_tagline') === 'string' && rowMap.get('hero_tagline').trim() && !rowMap.has('hero')) {
    mapped.push({ key: 'hero', value: { title: 'VERITAS MUN', tagline: rowMap.get('hero_tagline').trim() } });
  }
  if (typeof rowMap.get('about_text') === 'string' && rowMap.get('about_text').trim() && !rowMap.has('about')) {
    const paragraphs = rowMap
      .get('about_text')
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    mapped.push({ key: 'about', value: { paragraphs } });
  }
  ['committees', 'schedule', 'faq'].forEach((secKey) => {
    const val = rowMap.get(secKey);
    if (val && typeof val === 'object' && typeof val.tba === 'boolean' && typeof val.showTba !== 'boolean') {
      const normalizedItems = Array.isArray(val.items)
        ? val.items.map((it) => {
            if (secKey === 'faq' && 'q' in it) return { question: it.q || '', answer: it.a || '' };
            if (secKey === 'schedule' && 'when' in it) return { dateTime: it.when || '', title: it.title || '', details: it.details || '' };
            return it;
          })
        : [];
      mapped.push({
        key: secKey,
        value: { showTba: val.tba, tbaSubtitle: val.tbaSubtitle || 'To be announced.', items: normalizedItems }
      });
    }
  });
  return mergeSiteContentWithFallback(mapped);
}

(async () => {
  try {
    const [
      siteRows,
      teamRows,
      committeeRows,
      scheduleDays,
      scheduleSessions,
      faqs,
      documents,
      sponsors,
      gallery
    ] = await Promise.all([
      get('site_content').catch(() => null),
      get('team_cards', '&visible=eq.true&order=sort_order.asc').catch(() => null),
      get('committees', '&enabled=eq.true&order=sort_order.asc,created_at.asc').catch(() => null),
      get('schedule_days', '&published=eq.true&order=day_number.asc,sort_order.asc').catch(() => null),
      get('schedule_sessions', '&published=eq.true&order=sort_order.asc,start_time.asc').catch(() => null),
      get('faqs', '&published=eq.true&order=sort_order.asc,created_at.asc').catch(() => null),
      get('conference_documents', '&published=eq.true&audience=eq.public&order=sort_order.asc,created_at.asc').catch(() => null),
      get('sponsors', '&published=eq.true&order=sort_order.asc,created_at.asc').catch(() => null),
      get('gallery_items', '&published=eq.true&order=sort_order.asc,created_at.asc').catch(() => null)
    ]);

    const payload = {};
    if (Array.isArray(siteRows)) {
      payload.content = normalizeLegacyContentRows(siteRows);
    }
    if (Array.isArray(teamRows) && teamRows.length > 0) {
      payload.teamCards = teamRows;
    }
    if (Array.isArray(committeeRows)) {
      payload.committees = normalizeCommitteeRows(committeeRows).filter((c) => c.enabled);
    }
    if (Array.isArray(scheduleDays)) payload.scheduleDays = scheduleDays;
    if (Array.isArray(scheduleSessions)) payload.scheduleSessions = scheduleSessions;
    if (Array.isArray(faqs)) payload.faqs = faqs;
    if (Array.isArray(documents)) payload.documents = documents;
    if (Array.isArray(sponsors)) payload.sponsors = sponsors;
    if (Array.isArray(gallery)) payload.gallery = gallery;

    if (typeof window.__veritasApplyPublicData === 'function') {
      window.__veritasApplyPublicData(payload);
    }
  } catch {
    // Keep built-in fallback content on transient failure
  }
})();
