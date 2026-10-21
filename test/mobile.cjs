// Mobile/tablet pass: overflow, tap targets, input font sizes, stack sheet, detail sheet, exports, live scan.
// usage: node test/mobile.cjs [baseUrl] [screenshotDir]   (needs puppeteer-core + Chrome at /usr/bin/google-chrome)
const puppeteer = require(process.env.PUPPETEER || 'puppeteer-core'); const fs = require('fs'); const path = require('path');
const BASE = process.argv[2] || 'http://127.0.0.1:8787/'; const OUT = process.argv[3] || path.join(__dirname, '../screenshots/mobile/after');
fs.mkdirSync(OUT, { recursive: true });
const SIZES = [[360, 740], [390, 844], [430, 932], [768, 1024]];
const wait = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('  ✗ ' + m); } else console.log('  ✓ ' + m); };
const audit = p => p.evaluate(() => {
  const small = [];
  document.querySelectorAll('button,a,select,input[type=search],label.chk').forEach(e => {
    if (!e.checkVisibility({ visibilityProperty: true })) return;
    const r = e.getBoundingClientRect(); if (!r.width || !r.height) return;
    if (r.height < 43.5 || r.width < 43.5) small.push((e.id || e.className || e.tagName) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
  });
  const fonts = [...document.querySelectorAll('input[type=search],select')].filter(e => e.checkVisibility()).map(e => parseFloat(getComputedStyle(e).fontSize));
  const clipped = []; document.querySelectorAll('body *').forEach(e => { if (e.closest('.sectors,.tabs,.preview,.stack:not(.open),#detail[hidden]') || !e.checkVisibility()) return; const r = e.getBoundingClientRect(); if (r.width && (r.right > innerWidth + 1 || r.left < -1)) clipped.push((e.id || e.className || e.tagName) + ' ' + Math.round(r.left) + '..' + Math.round(r.right)); });
  return { overflow: Math.max(document.documentElement.scrollWidth - innerWidth, clipped.length ? 1 : 0), clipped: clipped.slice(0, 6), small, minFont: Math.min(...fonts, 99) };
});
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  for (const [w, h] of SIZES) {
    const phone = w < 761; console.log(`\n${w}x${h}${phone ? '' : ' (tablet)'}`);
    const DL = `/tmp/stackos-dl-${w}`; fs.rmSync(DL, { recursive: true, force: true }); fs.mkdirSync(DL, { recursive: true });
    const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    const cdp = await p.createCDPSession(); await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });
    await p.setViewport({ width: w, height: h, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await p.goto(BASE, { waitUntil: 'networkidle0' }); await p.evaluate(() => localStorage.clear()); await p.reload({ waitUntil: 'networkidle0' });
    let a = await audit(p);
    ok(a.overflow === 0, `home: no horizontal overflow / clipped elements ${a.clipped.length ? JSON.stringify(a.clipped) : ''}`);
    ok(a.small.length === 0, `home: tap targets ≥44px ${a.small.length ? JSON.stringify(a.small.slice(0, 8)) : ''}`);
    ok(a.minFont >= 16, `inputs ≥16px (min ${a.minFont})`);
    await p.screenshot({ path: `${OUT}/${w}x${h}-1-home.png` });
    // sector chip + search
    await p.tap('.sec[data-s="fin"]'); ok(await p.$$eval('#grid .card', e => e.length) === 5, 'sector chip filters (Finance = 5)');
    await p.tap('.sec[data-s="all"]');
    await p.type('#q', 'supabase'); ok((await p.$$eval('#grid .card h3', e => e.map(x => x.textContent))).includes('Supabase'), 'search works');
    await p.$eval('#q', e => { e.value = ''; e.dispatchEvent(new Event('input')); });
    // detail sheet
    await p.tap('.nm[data-detail="firecrawl"]'); await wait(300);
    const d = await p.evaluate(() => { const s = document.querySelector('.sheet').getBoundingClientRect(), bd = document.getElementById('dBody'); return { visible: !document.getElementById('detail').hidden, inView: s.top >= 0 && s.bottom <= innerHeight + 1 && s.left >= 0 && s.right <= innerWidth + 1, overflow: document.documentElement.scrollWidth - innerWidth, locked: document.body.classList.contains('locked') }; });
    ok(d.visible && d.inView && d.overflow === 0 && d.locked, 'detail sheet opens inside the viewport, page locked');
    a = await audit(p); ok(a.overflow === 0, `detail: nothing clipped ${a.clipped.length ? JSON.stringify(a.clipped) : ''}`); ok(a.small.length === 0, `detail: tap targets ≥44px ${a.small.length ? JSON.stringify(a.small.slice(0, 6)) : ''}`);
    await p.screenshot({ path: `${OUT}/${w}x${h}-2-detail.png` });
    await p.tap('#dAdd'); ok(await p.$eval('#countBadge', e => e.textContent) === '1', 'add from detail sheet');
    await p.tap('#dClose'); await wait(200); ok(await p.$eval('#detail', e => e.hidden), 'detail sheet closes');
    // add/remove from card
    await p.tap('.add[data-id="github"]'); ok(await p.$eval('#countBadge', e => e.textContent) === '2', 'add from card');
    await p.tap('.add[data-id="github"]'); ok(await p.$eval('#countBadge', e => e.textContent) === '1', 'remove from card');
    // FAB (phones) shows count
    if (phone) { const f = await p.evaluate(() => { const e = document.getElementById('fab'), r = e.getBoundingClientRect(); return { vis: getComputedStyle(e).display !== 'none', count: document.getElementById('fabCount').textContent, inView: r.bottom <= innerHeight && r.right <= innerWidth }; }); ok(f.vis && f.count === '1' && f.inView, 'sticky stack button visible with count'); }
    // boot a stack -> opens drawer/sheet
    await p.tap('.stk[data-stack="fullstack"]'); await wait(450);
    const s = await p.evaluate(() => { const e = document.getElementById('stackPanel'), r = e.getBoundingClientRect(); return { open: e.classList.contains('open'), inView: r.left >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1, top: r.top, overflow: document.documentElement.scrollWidth - innerWidth, backdrop: document.getElementById('backdrop').classList.contains('show') }; });
    ok(s.open && s.inView && s.backdrop && s.overflow === 0, `stack ${phone ? 'bottom sheet' : 'drawer'} opens (top ${Math.round(s.top)}px)`);
    a = await audit(p); ok(a.overflow === 0, `stack panel: nothing clipped ${a.clipped.length ? JSON.stringify(a.clipped) : ''}`); ok(a.small.length === 0, `stack panel: tap targets ≥44px ${a.small.length ? JSON.stringify(a.small.slice(0, 6)) : ''}`);
    const toastInView = await p.evaluate(() => { const r = document.getElementById('toast').getBoundingClientRect(); return r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; });
    ok(toastInView, 'toast inside viewport');
    await p.screenshot({ path: `${OUT}/${w}x${h}-3-stack.png` });
    // code scrolls inside its box
    await p.tap('.tab[data-tab="claude"]');
    const pre = await p.evaluate(() => { const e = document.getElementById('preview'); return { inner: e.scrollWidth > e.clientWidth || e.scrollHeight > e.clientHeight, ov: getComputedStyle(e).overflowX, page: document.documentElement.scrollWidth - innerWidth, panel: document.getElementById('stackPanel').scrollWidth - document.getElementById('stackPanel').clientWidth }; });
    ok(pre.inner && pre.ov === 'auto' && pre.page === 0 && pre.panel <= 0, 'code block scrolls inside its box (page + panel do not overflow)');
    // every export downloads
    for (const t of ['claude', 'chatgpt', 'grok', 'cursor', 'vscode', 'env']) {
      await p.tap(`.tab[data-tab="${t}"]`); const n = await p.$$eval('#fileSel option', e => e.length);
      for (let i = 0; i < n; i++) { await p.select('#fileSel', String(i)); await p.$eval('#dlBtn', e => e.scrollIntoView({ block: 'nearest' })); await p.tap('#dlBtn'); await wait(200); }
    }
    await p.tap('.tab[data-tab="grok"]'); await p.screenshot({ path: `${OUT}/${w}x${h}-4-export.png` });
    await p.$eval('#zipBtn', e => e.scrollIntoView({ block: 'nearest' })); await p.tap('#zipBtn'); await wait(1000);
    const files = fs.readdirSync(DL); let valid = true;
    for (const f of files) if (f.endsWith('.json')) try { JSON.parse(fs.readFileSync(path.join(DL, f), 'utf8')); } catch (e) { valid = false; }
    ok(files.length === 12 && files.some(f => f.endsWith('.zip')) && valid, `downloads on ${phone ? 'mobile' : 'tablet'}: ${files.length}/12, JSON valid`);
    await p.$eval('#shareBtn', e => e.scrollIntoView({ block: 'nearest' })); await p.tap('#shareBtn'); await wait(300); ok((await p.$eval('#toast', e => e.textContent)).length > 0, 'share gives feedback');
    // close drawer
    await p.$eval('#closeStack', e => e.scrollIntoView({ block: 'nearest' })); await p.tap('#closeStack'); await wait(350);
    ok(await p.evaluate(() => !document.getElementById('stackPanel').classList.contains('open') && !document.body.classList.contains('locked')), 'stack panel closes, page unlocked');
    if (phone) { await p.tap('#fab'); await wait(350); ok(await p.$eval('#stackPanel', e => e.classList.contains('open')), 'sticky button opens the stack'); await p.tap('#backdrop').catch(() => {}); await p.keyboard.press('Escape'); await wait(350); ok(!(await p.$eval('#stackPanel', e => e.classList.contains('open'))), 'Escape/backdrop closes the stack'); }
    // live scan
    await p.type('#q', 'notion'); await p.tap('#scanBtn');
    await p.waitForFunction(() => /found|unreachable|Nothing/.test(document.querySelector('#regStatus').textContent), { timeout: 45000 }).catch(() => {});
    await wait(300); await p.evaluate(() => document.getElementById('registryBlock').scrollIntoView());
    a = await audit(p); const regN = await p.$$eval('#regGrid .card', e => e.length);
    ok(regN > 0 && a.overflow === 0, `live scan: ${regN} results, no overflow ${a.clipped.length ? JSON.stringify(a.clipped) : ''}`);
    a = await audit(p); ok(a.small.length === 0, `live scan: tap targets ≥44px ${a.small.length ? JSON.stringify(a.small.slice(0, 6)) : ''}`);
    await p.screenshot({ path: `${OUT}/${w}x${h}-5-livescan.png` });
    ok(errs.length === 0, 'no JS errors ' + (errs.length ? JSON.stringify(errs) : ''));
    await p.close();
  }
  // desktop sanity
  const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 }); await p.goto(BASE, { waitUntil: 'networkidle0' });
  await p.evaluate(() => localStorage.clear()); await p.reload({ waitUntil: 'networkidle0' }); await p.click('.stk[data-stack="fullstack"]'); await wait(300);
  const dsk = await p.evaluate(() => ({ fab: getComputedStyle(document.getElementById('fab')).display, panel: document.getElementById('stackPanel').getBoundingClientRect().left > 900, ov: document.documentElement.scrollWidth - innerWidth }));
  console.log('\n1440x900 (desktop)'); ok(dsk.fab === 'none' && dsk.panel && dsk.ov === 0, 'desktop layout unchanged: side panel, no FAB, no overflow');
  await p.screenshot({ path: `${OUT}/1440x900-desktop.png` }); await b.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL MOBILE CHECKS PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
