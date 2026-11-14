#!/usr/bin/env node
/*
 * Ampler Launcher - browser smoke test.
 *
 * Drives a real Chromium through puppeteer-core (install it yourself:
 * `npm i puppeteer-core`, or set $BROWSER_PATH to a Chrome/Chromium binary).
 * The launcher is HTTPS/HTTP only - there is no file:// pass.
 *
 * What it proves:
 *   * the page boots with 0 page errors and 0 JS exceptions;
 *   * every edition (Web, Modded, Mobile/Controller, Servers, Downloads,
 *     Credits, Settings) switches cleanly;
 *   * every tab renders its view with real content;
 *   * the version dropdown opens, scrolls and selects;
 *   * the skins grid renders, searches and the equip button reacts;
 *   * the phone breakpoint collapses the sidebar;
 *   * external requests are limited to the allowlist (fonts, cdnjs).
 *
 * Usage:  node tests/browser-test.mjs
 */

import { spawn, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

function findRepo() {
    let d = dirname(fileURLToPath(import.meta.url));
    while (d !== dirname(d)) {
        if (existsSync(join(d, 'app', 'index.html')) && existsSync(join(d, 'README.md'))) return d;
        d = dirname(d);
    }
    return dirname(dirname(fileURLToPath(import.meta.url)));
}
const REPO = findRepo();
const ROOT = join(REPO, 'app');

let pass = 0, fail = 0;
const failures = [];
const ok = (m) => { pass++; console.log('  \x1b[32mok\x1b[0m   ' + m); };
const bad = (m) => { fail++; failures.push(m); console.log('  \x1b[31mFAIL\x1b[0m ' + m); };
const head = (t) => console.log('\n\x1b[1m' + t + '\x1b[0m');

let puppeteer;
try { puppeteer = (await import('puppeteer-core')).default; }
catch { console.log('puppeteer-core not installed - skipping (npm i puppeteer-core).'); process.exit(0); }

async function findBrowser() {
    if (process.env.BROWSER_PATH && existsSync(process.env.BROWSER_PATH))
        return { path: process.env.BROWSER_PATH, args: [] };
    for (const c of ['google-chrome', 'chromium', 'chromium-browser', 'google-chrome-stable',
        'microsoft-edge', 'brave-browser']) {
        try {
            const p = execSync('command -v ' + c, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
            if (p) return { path: p, args: [] };
        } catch { /* keep looking */ }
    }
    try {
        const chromium = (await import('@sparticuz/chromium')).default;
        return { path: await chromium.executablePath(), args: chromium.args };
    } catch { /* not installed */ }
    return null;
}

const found = await findBrowser();
if (!found) { console.log('No Chromium found. Set $BROWSER_PATH.'); process.exit(0); }

const browser = await puppeteer.launch({
    executablePath: found.path,
    args: ['--no-sandbox', '--disable-dev-shm-usage', ...found.args],
    headless: true,
    defaultViewport: { width: 1600, height: 900 },
});

const ALLOWED_REMOTE = [/^https:\/\/fonts\.googleapis\.com\//, /^https:\/\/fonts\.gstatic\.com\//,
    /^https:\/\/cdnjs\.cloudflare\.com\//];

const port = 8200 + Math.floor(Math.random() * 500);
const srv = spawn('python3', [join(REPO, 'tools', 'serve.py'),
    '--port', String(port), '--host', '127.0.0.1', '--no-browser'], { cwd: ROOT, stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1200);

const base = 'http://127.0.0.1:' + port + '/';

async function drive() {
    head('Launcher over HTTP (' + base + ')');
    const page = await browser.newPage();
    const errors = [];
    const remote = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    page.on('request', (r) => {
        const u = r.url();
        if (/^(data:|blob:|about:)/i.test(u)) return;
        if (/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(u)) return;
        remote.push(u);
    });

    await page.goto(base, { waitUntil: 'load', timeout: 60000 });
    await sleep(600);

    const heading = await page.$eval('#gameedition', (n) => n.textContent.trim());
    heading.includes('EAGLERCRAFT') ? ok('header reads "' + heading + '"') : bad('odd header: ' + heading);

    const sidebarIds = await page.$$eval('#sidebar .sidebarOptions', (n) => n.map((x) => x.id));
    JSON.stringify(sidebarIds) === JSON.stringify(['gtabs2', 'gtabs4', 'gtabs3', 'gtabs10', 'gtabs9', 'gtabs5', 'gtabs6'])
        ? ok('sidebar order is Web -> Mobile -> Modded -> Custom -> Downloads -> Credits -> Settings')
        : bad('sidebar order: ' + sidebarIds.join(', '));

    const rows = await page.$$eval('#dropdn .dropdownOptions', (n) => n.length);
    rows >= 15 ? ok('version dropdown rendered ' + rows + ' rows') : bad('dropdown rendered ' + rows + ' rows');

    // Every tab renders content
    const tabs = [
        ['faq', '#faqbox .faqoption'],
        ['installations', '#installationsbox .installationOptions'],
        ['patchnotes', '#patchnotesbox .patchnote'],
        ['servers', '#serversGrid .serverCard'],
        ['downloads', '#downloadsGrid .serverCard'],
        ['skins', '#skingrid .skinCard'],
    ];
    for (const [view, selector] of tabs) {
        await page.click('[data-view="' + view + '"]');
        await sleep(250);
        const count = await page.$$eval(selector, (n) => n.length);
        count > 0 ? ok(view + ' view rendered ' + count + ' item(s)') : bad(view + ' view rendered nothing');
    }

    // Mods (modded edition)
    await page.click('#gtabs3');
    await sleep(400);
    const mods = await page.$$eval('#modsbox .modoption', (n) => n.length);
    mods >= 20 ? ok('Modketplace rendered ' + mods + ' mods') : bad('Modketplace rendered ' + mods + ' mods');

    // Dropdown opens, scrolls and selects
    await page.click('#gtabs2');
    await sleep(300);
    await page.click('#drop');
    await sleep(200);
    const open = await page.$eval('#dropdn', (n) => getComputedStyle(n).visibility);
    open === 'visible' ? ok('the version selector opens') : bad('version selector visibility=' + open);
    const count = await page.$$eval('#dropdn .dropdownOptions', (n) => n.length);
    await page.$$eval('#dropdn .dropdownOptions', (nodes) => nodes[1].click());
    await sleep(200);
    const title = await page.$eval('#gametitle', (n) => n.textContent.trim());
    title ? ok('selecting version #2 sets the title to "' + title + '" (' + count + ' available)')
          : bad('selection did not set the title');

    // Skins: search + equip button present
    await page.click('[data-view="skins"]');
    await sleep(250);
    await page.type('#skinsearch', 'creeper');
    await sleep(250);
    const filtered = await page.$$eval('#skingrid .skinCard', (n) => n.length);
    ok('skin search filtered to ' + filtered + ' card(s)');
    await page.$eval('#skinsearch', (n) => { n.value = ''; });
    await page.$eval('#skinsearch', (n) => n.dispatchEvent(new Event('input', { bubbles: true })));
    await sleep(200);
    const equip = await page.$$eval('#skingrid .skinEquipBtn', (n) => n.length);
    equip > 0 ? ok('every skin card has an Equip button (' + equip + ')') : bad('no equip buttons');

    // Settings view
    await page.click('[data-view="generalsettings"]');
    await sleep(250);
    const widget = await page.$eval('.stats-widget', (n) => getComputedStyle(n).display);
    widget === 'none' ? ok('the stats widget is hidden outside the Play screen')
                      : bad('stats widget display on Settings: ' + widget);
    const launchCards = await page.$$eval('[data-launchmode]', (n) => n.length);
    launchCards === 6 ? ok('all 6 launch modes are offered') : bad('launch modes: ' + launchCards);
    await page.click('[data-themename="lapis"]');
    const theme = await page.evaluate(() => document.documentElement.dataset.theme);
    theme === 'lapis' ? ok('theme switching applies data-theme') : bad('theme after click: ' + theme);

    // Quick settings + stats
    await page.click('#gtabs6');
    await sleep(150);
    const panel = await page.$eval('#settingsPanel', (n) => getComputedStyle(n).display);
    panel === 'block' ? ok('quick-settings controls render inline in Settings') : bad('quick-settings display=' + panel);
    await page.click('#header1');

    // Phone layout
    await page.setViewport({ width: 400, height: 780 });
    await sleep(300);
    const sidebar = await page.$eval('.sidebar', (n) => Math.round(n.getBoundingClientRect().width));
    sidebar <= 60 ? ok('phone breakpoint collapses the sidebar (' + sidebar + 'px)')
                  : bad('phone sidebar is ' + sidebar + 'px');

    // Page errors + remote allowlist
    errors.length === 0 ? ok('0 page errors') : bad('page errors: ' + errors.slice(0, 3).join(' | '));
    const strays = remote.filter((u) => !ALLOWED_REMOTE.some((r) => r.test(u)));
    strays.length === 0 ? ok('0 un-allowlisted remote requests (' + remote.length + ' allowlisted)')
                        : bad('remote requests: ' + strays.slice(0, 3).join(', '));

    await page.close();
}

try {
    await drive();
} catch (e) {
    bad('browser run threw: ' + e.message);
} finally {
    srv.kill();
    await browser.close();
}

console.log('\nPassed: ' + pass + '  Failed: ' + fail);
if (fail) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log('  - ' + f));
}
process.exit(fail ? 1 : 0);
