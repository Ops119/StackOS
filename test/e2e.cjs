const puppeteer = require('puppeteer-core'); const fs = require('fs'); const path = require('path');
const BASE = process.argv[2] || 'http://127.0.0.1:8787/'; const OUT = process.argv[3] || '/workspace/stackos/screenshots';
fs.mkdirSync(OUT, { recursive: true }); const DL = '/tmp/ht/dl'; fs.rmSync(DL, { recursive: true, force: true }); fs.mkdirSync(DL, { recursive: true });
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  const cdp = await p.createCDPSession(); await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });
  await p.setViewport({ width: 1440, height: 900 }); await p.goto(BASE, { waitUntil: 'networkidle0' });
  await p.evaluate(() => localStorage.clear()); await p.reload({ waitUntil: 'networkidle0' });
  const r = {};
  r.cards = await p.$$eval('#grid .card', e => e.length);
  await p.click('.sec[data-s="fin"]'); r.finCards = await p.$$eval('#grid .card', e => e.length);
  await p.click('.sec[data-s="all"]');
  await p.type('#q', 'postgres'); r.searchPostgres = await p.$$eval('#grid .card h3', e => e.map(x => x.textContent));
  await p.click('#q', { clickCount: 3 }); await p.keyboard.press('Backspace');
  await p.click('.add[data-id="github"]'); await p.click('.add[data-id="stripe"]'); r.afterAdd = await p.$eval('#countBadge', e => e.textContent);
  await p.click('.add[data-id="stripe"]'); r.afterRemove = await p.$eval('#countBadge', e => e.textContent);
  await p.click('.stk[data-stack="fullstack"]'); r.afterStack = await p.$eval('#countBadge', e => e.textContent);
  await new Promise(s => setTimeout(s, 400));
  await p.screenshot({ path: path.join(OUT, 'stackos-desktop.png') });
  for (const t of ['claude', 'chatgpt', 'grok', 'cursor', 'vscode', 'env']) {
    await p.click(`.tab[data-tab="${t}"]`); const n = await p.$$eval('#fileSel option', e => e.length);
    for (let i = 0; i < n; i++) { await p.select('#fileSel', String(i)); await p.click('#dlBtn'); await new Promise(s => setTimeout(s, 250)); }
  }
  await p.click('.tab[data-tab="claude"]');
  await p.click('#zipBtn'); await new Promise(s => setTimeout(s, 1200));
  // live scan
  await p.type('#q', 'notion'); await p.click('#scanBtn');
  await p.waitForFunction(() => /found|unreachable/.test(document.querySelector('#regStatus').textContent), { timeout: 40000 });
  r.regStatus = await p.$eval('#regStatus', e => e.textContent); r.regCards = await p.$$eval('#regGrid .card', e => e.length);
  const firstReg = await p.$('#regGrid .add'); if (firstReg) { await firstReg.click(); r.afterRegAdd = await p.$eval('#countBadge', e => e.textContent); }
  await p.evaluate(() => document.getElementById('registryBlock').scrollIntoView());
  await p.screenshot({ path: path.join(OUT, 'stackos-livescan.png') });
  // mobile
  const m = await b.newPage(); await m.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 }); await m.goto(BASE, { waitUntil: 'networkidle0' });
  r.mobileOverflow = await m.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  await m.screenshot({ path: path.join(OUT, 'stackos-mobile.png') });
  await m.click('#stackToggle'); await new Promise(s => setTimeout(s, 400)); await m.screenshot({ path: path.join(OUT, 'stackos-mobile-stack.png') });
  r.errors = errs; r.downloads = fs.readdirSync(DL);
  console.log(JSON.stringify(r, null, 1)); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
