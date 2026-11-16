#!/usr/bin/env node
// Email-blast block: pulls titles from a shop's public catalog and writes a responsive, email-safe HTML/CSS section
// (cover, title, price, and an "Add to Pull List" button that opens that title's details on the shop's site).
// Reads only what customers can already see (the shop's anon key from shops.json); nothing is changed.
// No dependencies.
//
//   node tools/email-blast-block.mjs                          # popscomics502, 12 open pre-orders, soonest FOC first
//   node tools/email-blast-block.mjs --limit 9 --out blast.html
//   node tools/email-blast-block.mjs --status new_this_wednesday,just_arrived --heading "New This Week"
//   node tools/email-blast-block.mjs --ids 7173,7229,7261     # exactly these titles, in this order
//   node tools/email-blast-block.mjs --titles "Absolute Batman: Beyond Ark-M #1; Jessica Jones: Alias #1"
//                                                             # the report's push picks, matched by name (separate with ;)
//   node tools/email-blast-block.mjs --inherit                # no colours, backgrounds or font families: the email tool's theme styles it all
//   node tools/email-blast-block.mjs --features "Absolute Batman: Beyond Ark-M #1; Jessica Jones: Alias #1; Forgotten Five #1"
//                                                             # big 2-column feature per title (cover, title first, description, button);
//                                                             # only the FIRST one is followed by a row of its first 3 variant covers (--variants N)
//   node tools/email-blast-block.mjs --features "A #1; B #1; C #1" --more "D #5; E #2; F #1; ..."
//                                                             # --more fills in the rest of the report as a 3-column grid under the features
//   node tools/email-blast-block.mjs --release 2026-11-18 --features "..." --more "..."
//                                                             # new releases: same layouts, titles looked up by on-sale date at any status
//                                                             # (no buttons: cover and title still link to the title's page)
//   node tools/email-blast-block.mjs --foc 2026-11-16         # only titles with that FOC date (use with --titles to pick the right issue)
//   node tools/email-blast-block.mjs --all-covers             # include variant covers (default: main covers only)
//   node tools/email-blast-block.mjs --page new-arrivals.html # which site page the buttons open (default pre-orders.html)
//   node tools/email-blast-block.mjs --full                   # a complete <html> document instead of just the block
//
// Paste the output (the block, or --full) into the HTML/code block of Mailchimp, Klaviyo, EmailOctopus, etc.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = (n) => (n == null ? '' : `$${Number(n).toFixed(2)}`);
const SMALL = new Set(['a', 'an', 'and', 'at', 'in', 'of', 'on', 'or', 'the', 'to', 'vs', 'vs.']);
/** ALL-CAPS distributor text → Title Case ("TALES OF THE GREEN LANTERN CORPS" → "Tales of the Green Lantern Corps"); mixed-case text is left alone. */
const nice = (s) => (/[a-z]/.test(s) ? s : s.toLowerCase().replace(/[a-z0-9'.]+(?:-[a-z0-9']+)*/g, (w, i) => (i > 0 && SMALL.has(w) ? w : w.replace(/(^|-)([a-z])/g, (_, d, c) => d + c.toUpperCase()))));
const issueNo = (i) => String(i ?? '').match(/\d+/)?.[0] ?? null;
const titleOf = (i) => nice(i.title) + (i.issue_number ? ` #${issueNo(i.issue_number) ?? i.issue_number}` : '') + (printingOf(i.variant) ? ` (${printingOf(i.variant)})` : '');
const ORDINAL = { second: '2nd', third: '3rd', fourth: '4th', fifth: '5th', sixth: '6th', seventh: '7th', eighth: '8th' };
const PRINT_RE = /\b(second|third|fourth|fifth|sixth|seventh|eighth|\d+(?:st|nd|rd|th))\s*(?:printing|ptg)\b/i;
/** "Fourth Printing Cvr A …", "2ND PTG", "… 2ND PRINTING VARIANT" → "4th Printing" / "2nd Printing"; null for a first printing. */
export const printingOf = (v) => {
  const m = String(v ?? '').match(PRINT_RE);
  return m ? `${ORDINAL[m[1].toLowerCase()] ?? m[1].toLowerCase()} Printing` : null;
};
const withoutPrinting = (v) => String(v ?? '').replace(new RegExp(PRINT_RE.source, 'ig'), ' ').replace(/\s+/g, ' ').trim();
const MAIN_COVER = (v) => {
  const r = withoutPrinting(v);
  return !r || /^[\s(]*(?:facsimile(?:\s+edition)?\s+)?(?:(?:cvr|cover)\s+a\b|a$|a\s+main\b)/i.test(r); // "CVR A …", "(CVR A) (Artist)", "FACSIMILE EDITION CVR A …", "Cover A", a bare "A", Boom's "A Main (Dressed, Wong)"
};
const norm = (s) => String(s ?? '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
const sameTitle = (s) => norm(String(s ?? '').replace(/\(\d{4}\)/g, '')); // the catalog's "GARGOYLES (2026)" is the report's "Gargoyles"
/** "Jessica Jones: Alias #1 (of 5)" → { title: 'jessicajonesalias', issue: '1' }; no "#" means the title alone (a trade, a graphic novel). */
export function parseName(name) {
  const m = String(name).trim().match(/^(.*?)\s*#\s*(\d+)\b.*$/);
  const printing = printingOf(name);
  return m ? { title: norm(m[1]), issue: m[2], printing } : { title: norm(String(name).replace(/\(.*?\)/g, '')), issue: null, printing };
}

export function parseArgs(argv) {
  const o = { shop: 'popscomics502', status: ['pre_order'], limit: 12, page: 'pre-orders.html', heading: 'Pre-Order Now — Add to Your Pull List', allCovers: false, full: false, variants: 3 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => argv[++i];
    if (a === '--shop') o.shop = val();
    else if (a === '--status') o.status = val().split(',');
    else if (a === '--limit') o.limit = Number(val());
    else if (a === '--titles') o.titles = val().split(/\s*;\s*/).filter(Boolean);
    else if (a === '--foc') o.foc = val();
    else if (a === '--release') o.release = val();
    else if (a === '--features') o.features = val().split(/\s*;\s*/).filter(Boolean);
    else if (a === '--variants') o.variants = Number(val());
    else if (a === '--more') o.more = val().split(/\s*;\s*/).filter(Boolean);
    else if (a === '--ids') o.ids = val().split(',').map(Number).filter(Boolean);
    else if (a === '--page') o.page = val();
    else if (a === '--heading') o.heading = val();
    else if (a === '--out') o.out = val();
    else if (a === '--utm') o.utm = val();
    else if (a === '--all-covers') o.allCovers = true;
    else if (a === '--full') o.full = true;
    else if (a === '--inherit') o.inherit = true;
    else throw new Error(`Unknown option ${a}`);
  }
  return o;
}

const shopConfig = (id) => {
  const shop = JSON.parse(fs.readFileSync(path.join(ROOT, 'shops.json'), 'utf8')).shops.find((s) => s.id === id);
  if (!shop) throw new Error(`No shop "${id}" in shops.json`);
  return shop;
};

async function rest(shop, table, query) {
  const res = await fetch(`${shop.supabaseUrl}/rest/v1/${table}?${query}`, { headers: { apikey: shop.anonKey } });
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

/** The small (560 px) copy the site's cards use, when it exists; else the full picture. */
async function emailCover(url) {
  if (!url) return null;
  const small = /^https:\/\/(images\.pullwise\.shop|[^/?#]+\/storage\/v1\/object\/public\/media)\/.+\.\w+$/.test(url) ? url.replace(/\.\w+$/, '-sm.jpg') : null;
  if (!small) return url;
  try {
    return (await fetch(small, { method: 'HEAD' })).ok ? small : url;
  } catch {
    return url;
  }
}

/** The best open pre-order for each name: main cover, soonest FOC (or the --foc one). Names that match nothing come back in `missing`. */
export function matchTitles(names, rows, foc, statuses = ['pre_order']) {
  const inScope = rows.filter((r) => (!statuses || statuses.includes(r.status)) && (!foc || r.foc_date === foc));
  const mains = inScope.filter((r) => MAIN_COVER(r.variant));
  const items = [];
  const missing = [];
  const fitsIn = (pool, want) => pool.filter((r) => sameTitle(r.title) === want.title && (want.issue == null || issueNo(r.issue_number) === want.issue));
  // Letter order, so "C Cenobite Bag Variant" loses to "(CVR B)"; unlettered covers go last.
  const letter = (r) => String(r.variant ?? '').match(/(?:^|[\s(])(?:cvr|cover|variant)?\s*([a-z])\b/i)?.[1]?.toLowerCase() ?? '~';
  for (const name of names) {
    const want = parseName(name);
    const fits = fitsIn(mains, want);
    // A name that says "(4th printing)" wants exactly that printing; a plain name wants the first printing, else whatever is open.
    let hit = want.printing ? fits.find((r) => printingOf(r.variant) === want.printing) : (fits.find((r) => !printingOf(r.variant)) ?? fits[0]);
    if (!hit) {
      // No main cover is listed (a printing that only has a variant cover, or a book whose A cover isn't in the catalog): use the next best.
      const any = fitsIn(inScope, want).sort((a, b) => letter(a).localeCompare(letter(b)));
      hit = want.printing ? any.find((r) => printingOf(r.variant) === want.printing) : (any.find((r) => !printingOf(r.variant)) ?? any[0]);
    }
    if (hit) items.push(hit);
    else missing.push(name);
  }
  return { items, missing };
}

/** The catalog's blurb for an email: tags and markup removed, a leading ALL-CAPS tagline dropped, cut at a word near `max` characters. */
export function descOf(text, max = 240) {
  let t = String(text ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  t = t.replace(/^(?:[A-Z0-9'’&!:-]{2,}\s+){2,}(?=[A-Z][a-z])/, ''); // a run of ALL-CAPS label words before the sentence ("SERIES PREMIERE After…")
  const parts = t.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [t];
  while (parts.length > 1 && !/[a-z]/.test(parts[0])) parts.shift();
  t = parts.join('').trim();
  if (t && !/[a-z]/.test(t)) t = t.charAt(0) + t.slice(1).toLowerCase();
  if (t.length > max) t = `${t.slice(0, max).replace(/\s+\S*$/, '').replace(/[\s,;:–—-]+$/, '')}…`;
  return t;
}

/** "CVR B DUSTIN NGUYEN CARD STOCK VAR" → "Cover B · Dustin Nguyen Card Stock" */
export function variantLabel(v) {
  const plain = withoutPrinting(v);
  const m = plain.match(/^(?:cvr|cover)\s+([a-z])\b\s*(?:by\s+)?(.*)$/i);
  if (!m) return nice(plain);
  const rest = nice(m[2].replace(/\b(?:var|variant)\b/gi, '').replace(/\s+/g, ' ').trim());
  return `Cover ${m[1].toUpperCase()}${rest ? ` · ${rest}` : ''}`;
}
const coverLetter = (v) => withoutPrinting(v).match(/^(?:cvr|cover)\s+([a-z])\b/i)?.[1]?.toLowerCase() ?? '~';

/**
 * For each name: the main cover (see matchTitles). The first one also gets its first `variants` other covers (B, C, D … in
 * order) with the same FOC date; the rest get none. Names that match nothing come back in `missing`.
 */
export function featureSets(names, rows, { foc, variants = 3, statuses = ['pre_order'] } = {}) {
  const { items, missing } = matchTitles(names, rows, foc, statuses);
  const sets = items.map((main, n) => ({
    main,
    variants: n > 0 ? [] : rows
      .filter((r) => (!statuses || statuses.includes(r.status)) && r.cover_url && r.id !== main.id && !MAIN_COVER(r.variant) && sameTitle(r.title) === sameTitle(main.title) && issueNo(r.issue_number) === issueNo(main.issue_number) && r.foc_date === main.foc_date && r.release_date === main.release_date && printingOf(r.variant) === printingOf(main.variant))
      .sort((a, b) => coverLetter(a.variant).localeCompare(coverLetter(b.variant)) || a.id - b.id)
      .slice(0, variants),
  }));
  return { sets, missing };
}

export async function loadItems(shop, o, today = new Date().toISOString().slice(0, 10)) {
  const cols = 'id,title,issue_number,variant,price,cover_url,status,foc_date,release_date,publisher,description,creators';
  let q = `select=${cols}&hidden=eq.false`;
  if (o.titles) {
    const rows = await rest(shop, 'items', `${q}&status=eq.pre_order&order=foc_date.asc.nullslast,id.asc&limit=2000`);
    const { items, missing } = matchTitles(o.titles, rows, o.foc);
    if (missing.length) console.error(`Not open for pre-order in ${shop.id} (skipped): ${missing.join('; ')}`);
    return items;
  }
  if (o.ids) q += `&id=in.(${o.ids.join(',')})`;
  else {
    q += `&status=in.(${o.status.join(',')})&cover_url=not.is.null`;
    if (o.status.length === 1 && o.status[0] === 'pre_order') q += `&or=(foc_date.is.null,foc_date.gte.${today})`; // still open to pull
    q += '&order=foc_date.asc.nullslast,title.asc,issue_number.asc.nullsfirst';
  }
  let rows = await rest(shop, 'items', q);
  if (o.ids) rows.sort((a, b) => o.ids.indexOf(a.id) - o.ids.indexOf(b.id));
  else if (!o.allCovers) rows = rows.filter((r) => MAIN_COVER(r.variant));
  if (o.foc) rows = rows.filter((r) => r.foc_date === o.foc);
  return rows.slice(0, o.ids ? undefined : o.limit);
}

export async function loadFeatures(shop, o) {
  const cols = 'id,title,issue_number,variant,price,cover_url,status,foc_date,release_date,publisher,description,creators';
  // A release date looks up every title on it, whatever its status; otherwise only titles still open for pre-order.
  const where = o.release ? `release_date=eq.${o.release}` : 'status=eq.pre_order';
  const rows = await rest(shop, 'items', `select=${cols}&hidden=eq.false&${where}&order=foc_date.asc.nullslast,id.asc&limit=3000`);
  const statuses = o.release ? null : ['pre_order'];
  const { sets, missing } = featureSets(o.features, rows, { ...o, statuses });
  const shown = new Set(sets.map((s) => s.main.id));
  const extra = matchTitles(o.more ?? [], rows, o.foc, statuses);
  const more = extra.items.filter((r) => !shown.has(r.id));
  const skipped = [...missing, ...extra.missing];
  if (skipped.length) console.error(`Not found in ${shop.id} (skipped): ${skipped.join('; ')}`);
  return { sets, more };
}

const CSS = `
  .pw-wrap { width:100%; margin:0 auto; background-color:#ffffff; }
  .pw-grid { font-size:0; text-align:center; }
  .pw-card { display:inline-block; vertical-align:top; width:33.33%; min-width:160px; font-size:14px; }
  .pw-cover { display:block; width:100%; max-width:100%; height:auto; margin:0 auto; border:0; }
  .pw-btn a:hover { opacity:.88; }
  .pw-fcol { display:inline-block; vertical-align:top; }
  .pw-var { display:inline-block; vertical-align:top; width:33.33%; font-size:14px; }
  @media only screen and (max-width:480px) {
    .pw-fcol { width:100% !important; min-width:0 !important; }
    .pw-fcover { text-align:center !important; }
    .pw-b { padding:8px 5px !important; font-size:11px !important; }
    .pw-card { width:50% !important; min-width:0 !important; }
    .pw-pad { padding-left:8px !important; padding-right:8px !important; }
    .pw-h { font-size:20px !important; }
  }`;

const outOn = (i) => (i.release_date ? `Out ${new Date(`${i.release_date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}` : '');

/** Address, brand color and button shared by every layout. */
function parts({ shop, settings, page, utm, buttons = true }) {
  const base = `https://${shop.domains[0]}`;
  const brand = settings?.colors?.primary || '#982c21';
  const link = (id) => {
    const u = new URL(`${base}/${page}`);
    u.searchParams.set('title', id);
    if (utm) for (const [k, v] of new URLSearchParams(utm)) u.searchParams.set(k, v);
    return esc(u.toString());
  };
  const listUrl = new URL(`${base}/${page}`);
  if (utm) for (const [k, v] of new URLSearchParams(utm)) listUrl.searchParams.set(k, v);
  const listLink = esc(listUrl.toString());
  const button = (id, small) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="pw-btn"><tr><td align="center" bgcolor="${brand}" style="border-radius:4px;">
      <a class="pw-b" href="${link(id)}" style="display:inline-block;padding:${small ? '8px 10px' : '11px 18px'};font:bold ${small ? 12 : 14}px/1 Arial,Helvetica,sans-serif;color:#ffffff;text-decoration:none;border-radius:4px;">Add to Pull List</a>
    </td></tr></table>`;
  return { base, brand, link, listLink, button: (id, small) => (buttons ? button(id, small) : ''), buttons };
}

const heading = (text) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="pw-pad" align="center" style="padding:20px 12px 6px;">
    <h2 class="pw-h pw-title" style="margin:0;font:bold 24px/1.2 Arial,Helvetica,sans-serif;color:#000000;">${esc(text)}</h2>
  </td></tr></table>`;

const footer = ({ brand, listLink }, shop) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:4px 12px 24px;font:13px/1.4 Arial,Helvetica,sans-serif;">
    <a href="${listLink}" style="color:${brand};font-weight:bold;">See every title at ${esc(shop.domains[0])}</a>
  </td></tr></table>`;

/** One grid card: cover, title, price and date, button. */
const cardHtml = (i, { brand, link, buttons = true }) => {
  const t = esc(titleOf(i));
  const href = link(i.id);
  const when = outOn(i);
  return `
<!--[if mso]><td width="200" valign="top"><![endif]-->
<div class="pw-card" style="display:inline-block;vertical-align:top;width:33.33%;min-width:160px;font-size:14px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:10px 8px 18px;">
    <a href="${href}" style="text-decoration:none;"><img class="pw-cover" src="${esc(i.coverSrc)}" width="176" alt="Cover of ${t}" style="display:block;width:100%;max-width:100%;height:auto;border:0;margin:0 auto;"></a>
    <p class="pw-title" style="margin:10px 0 2px;font:bold 15px/1.25 Arial,Helvetica,sans-serif;color:#000000;"><a href="${href}" style="color:inherit;text-decoration:none;">${t}</a></p>
    <p class="pw-meta" style="margin:0 0 ${buttons ? 10 : 0}px;font:14px/1.3 Arial,Helvetica,sans-serif;color:#2b2926;">${esc([money(i.price), when].filter(Boolean).join(' · '))}</p>
    ${buttons ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" class="pw-btn"><tr><td align="center" bgcolor="${brand}" style="border-radius:4px;">
      <a class="pw-b" href="${href}" style="display:inline-block;padding:9px 14px;font:bold 13px/1 Arial,Helvetica,sans-serif;color:#ffffff;text-decoration:none;border-radius:4px;">Add to Pull List</a>
    </td></tr></table>` : ''}
  </td></tr></table>
</div>
<!--[if mso]></td><![endif]-->`;
};

function renderBlockRaw(items, { shop, settings, page, heading: head, utm, buttons = true }) {
  const p0 = parts({ shop, settings, page, utm, buttons });
  const cards = items.map((i) => cardHtml(i, p0));
  return `<!-- ${esc(settings?.shop_name ?? shop.id)}: weekly titles block. Generated by tools/email-blast-block.mjs -->
<style>${CSS}
</style>
<div class="pw-wrap" style="background-color:#ffffff;width:100%;margin:0 auto;">
  ${heading(head)}
  <div class="pw-grid" style="font-size:0;text-align:center;">
  <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><![endif]-->${cards.join('')}
  <!--[if mso]></tr></table><![endif]-->
  </div>
  ${footer(p0, shop)}
</div>
`;
}

/**
 * Feature layout: for each set, one large two-column feature (cover left; title first, then who made it, the blurb, the
 * price and the button on the right) and under it a row of that title's variant covers. Phones stack the feature.
 * sets: [{ main, variants }] with coverSrc on every item. `more`: the rest of the report's titles, a 3-column grid after the features.
 */
function renderFeaturesRaw(sets, { shop, settings, page, heading: head, utm, more = [], buttons = true }) {
  const p = parts({ shop, settings, page, utm, buttons });
  const feature = ({ main: i, variants }) => {
    const t = esc(titleOf(i));
    const href = p.link(i.id);
    const by = [i.publisher, i.creators].filter(Boolean).join(' · ');
    const desc = descOf(i.description);
    const var3 = variants.map((v) => `
<!--[if mso]><td width="200" valign="top"><![endif]-->
<div class="pw-var" style="display:inline-block;vertical-align:top;width:33.33%;min-width:140px;font-size:14px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:8px 6px 14px;">
    <a href="${p.link(v.id)}" style="text-decoration:none;"><img class="pw-cover" src="${esc(v.coverSrc)}" width="150" alt="${esc(`${variantLabel(v.variant)} of ${titleOf(v)}`)}" style="display:block;width:100%;max-width:100%;height:auto;border:0;margin:0 auto;"></a>
    <p class="pw-title" style="margin:8px 0 2px;font:bold 13px/1.25 Arial,Helvetica,sans-serif;color:#000000;">${esc(variantLabel(v.variant))}</p>
    <p class="pw-meta" style="margin:0 0 ${buttons ? 8 : 0}px;font:13px/1.3 Arial,Helvetica,sans-serif;color:#2b2926;">${esc(money(v.price))}</p>
    ${buttons ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" class="pw-btn"><tr><td align="center" bgcolor="${p.brand}" style="border-radius:4px;">
      <a class="pw-b" href="${p.link(v.id)}" style="display:inline-block;padding:8px 10px;font:bold 12px/1 Arial,Helvetica,sans-serif;color:#ffffff;text-decoration:none;border-radius:4px;">Add to Pull List</a>
    </td></tr></table>` : ''}
  </td></tr></table>
</div>
<!--[if mso]></td><![endif]-->`).join('');
    return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:18px 12px 0;border-top:1px solid #d9d4c8;">
    <div style="font-size:0;">
    <!--[if mso]><table role="presentation" width="576" cellpadding="0" cellspacing="0" border="0"><tr><td width="230" valign="top"><![endif]-->
    <div class="pw-fcol pw-fcover" style="display:inline-block;vertical-align:top;width:40%;min-width:200px;font-size:14px;text-align:left;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:0 12px 12px 0;">
        <a href="${href}" style="text-decoration:none;"><img class="pw-cover" src="${esc(i.coverSrc)}" width="220" alt="Cover of ${t}" style="display:block;width:100%;max-width:100%;height:auto;border:0;margin:0 auto;"></a>
      </td></tr></table>
    </div>
    <!--[if mso]></td><td width="346" valign="top"><![endif]-->
    <div class="pw-fcol" style="display:inline-block;vertical-align:top;width:60%;min-width:240px;font-size:14px;text-align:left;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:0 0 12px 4px;">
        <h3 class="pw-title" style="margin:0 0 4px;font:bold 22px/1.2 Arial,Helvetica,sans-serif;color:#000000;"><a href="${href}" style="color:inherit;text-decoration:none;">${t}</a></h3>
        ${by ? `<p class="pw-meta" style="margin:0 0 10px;font:14px/1.35 Arial,Helvetica,sans-serif;color:#2b2926;">${esc(by)}</p>` : ''}
        ${desc ? `<p class="pw-desc" style="margin:0 0 12px;font:15px/1.5 Arial,Helvetica,sans-serif;color:#1a1816;">${esc(desc)}</p>` : ''}
        <p class="pw-title" style="margin:0 0 ${buttons ? 14 : 0}px;font:bold 15px/1.3 Arial,Helvetica,sans-serif;color:#000000;">${esc([money(i.price), outOn(i)].filter(Boolean).join(' · '))}</p>
        ${p.button(i.id)}
      </td></tr></table>
    </div>
    <!--[if mso]></td></tr></table><![endif]-->
    </div>${variants.length ? `
    <p class="pw-meta" style="margin:6px 0 0;font:bold 12px/1.3 Arial,Helvetica,sans-serif;color:#2b2926;text-transform:uppercase;letter-spacing:.04em;text-align:center;">Variant covers</p>
    <div class="pw-grid" style="font-size:0;text-align:center;">
    <!--[if mso]><table role="presentation" width="576" cellpadding="0" cellspacing="0" border="0"><tr><![endif]-->${var3}
    <!--[if mso]></tr></table><![endif]-->
    </div>` : ''}
  </td></tr></table>`;
  };
  return `<!-- ${esc(settings?.shop_name ?? shop.id)}: weekly feature block. Generated by tools/email-blast-block.mjs -->
<style>${CSS}
</style>
<div class="pw-wrap" style="background-color:#ffffff;width:100%;margin:0 auto;">
  ${heading(head)}${sets.map(feature).join('')}${more.length ? `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:18px 12px 0;border-top:1px solid #d9d4c8;" align="center">
    <p class="pw-meta" style="margin:0 0 4px;font:bold 12px/1.3 Arial,Helvetica,sans-serif;color:#2b2926;text-transform:uppercase;letter-spacing:.04em;">More to pre-order</p>
    <div class="pw-grid" style="font-size:0;text-align:center;">
    <!--[if mso]><table role="presentation" width="576" cellpadding="0" cellspacing="0" border="0"><tr><![endif]-->${more.map((i) => cardHtml(i, p)).join('')}
    <!--[if mso]></tr></table><![endif]-->
    </div>
  </td></tr></table>` : ''}
  ${footer(p, shop)}
</div>
`;
}

/**
 * Email tools (EmailOctopus and others) lay their own theme colours over pasted HTML. Inline `!important` beats even their
 * `!important` rules, so every text colour and every background in the block is pinned this way, and every table, cell and
 * wrapper gets an explicit white (or, for the button, brand) background.
 */
export function harden(html) {
  const WHITE = 'background-color:#ffffff !important;';
  return html
    .replace(/<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">/g, `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="${WHITE}">`)
    .replace(/<td ([^>]*?)style="([^"]*)"/g, (m, pre, st) => {
      const own = pre.match(/bgcolor="(#[0-9a-f]{6})"/i)?.[1]; // the button keeps its brand fill
      return `<td ${pre}style="background-color:${own ?? '#ffffff'} !important;${st}"`;
    })
    .replace(/<div class="(pw-[^"]*)">/g, `<div class="$1" style="${WHITE}">`)
    .replace(/(<div class="pw-[^"]*" style=")(?!background-color)([^"]*)"/g, `$1${WHITE}$2"`)
    .replace(/style="background-color:#ffffff;/g, `style="${WHITE}`)
    .replace(/(style="[^"]*?)(?<![-\w])color:(#[0-9a-f]{6}|inherit)(?!\s*!)/gi, '$1color:$2 !important');
}

/**
 * The opposite of harden(): no colours, backgrounds or font families at all, so the email tool's own theme (text, links,
 * page) styles the block and it matches the rest of the email. Layout, sizes and weights stay. The button, with no fill
 * of its own, becomes an outlined link in the theme's link colour.
 */
export function unstyle(html) {
  return html
    .replace(/ bgcolor="[^"]*"/g, '')
    .replace(/background-color:[^;"]*;?/g, '')
    .replace(/(?<![-\w])color:[^;"]*;?/g, '')
    .replace(/font:(bold )?(\d+)px\/([\d.]+) Arial,Helvetica,sans-serif;?/g, (_, b, size, lh) => `font-size:${size}px;line-height:${lh};${b ? 'font-weight:bold;' : ''}`)
    .replace(/(<a class="pw-b"[^>]*style=")/g, '$1border:2px solid currentColor;')
    .replace(/border-top:1px solid #[0-9a-f]{6};/g, 'border-top:1px solid rgba(128,128,128,.4);')
    .replace(/ style=""/g, '')
    // Say "see-through" out loud: email tools often paint their own white behind tables and cells, and inline !important beats them.
    .replace(/<(table|td|div class="pw-[^"]*") ([^>]*?)style="/g, (m, tag, pre) => `<${tag} ${pre}style="background-color:transparent !important;`)
    .replace(/<table ((?:(?!style=)[^>])*)>/g, '<table $1 style="background-color:transparent !important;">')
    .replace(/<(td|div class="pw-[^"]*")((?:(?!style=)[^>])*)>/g, '<$1$2 style="background-color:transparent !important;">');
}

const finish = (html, ctx) => (ctx.inherit ? unstyle(html) : harden(html));
export const renderBlock = (items, ctx) => finish(renderBlockRaw(items, ctx), ctx);
export const renderFeatures = (sets, ctx) => finish(renderFeaturesRaw(sets, ctx), ctx);

export const fullDocument = (block, title) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;">
${block}</body></html>
`;

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const shop = shopConfig(o.shop);
  const [settings] = await rest(shop, 'settings', 'select=shop_name,colors&id=eq.1').catch(() => []);
  const ctx = { shop, settings, page: o.page, heading: o.heading, utm: o.utm, buttons: !o.release, inherit: o.inherit }; // a release block (already out or about to be) has nothing to add, so no buttons
  let block;
  let items;
  if (o.features) {
    const { sets, more } = await loadFeatures(shop, o);
    if (!sets.length) throw new Error('No titles matched.');
    items = [...sets, ...more];
    for (const i of [...sets.flatMap((set) => [set.main, ...set.variants]), ...more]) i.coverSrc = await emailCover(i.cover_url);
    block = renderFeatures(sets.filter((s) => s.main.coverSrc).map((s) => ({ ...s, variants: s.variants.filter((v) => v.coverSrc) })), { ...ctx, more: more.filter((i) => i.coverSrc) });
  } else {
    items = await loadItems(shop, o);
    if (!items.length) throw new Error('No titles matched.');
    for (const i of items) i.coverSrc = await emailCover(i.cover_url);
    block = renderBlock(items.filter((i) => i.coverSrc), ctx);
  }
  const html = o.full ? fullDocument(block, settings?.shop_name ?? shop.id) : block;
  if (o.out) {
    fs.writeFileSync(o.out, html);
    console.error(`${items.length} titles → ${o.out}`);
  } else process.stdout.write(html);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => (console.error(e.message), process.exit(1)));
