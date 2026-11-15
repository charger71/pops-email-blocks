// node tools/email-blast-block.test.mjs
import assert from 'node:assert/strict';
import { unstyle, printingOf, parseArgs, renderBlock, fullDocument, parseName, matchTitles, descOf, variantLabel, featureSets, renderFeatures } from './email-blast-block.mjs';

const shop = { id: 'demo', domains: ['demo.example.com'] };
const items = [
  { id: 7, title: 'DARWINS GAME', issue_number: '3 (of 5)', price: 4.99, release_date: '2026-12-09', coverSrc: 'https://img.example.com/a-sm.jpg' },
  { id: 8, title: 'Tom & "Jerry" <b>', issue_number: null, price: 24, release_date: null, coverSrc: 'https://img.example.com/b.jpg' },
];
const html = renderBlock(items, { shop, settings: { shop_name: 'Demo', colors: { primary: '#123456' } }, page: 'pre-orders.html', heading: 'This Week', utm: 'utm_source=email&utm_campaign=wk' });

assert.match(html, /href="https:\/\/demo\.example\.com\/pre-orders\.html\?title=7&amp;utm_source=email&amp;utm_campaign=wk"/); // pull-list link carries the title and tracking
assert.match(html, /Darwins Game #3/); // distributor ALL CAPS softened
assert.match(html, /\$4\.99 · Out Dec 9/);
assert.match(html, /\$24\.00/);
assert.match(html, /bgcolor="#123456"/); // shop's own color on the button
assert.match(html, /Tom &amp; &quot;Jerry&quot; &lt;b&gt;/); // titles are escaped
assert.equal((html.match(/Add to Pull List/g) ?? []).length, 2);
assert.match(html, /@media only screen and \(max-width:480px\)/); // two across on phones
assert.ok(!/<script/i.test(html));
assert.match(fullDocument(html, 'x'), /^<!doctype html>/);

const o = parseArgs(['--limit', '6', '--status', 'a,b', '--ids', '1,2', '--all-covers']);
assert.deepEqual([o.limit, o.status, o.ids, o.allCovers], [6, ['a', 'b'], [1, 2], true]);
assert.throws(() => parseArgs(['--nope']));

// Report names → open pre-orders, main cover, soonest FOC
assert.deepEqual(parseName('Jessica Jones: Alias #1 (of 5)'), { title: 'jessicajonesalias', issue: '1', printing: null });
assert.deepEqual(parseName('Some Graphic Novel Vol. 2 (Hardcover)'), { title: 'somegraphicnovelvol2', issue: null, printing: null });
const rows = [
  { id: 1, title: 'ABSOLUTE BATMAN BEYOND ARK-M', issue_number: '1 (one-shot)', variant: 'CVR B X', status: 'pre_order', foc_date: '2026-11-16' },
  { id: 2, title: 'ABSOLUTE BATMAN BEYOND ARK-M', issue_number: '1 (one-shot)', variant: 'CVR A FRANCAVILLA', status: 'pre_order', foc_date: '2026-11-16' },
  { id: 3, title: 'JESSICA JONES: ALIAS', issue_number: '2', variant: 'COVER A', status: 'pre_order', foc_date: '2026-12-21' },
  { id: 4, title: 'JESSICA JONES: ALIAS', issue_number: '1', variant: 'COVER A', status: 'coming_soon', foc_date: '2026-10-19' },
  { id: 5, title: 'JESSICA JONES: ALIAS', issue_number: '1', variant: 'COVER A', status: 'pre_order', foc_date: '2026-11-16' },
];
const m = matchTitles(['Absolute Batman: Beyond Ark-M #1', 'Jessica Jones: Alias #1', 'Not A Real Book #9'], rows);
assert.deepEqual(m.items.map((r) => r.id), [2, 5]); // main cover, open ones only
assert.deepEqual(m.missing, ['Not A Real Book #9']);
assert.equal(matchTitles(['Jessica Jones: Alias #1'], rows, '2026-12-21').items.length, 0); // --foc narrows
const caps = renderBlock([{ id: 9, title: 'TALES OF THE GREEN LANTERN CORPS TRAINING DAY', issue_number: '1 (one-shot)', price: 5.99, coverSrc: 'x' }], { shop, page: 'p.html', heading: 'h' });
assert.match(caps, /Tales of the Green Lantern Corps Training Day #1</);
assert.match(renderBlock([{ id: 9, title: 'ABSOLUTE BATMAN BEYOND ARK-M', issue_number: '1', coverSrc: 'x' }], { shop, page: 'p.html', heading: 'h' }), /Ark-M #1</);

// Feature layout
assert.equal(descOf('SERIES PREMIERE Decades ago, five teens escaped. They hid.'), 'Decades ago, five teens escaped. They hid.');
assert.equal(descOf('BIG TAGLINE HERE! Then the real story. More.'), 'Then the real story. More.');
assert.equal(descOf(`${'word '.repeat(80)}`, 50).endsWith('…'), true);
assert.ok(descOf('word '.repeat(80), 50).length <= 51);
assert.equal(variantLabel('CVR B DUSTIN NGUYEN CARD STOCK VAR'), 'Cover B · Dustin Nguyen Card Stock');
assert.equal(variantLabel('COVER B CORIN HOWELL 25TH ANNIVERSARY VARIANT'), 'Cover B · Corin Howell 25th Anniversary');
const frows = [
  { id: 1, title: 'FORGOTTEN FIVE', issue_number: '1', variant: 'CVR A NICK', status: 'pre_order', foc_date: '2026-11-16', cover_url: 'u' },
  { id: 4, title: 'FORGOTTEN FIVE', issue_number: '1', variant: 'CVR D JERRY', status: 'pre_order', foc_date: '2026-11-16', cover_url: 'u' },
  { id: 2, title: 'FORGOTTEN FIVE', issue_number: '1', variant: 'CVR B DEAN', status: 'pre_order', foc_date: '2026-11-16', cover_url: 'u' },
  { id: 3, title: 'FORGOTTEN FIVE', issue_number: '1', variant: 'CVR C MICHEL', status: 'pre_order', foc_date: '2026-11-16', cover_url: 'u' },
  { id: 8, title: 'FORGOTTEN FIVE', issue_number: '2', variant: 'CVR A X', status: 'pre_order', foc_date: '2026-11-16', cover_url: 'u' },
  { id: 9, title: 'FORGOTTEN FIVE', issue_number: '2', variant: 'CVR B X', status: 'pre_order', foc_date: '2026-11-16', cover_url: 'u' },
];
const fs3 = featureSets(['Forgotten Five #1', 'Nope #1'], frows, { variants: 3 });
assert.deepEqual(fs3.sets[0].variants.map((r) => r.id), [2, 3, 4]); // B, C, D in cover order, only issue 1
assert.deepEqual(fs3.missing, ['Nope #1']);
assert.equal(featureSets(['Forgotten Five #1'], frows, { variants: 2 }).sets[0].variants.length, 2);
const two = featureSets(['Forgotten Five #1', 'Forgotten Five #2'], frows, { variants: 3 }).sets;
assert.deepEqual([two[0].variants.length, two[1].variants.length], [3, 0]); // only the first feature gets a variant row
const fset = (id, title, pub, withVariant = true) => ({ main: { id, title, issue_number: '1', publisher: pub, creators: 'A, B', description: 'A blurb. More blurb.', price: 4.99, release_date: '2026-12-16', coverSrc: 'm.jpg' }, variants: !withVariant ? [] : [{ id: id + 1, title, issue_number: '1', variant: 'CVR B DEAN KOTZ VAR', price: 5.99, coverSrc: 'v.jpg' }] });
const grid = [31, 32, 33].map((id) => ({ id, title: `GRID ${id}`, issue_number: '1', price: 3.99, coverSrc: 'g.jpg' }));
const feat = renderFeatures([fset(10, 'ONE', 'DC'), fset(20, 'TWO', 'Marvel', false)], { shop, page: 'pre-orders.html', heading: 'Final Call', more: grid });
assert.equal((feat.match(/<h3/g) ?? []).length, 2);
assert.ok(feat.indexOf('>One #1<') < feat.indexOf('A blurb.')); // title comes first, then the blurb
assert.ok(feat.indexOf('title=10') < feat.indexOf('title=11') && feat.indexOf('title=11') < feat.indexOf('title=20')); // feature, its variants, then the next feature
assert.equal((feat.match(/Add to Pull List/g) ?? []).length, 2 + 1 + 3); // two features, one variant, three grid cards
assert.equal((feat.match(/Variant covers/g) ?? []).length, 1);
assert.ok(feat.indexOf('title=20') < feat.indexOf('title=31') && feat.indexOf('title=33') < feat.indexOf('See every title')); // grid after the features
assert.equal((feat.match(/class="pw-card"/g) ?? []).length, 3);
assert.match(feat, /Cover B · Dean Kotz/);
assert.match(feat, /\.pw-fcol \{ width:100% !important/); // stacks on phones
assert.equal(parseArgs(['--features', 'A #1; B #2', '--variants', '2']).variants, 2);
assert.deepEqual(parseArgs(['--more', 'C #1; D #2']).more, ['C #1', 'D #2']);
const pr = matchTitles(['Absolute Batman Ark-M Special #1', 'Gargoyles #4'], [
  { id: 1, title: 'ABSOLUTE BATMAN ARK-M SPECIAL', issue_number: '1 (one-shot)', variant: 'Fourth Printing Cvr B Derrick Chew Foil Var', status: 'pre_order' },
  { id: 2, title: 'ABSOLUTE BATMAN ARK-M SPECIAL', issue_number: '1 (one-shot)', variant: 'Fourth Printing Cvr A Joshua Hixson', status: 'pre_order' },
  { id: 3, title: 'GARGOYLES (2026)', issue_number: '4', variant: 'CVR A X', status: 'pre_order' },
], null);
assert.deepEqual(pr.items.map((r) => r.id), [2, 3]); // printing covers and "(2026)" titles still match
assert.equal(variantLabel('Fourth Printing Cvr B Derrick Chew Foil Var'), 'Cover B · Derrick Chew Foil');

// Printings stay in the title
assert.equal(printingOf('Fourth Printing Cvr A Joshua Hixson'), '4th Printing');
assert.equal(printingOf('2ND PTG CVR A ADAM POLLINA FOIL'), '2nd Printing');
assert.equal(printingOf('5TH PTG'), '5th Printing');
assert.equal(printingOf('MARCO CHECCHETTO 2ND PRINTING VARIANT'), '2nd Printing');
assert.equal(printingOf('SECOND PRINTING DAN MORA VARIANT'), '2nd Printing');
assert.equal(printingOf('CVR A FRANCESCO FRANCAVILLA'), null);
assert.deepEqual(parseName('Absolute Batman Ark-M Special #1 (4th printing, covers A–B)'), { title: 'absolutebatmanarkmspecial', issue: '1', printing: '4th Printing' });
const prow = (id, issue, variant) => ({ id, title: 'LAST DRIVER', issue_number: issue, variant, status: 'pre_order', foc_date: '2026-11-16', cover_url: 'u' });
const prows = [prow(1, '1 (of 5)', 'CVR A X'), prow(2, '1 (of 5)', '5TH PTG'), prow(3, '1 (of 5)', '5TH PTG CVR B Y'), prow(4, '2 (of 5)', '3RD PTG')];
assert.deepEqual(matchTitles(['Last Driver #1'], prows).items.map((r) => r.id), [1]); // plain name → first printing
assert.deepEqual(matchTitles(['Last Driver #1 (5th printing)'], prows).items.map((r) => r.id), [2]); // named printing → that one
assert.deepEqual(matchTitles(['Last Driver #2'], prows).items.map((r) => r.id), [4]); // only a printing is open → it, labelled
assert.deepEqual(featureSets(['Last Driver #1 (5th printing)'], prows).sets[0].variants.map((r) => r.id), [3]); // variants stay within the printing
assert.equal(featureSets(['Last Driver #1'], prows).sets[0].variants.length, 0);
assert.match(renderBlock([{ ...prows[3], coverSrc: 'x' }], { shop, page: 'p.html', heading: 'h' }), /Last Driver #2 \(3rd Printing\)</);
assert.match(renderBlock([{ id: 9, title: 'ABSOLUTE BATMAN ARK-M SPECIAL', issue_number: '1 (one-shot)', variant: 'Fourth Printing Cvr A Joshua Hixson', coverSrc: 'x' }], { shop, page: 'p.html', heading: 'h' }), /Ark-M Special #1 \(4th Printing\)</);
// Tracking reaches every link: buttons, covers, titles and the footer
const trk = renderFeatures([fset(10, 'ONE', 'DC')], { shop, page: 'pre-orders.html', heading: 'h', utm: 'utm_source=email&utm_campaign=wk', more: grid });
const hrefs = [...trk.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
assert.ok(hrefs.length >= 10 && hrefs.every((h) => h.includes('utm_source=email&amp;utm_campaign=wk')), hrefs.filter((h) => !h.includes('utm_source')).join(' '));
assert.ok(!renderBlock(items, { shop, page: 'p.html', heading: 'h' }).includes('utm_'));
// Release blocks: found by on-sale date at any status, and no buttons
const rel = (id, title, issue, status, release) => ({ id, title, issue_number: issue, variant: 'COVER A', status, release_date: release, foc_date: '2026-11-02', cover_url: 'u' });
const rrows = [rel(1, 'MIDNIGHT SPIDER-MAN', '2', 'coming_soon', '2026-11-18'), rel(2, 'DETECTIVE COMICS', '1115', 'new_this_wednesday', '2026-11-18'), { ...rel(3, 'MIDNIGHT SPIDER-MAN', '2', 'coming_soon', '2026-11-18'), variant: 'COVER B' }];
assert.deepEqual(matchTitles(['Midnight Spider-Man #2', 'Detective Comics #1115'], rrows, null, null).items.map((r) => r.id), [1, 2]);
assert.equal(matchTitles(['Midnight Spider-Man #2'], rrows).items.length, 0); // default is still pre-orders only
assert.deepEqual(featureSets(['Midnight Spider-Man #2'], rrows, { statuses: null }).sets[0].variants.map((r) => r.id), [3]);
const nob = renderFeatures([{ main: { ...rrows[0], coverSrc: 'm', price: 4.99 }, variants: [{ ...rrows[2], coverSrc: 'v' }] }], { shop, page: 'p.html', heading: 'h', buttons: false, more: [{ ...rrows[1], coverSrc: 'g' }] });
assert.ok(!nob.includes('<a class="pw-b"')); // no button markup (the style rules for .pw-b stay in the CSS)
assert.ok(!/Add to Pull List/.test(nob));
assert.match(nob, /title=1"/); // cover and title still link to the title
assert.ok(!/Add to Pull List/.test(renderBlock([{ ...rrows[0], coverSrc: 'x' }], { shop, page: 'p.html', heading: 'h', buttons: false })));
assert.equal(parseArgs(['--release', '2026-11-18']).release, '2026-11-18');
assert.deepEqual(matchTitles(['BRZRKR: City of Darkness #1'], [
  { id: 1, title: 'BRZRKR: City of Darkness', issue_number: '1', variant: 'B Variant (Dressed, Fuso)', status: 'coming_soon' },
  { id: 2, title: 'BRZRKR: City of Darkness', issue_number: '1', variant: 'A Main (Dressed, Wong)', status: 'coming_soon' },
], null, null).items.map((r) => r.id), [2]);
// The block carries its own white panel, so dark text never lands on a dark page (no dark-mode colour swap)
for (const out of [html, feat, nob]) {
  assert.ok(!/prefers-color-scheme/.test(out));
  assert.match(out, /<div class="pw-wrap" style="background-color:#ffffff !important;[^"]*">/);
}
// Text stays dark enough on the white panel: every text colour in the block is near-black
for (const out of [html, feat, nob]) {
  const colors = [...out.matchAll(/(?<![-\w])color:(#[0-9a-f]{6})/gi)].map((m) => m[1].toLowerCase());
  const light = colors.filter((c) => c !== '#ffffff' && [1, 3, 5].some((i) => parseInt(c.slice(i, i + 2), 16) > 0x98) ); // white is the button text on the brand fill
  assert.deepEqual(light, [], `text colours too light: ${light}`);
}
// Pinned against an email tool's own theme colours: inline !important on every colour and background
for (const out of [html, feat, nob]) {
  const styles = [...out.matchAll(/style="([^"]*)"/g)].map((m) => m[1]);
  const free = styles.filter((st) => /(?<![-\w])color:[^;]+/.test(st) && !/(?<![-\w])color:[^;]*!important/.test(st));
  assert.deepEqual(free, [], `text colour without !important: ${free[0]}`);
  assert.ok(!/<table role="presentation" width="100%"[^>]*border="0">/.test(out), 'a full-width table without a white background');
  for (const m of out.matchAll(/<td ([^>]*?)style="([^"]*)"/g)) assert.match(m[2], /^background-color:#[0-9a-f]{6} !important;/, `td without pinned background: ${m[0].slice(0, 80)}`);
  assert.match(out, /<div class="pw-wrap" style="background-color:#ffffff !important;[^"]*">/);
  assert.match(out, /<div class="pw-grid" style="background-color:#ffffff !important;font-size:0;/);
}
assert.match(html, /bgcolor="#123456" style="background-color:#123456 !important;border-radius:4px;"/); // the button keeps the brand fill
// --inherit: nothing for the email tool's theme to fight with
const plain = renderFeatures([fset(10, 'ONE', 'DC'), fset(20, 'TWO', 'Marvel', false)], { shop, settings: { colors: { primary: '#123456' } }, page: 'pre-orders.html', heading: 'Final Call', more: grid, inherit: true });
const plainGrid = renderBlock(items, { shop, page: 'p.html', heading: 'h', inherit: true });
for (const out of [plain, plainGrid]) {
  assert.ok(!/#[0-9a-f]{6}/i.test(out), `a hex colour is left: ${out.match(/#[0-9a-f]{6}/i)}`);
  assert.ok(!/(?<![-\w])color:/.test(out) && !/bgcolor/.test(out), 'colour left');
  assert.ok([...out.matchAll(/background[^;"]*/g)].every((m) => m[0] === 'background-color:transparent !important'), 'a background other than transparent is left');
  assert.ok(!/<table(?![^>]*transparent)[^>]*>/.test(out) && !/<td(?![^>]*transparent)[^>]*>/.test(out), 'a table or cell without a transparent background');
  assert.ok(!/Arial|Helvetica|font-family|font:/.test(out), 'a font is left');
  assert.ok(!/style=""/.test(out));
  assert.match(out, /font-size:\d+px;line-height:[\d.]+;font-weight:bold;/); // sizes and weights stay
  assert.match(out, /<a class="pw-b"[^>]*style="border:2px solid currentColor;/); // the button outlines itself in the theme's link colour
}
assert.match(plain, /font-size:22px;line-height:1\.2;font-weight:bold;/);
assert.match(plain, /class="pw-fcol pw-fcover" style="background-color:transparent !important;display:inline-block;vertical-align:top;width:40%;/); // layout stays
assert.equal(unstyle('<td bgcolor="#fff" style="background-color:#fff !important;color:#000 !important;padding:1px;">'), '<td style="background-color:transparent !important;padding:1px;">');
console.log('email-blast-block: ok');
