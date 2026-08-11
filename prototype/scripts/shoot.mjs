import puppeteer from 'puppeteer-core';

const URL = process.argv[2] || 'http://localhost:5200/';
const OUT = process.argv[3] || '/tmp/kien-shot.png';
const WAIT = Number(process.argv[4] || 6000);
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--window-size=1200,800'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 800 });

const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => logs.push(`[reqfail] ${r.url()} ${r.failure()?.errorText}`));

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 20000 });

// simulate a wipe across the middle of the screen so tools actually fire
await page.mouse.move(400, 420);
await page.mouse.down();
for (let x = 400; x <= 820; x += 20) { await page.mouse.move(x, 420 + Math.sin(x / 60) * 40); }
await page.mouse.up();

await new Promise((r) => setTimeout(r, WAIT));

const diag = await page.evaluate(() => ({
  canvas: !!document.querySelector('canvas'),
  hudChildren: document.getElementById('hud')?.children.length ?? -1,
  err: document.getElementById('err')?.dataset.err || '',
}));

await page.screenshot({ path: OUT });
console.log('DIAG', JSON.stringify(diag));
console.log('LOGS\n' + logs.join('\n'));
await browser.close();
