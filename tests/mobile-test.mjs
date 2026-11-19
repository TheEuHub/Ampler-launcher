#!/usr/bin/env node
// Touch-viewport browser regression test. Requires puppeteer-core and Chromium.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = (await import('puppeteer-core')).default; }
catch { console.log('Skipping mobile browser test: install puppeteer-core.'); process.exit(0); }
let executable = process.env.BROWSER_PATH;
if (!executable) {
    for (const cmd of ['google-chrome', 'chromium', 'chromium-browser']) {
        try { executable = execFileSync('which', [cmd], { encoding: 'utf8' }).trim(); break; } catch {}
    }
}
if (!executable || !existsSync(executable)) {
    console.log('Mobile browser test requires Chromium; set BROWSER_PATH.');
    process.exit(process.env.MOBILE_TEST_REQUIRED ? 1 : 0);
}
const port = 8900 + Math.floor(Math.random() * 500);
const server = spawn('python3', ['tools/serve.py', '--port', String(port), '--no-browser'], { cwd: root });
let browser;
try {
    const base = `http://127.0.0.1:${port}/`;
    let ready = false;
    for (let i = 0; i < 50; i++) {
        try { if ((await fetch(base)).ok) { ready = true; break; } } catch {}
        await new Promise(r => setTimeout(r, 100));
    }
    assert.ok(ready, 'server starts');
    browser = await puppeteer.launch({ executablePath: executable, args: ['--no-sandbox', '--disable-dev-shm-usage'], headless: true });
    for (const [width, height] of [[320, 700], [390, 844], [844, 390]]) {
        const page = await browser.newPage();
        await page.setViewport({ width, height, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.goto(base, { waitUntil: 'load' });
        await page.waitForSelector('#dropdn .dropdownOptions');
        const measure = async () => page.evaluate(() => {
            const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { l:r.left, r:r.right, t:r.top, b:r.bottom, w:r.width, h:r.height }; };
            return { selector: rect('#drop'), play: rect('#playbutton'), user: rect('#userbox'), bar: rect('#gameSelection'), tabs: rect('.gameTabs'), screen: innerWidth };
        });
        const box = await measure();
        for (const name of ['selector', 'play', 'user']) {
            const r = box[name];
            assert.ok(r.w >= 44 && r.h >= 40 && r.l >= 0 && r.r <= width + 1 && r.b <= height + 1, `${width}: ${name} fits viewport: ${JSON.stringify(r)}`);
        }
        assert.ok(box.selector.r <= box.play.l + 1, `${width}: selector and play do not overlap`);
        await page.tap('#drop');
        await page.waitForFunction(() => getComputedStyle(document.querySelector('#dropdn')).visibility === 'visible');
        await page.tap('#dropdn .dropdownOptions:not(.disabled)');
        await page.waitForFunction(() => getComputedStyle(document.querySelector('#dropdn')).visibility === 'hidden');
        await page.tap('#userbox');
        assert.ok(await page.$eval('#userbox', n => n.classList.contains('usernameEditing')), `${width}: username editable`);
        await page.keyboard.press('Escape');
        await page.$eval('#header12', n => n.scrollIntoView({block: 'nearest', inline: 'center'}));
        await page.tap('#header12');
        await page.waitForFunction(() => getComputedStyle(document.querySelector('#downloads')).display !== 'none');
        await page.$eval('#gtabs6', n => n.scrollIntoView({block: 'nearest'}));
        await page.tap('#gtabs6');
        await page.waitForFunction(() => getComputedStyle(document.querySelector('#settings')).display !== 'none');
        assert.deepEqual(errors, [], `${width}: no page exceptions`);
        await page.close();
        console.log(`Mobile layout and touch navigation passed: ${width}x${height}`);
    }
} finally {
    if (browser) await browser.close();
    server.kill();
}
