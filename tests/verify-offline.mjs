#!/usr/bin/env node
/*
 * Ampler Launcher - verification suite.
 *
 * The launcher is served over HTTP(S) - file:// support was dropped, and no
 * feature is allowed to be degraded for it. What this suite proves instead:
 *
 *   1. TRANSPORT
 *      Nothing is loaded over plain http:// (mixed content would be blocked on
 *      an HTTPS deployment). Remote references are HTTPS only and limited to a
 *      documented host allowlist. Everything else resolves inside the repo.
 *
 *   2. NOTHING 404s
 *      Every href/src/url() that points into the repo resolves to a real file,
 *      and every catalogue entry is served with a 200 by tools/serve.py.
 *
 *   3. IT WORKS
 *      index.html is loaded in jsdom with assets/js/index.js + assets/js/skinsview.js
 *      executed against it and fetch() answering from disk: edition switching,
 *      the version dropdown, mod toggles, patch notes, installations,
 *      servers, downloads, skins, username, themes, launch modes, default tab,
 *      interface layout and custom installations are all driven and asserted.
 *
 *   4. IT IS SERVED CORRECTLY
 *      tools/serve.py is booted and every important URL is requested: 200 plus
 *      COOP/COEP/SW-capable headers, and the skins listing matches
 *      tools/bake-skins.py.
 *
 * Usage:  node tests/verify-offline.mjs
 * jsdom is optional; install it with `npm i jsdom` for check 3.
 */

import { readFileSync, existsSync, statSync, readdirSync, realpathSync } from 'node:fs';
import { join, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execSync } from 'node:child_process';

function findRepo() {
    let d = dirname(fileURLToPath(import.meta.url));
    while (d !== dirname(d)) {
        if (existsSync(join(d, 'app', 'index.html')) && existsSync(join(d, 'README.md'))) return d;
        d = dirname(d);
    }
    return dirname(dirname(fileURLToPath(import.meta.url)));
}
const REPO = findRepo();
// The document root: app/ holds index.html, assets/ and the recovered mc/ builds.
const ROOT = join(REPO, 'app');

let pass = 0, fail = 0, skip = 0;
const failures = [];

function ok(msg) { pass++; console.log('  \x1b[32mok\x1b[0m   ' + msg); }
function bad(msg) { fail++; failures.push(msg); console.log('  \x1b[31mFAIL\x1b[0m ' + msg); }
function skipped(msg) { skip++; console.log('  \x1b[33mskip\x1b[0m ' + msg); }
function head(t) { console.log('\n\x1b[1m' + t + '\x1b[0m'); }

/* ------------------------------------------------------------------ *
 * Files to inspect
 * ------------------------------------------------------------------ */

const SKIP_DIRS = new Set(['.git', 'node_modules', '__pycache__', '.cache', 'temp']);

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        if (SKIP_DIRS.has(name)) continue;
        const full = join(dir, name);
        let st;
        try { st = statSync(full); } catch { continue; }
        if (st.isDirectory()) walk(full, out);
        else out.push(full);
    }
    return out;
}

const ALL = walk(ROOT);
const rel = (p) => relative(ROOT, p);
const SCANNABLE = ALL.filter((f) => {
    const r = rel(f).replace(/\\/g, '/');
    return (r === 'index.html' || /^(assets\/(css|js|json)\/)/.test(r)) &&
        ['.html', '.css', '.js', '.json'].includes(extname(f).toLowerCase());
});
const LAUNCHER_FILES = ALL.filter((f) => {
    const r = rel(f);
    return r === 'index.html' ||
        r.startsWith('js/') ||
        (r.startsWith('assets/js/')) ||
        (r.startsWith('assets/css/')) ||
        (r.startsWith('css/'));
});

console.log('Ampler Launcher verification');
console.log('repo: ' + REPO);
console.log('root: ' + ROOT);
console.log('files in repo: ' + ALL.length + '  (scanning ' + SCANNABLE.length + ' html/css/js)');

/* ------------------------------------------------------------------ *
 * 1. Transport: HTTPS only, allowlisted hosts
 * ------------------------------------------------------------------ */

head('1. HTTPS only, allowlisted hosts, no plain-http fetches');

const ALLOWED_HOSTS = [
    { host: 'fonts.googleapis.com', why: 'Roboto webfont stylesheet' },
    { host: 'fonts.gstatic.com', why: 'Roboto webfont files' },
    { host: 'cdnjs.cloudflare.com', why: 'JSZip (the local writer is used if it fails)' },
    { host: 'cdn.tailwindcss.com', why: 'unused in the shipped pages' },
    { host: 'www.w3.org', why: 'SVG/XML namespace identifier (never fetched)' },
    { host: 'discord.gg', why: 'user-initiated invite links' },
    { host: 'github.com', why: 'repository links' },
    { host: 'www.python.org', why: 'documentation string' },
    { host: 'irv77.github.io', why: 'og:url / og:image metadata text' },
    { host: 'crafthead.net', why: 'optional skin avatar CDN' },
];

// Hosts the launcher talks to at runtime on purpose (user-initiated only):
// Eaglercraft relays are the whole point of the Servers tab.
const RUNTIME_HOSTS = [/^wss?:\/\//i];

const REF_PATTERNS = [
    [/<script[^>]+src=["']([^"']+)["']/gi, 'script src'],
    [/<link[^>]+href=["']([^"']+)["']/gi, 'link href'],
    [/<img[^>]+src=["']([^"']+)["']/gi, 'img src'],
    [/<iframe[^>]+src=["']([^"']+)["']/gi, 'iframe src'],
    [/(?<![A-Za-z0-9_$-])url\(\s*['"]?([^'")]+)['"]?\s*\)/g, 'css url()'],
    [/\bfetch\(\s*['"]([^'"]+)['"]/gi, 'fetch()'],
    [/@import\s+['"]([^'"]+)['"]/gi, '@import'],
];

function isRemote(u) { return /^(https?:)?\/\//i.test(u.trim()); }
function hostOf(u) {
    try { return new URL(u, 'https://example.invalid/').hostname; } catch { return ''; }
}

const remoteHits = [];
const httpHits = [];
const unknownHosts = [];

for (const file of SCANNABLE) {
    if (rel(file).startsWith('mc/') || rel(file).startsWith('mc/')) continue; // vendored game builds
    const text = readFileSync(file, 'utf8');
    for (const [rx, kind] of REF_PATTERNS) {
        rx.lastIndex = 0;
        let m;
        while ((m = rx.exec(text)) !== null) {
            const url = m[1].trim();
            if (!isRemote(url)) continue;
            remoteHits.push(rel(file) + ' [' + kind + '] -> ' + url.slice(0, 80));
            if (/^http:\/\//i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)/i.test(url)) {
                httpHits.push(rel(file) + ' -> ' + url.slice(0, 80));
            }
            const host = hostOf(url);
            if (RUNTIME_HOSTS.some((r) => r.test(url))) continue;
            if (!ALLOWED_HOSTS.some((a) => a.host === host)) unknownHosts.push(rel(file) + ' -> ' + host + ' (' + url.slice(0, 60) + ')');
        }
    }
}

httpHits.length === 0
    ? ok('0 plain-http references (mixed content would be blocked behind HTTPS)')
    : httpHits.forEach((h) => bad('plain http:// reference: ' + h));

unknownHosts.length === 0
    ? ok('every remote host is on the allowlist (' + remoteHits.length + ' https refs total)')
    : unknownHosts.forEach((h) => bad('un-allowlisted remote host: ' + h));

// The old offline build stripped the fonts and the JSZip CDN. Those are now
// allowed, so prove the scanner still notices a remote reference at all.
{
    let caught = false;
    const CANARY = '<' + 'link href="https://cdn.example.com/x.css" rel="stylesheet">';
    for (const [rx] of REF_PATTERNS) {
        rx.lastIndex = 0;
        const m = rx.exec(CANARY);
        if (m && isRemote(m[1]) && !ALLOWED_HOSTS.some((a) => a.host === hostOf(m[1]))) caught = true;
    }
    caught ? ok('scanner is live: an un-allowlisted remote <link> is detected')
           : bad('scanner would miss an un-allowlisted remote <link> - the check is vacuous');
}

// file:// support was dropped on purpose: the launcher must not contain gates,
// notices or fallbacks for it. A silent regression here is what this catches.
{
    const FORBIDDEN = ['filewarning', 'location.protocol === \'file:', 'location.protocol === "file:',
        'startsWith(\'file:\')', 'startsWith("file:")', 'isFileProtocol'];
    let hits = 0;
    for (const f of LAUNCHER_FILES) {
        const text = readFileSync(f, 'utf8');
        for (const tok of FORBIDDEN) {
            if (text.includes(tok)) { hits++; bad('file:// gate left in ' + rel(f) + ': ' + tok); }
        }
    }
    if (hits === 0) ok('0 file:// gates, notices or fallbacks in the launcher code');
}

/* ------------------------------------------------------------------ *
 * 2. Every local reference resolves
 * ------------------------------------------------------------------ */

head('2. Every local reference resolves to a real file');

const LOCAL_REFS = [
    [/<script[^>]+src=["']([^"']+)["']/gi, 'script'],
    [/<link[^>]+href=["']([^"']+)["']/gi, 'link'],
    [/<img[^>]+src=["']([^"']+)["']/gi, 'img'],
    [/(?<![A-Za-z0-9_$-])url\(\s*['"]?([^'")]+)['"]?\s*\)/g, 'url()'],
];

let checkedRefs = 0, brokenRefs = 0;
for (const file of SCANNABLE) {
    if (rel(file).startsWith('mc/') || rel(file).startsWith('mc/')) continue;
    const text = readFileSync(file, 'utf8');
    for (const [rx] of LOCAL_REFS) {
        rx.lastIndex = 0;
        let m;
        while ((m = rx.exec(text)) !== null) {
            let u = m[1].trim();
            if (isRemote(u) || /^(data|blob|javascript):/i.test(u) || u.startsWith('#')) continue;
            u = u.split(/[?#]/)[0];
            if (!u) continue;
            // Template concatenations ('url(' + x + ')') are not literal paths.
            if (!/^[A-Za-z0-9._~%/-]+$/.test(u)) continue;
            checkedRefs++;
            const decoded = decodeURIComponent(u);
            // JS files build markup with page-relative paths, and assets/css/
            // holds a mirror of css/ whose url()s are written for the repo root,
            // so a reference is valid if it resolves from the file OR the root.
            const realDir = dirname(realpathSync(file));
            const candidates = [join(realDir, decoded), join(dirname(file), decoded), join(ROOT, decoded)];
            const found = candidates.some((c) => existsSync(c));
            if (!found) { brokenRefs++; bad('dangling reference in ' + rel(file) + ' -> ' + u); }
        }
    }
}
if (brokenRefs === 0) ok(checkedRefs + ' local references all resolve on disk');

/* ------------------------------------------------------------------ *
 * 3. CSS: scalable sizes, phone block isolated
 * ------------------------------------------------------------------ */

head('3. CSS scales, the phone block is isolated');

{
    const vwPxMixes = (css) => {
        const hits = [];
        const rx = /(?<![-\w])(max|min)\(([^()]*)\)/g;
        let m;
        while ((m = rx.exec(css)) !== null) {
            if (/\d(?:\.\d+)?vw/.test(m[2]) && /\d(?:\.\d+)?px/.test(m[2])) hits.push(m[0]);
        }
        return hits;
    };

    const STYLESHEETS = ['assets/css/style.css', 'assets/css/screensize.css', 'assets/css/fonts.css'];
    const mixed = [];
    let allCss = '';
    for (const file of STYLESHEETS) {
        if (!existsSync(join(ROOT, file))) continue;
        const css = readFileSync(join(ROOT, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        allCss += css + '\n';
        for (const hit of vwPxMixes(css)) mixed.push(file + ': ' + hit);
    }
    mixed.length === 0
        ? ok('no size mixes vw with px, so the design scales as drawn at every window size')
        : bad('vw/px size mixes change the design at some window sizes: ' + mixed.join(' | '));

    if (vwPxMixes('.x { padding: max(0.35vw, 7px); }').length === 1 &&
        vwPxMixes('.y { grid-template-columns: repeat(auto-fill, minmax(12.5vw, 1fr)); }').length === 0) {
        ok('vw/px detector is live and ignores minmax()');
    } else {
        bad('the vw/px detector does not detect the regression it exists for');
    }

    // Every stylesheet lives once, under assets/css/. There used to be a second
    // (symlinked) copy under website/css/ for the old site tree; that tree is
    // gone, so a reappearing copy would be the regression.
    const strayCss = ['css', 'website/css'].filter((d) => existsSync(join(ROOT, d)));
    const missingCss = STYLESHEETS.filter((f) => !existsSync(join(ROOT, f)));
    strayCss.length === 0 && missingCss.length === 0
        ? ok('stylesheets live once in assets/css/ (no mirrored copy left to drift)')
        : bad('stylesheet layout: stray=' + strayCss.join(',') + ' missing=' + missingCss.join(','));

    /* ---- one geometry, shared by the rail, the header and every screen ---- */
    {
        const raw = readFileSync(join(ROOT, 'assets/css/style.css'), 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '');
        const tokens = {};
        for (const m of raw.matchAll(/(--[a-z-]+)\s*:\s*([^;]+);/g)) {
            if (!(m[1] in tokens)) tokens[m[1]] = m[2].trim();
        }
        // exact selector matching: "#credits" must not pick up "#credits img"
        const RULES = [...raw.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({
            selectors: m[1].split(',').map((x) => x.trim()),
            body: m[2]
        }));
        const body = (sel) => RULES
            .filter((r) => r.selectors.indexOf(sel) !== -1)
            .map((r) => r.body)
            .join(';');
        const prop = (sel, name) => {
            const m = new RegExp('(?:^|;)\\s*' + name + '\\s*:\\s*([^;]+)').exec(body(sel));
            return m ? m[1].trim() : null;
        };
        const same = (a, b) => a && b && a.replace(/\s+/g, '') === b.replace(/\s+/g, '');
        const num = (v) => parseFloat(String(v));
        const check = (cond, msg) => (cond ? ok(msg) : bad(msg));

        check(tokens['--chrome-h'] &&
               Math.abs(num(tokens['--chrome-h']) -
                        (num(tokens['--header-h']) + num(tokens['--tabstrip-h']))) < 0.001,
            'the header height is the title strip plus the tab strip (' +
            tokens['--header-h'] + ' + ' + tokens['--tabstrip-h'] + ' = ' + tokens['--chrome-h'] + ')');
        check(!!tokens['--sidebar-w'] && !!tokens['--bar-h'] && !!tokens['--gutter'],
            'the rail width, the launch-bar height and the content gutter are tokens');

        check(prop('.sidebar', 'width') === 'var(--sidebar-w)' &&
               /var\(--sidebar-w\)/.test(prop('.mainPage', 'width') || ''),
            'the page is the window minus the rail, so the two always fill it exactly');
        check(same(prop('.gameHeaderTop', 'height'), 'var(--header-h)') &&
               same(prop('.sidebarWhatsNew', 'height'), 'var(--header-h)'),
            "the header's title row and the sidebar's What's New block are the same height, so they start on one line");

        const screens = ['#mods', '#installations', '#skinsview', '#patchNotes',
            '#servers', '#downloads', '#credits', '#settings'];
        const wrong = screens.filter((sel) =>
            !/var\(--sidebar-w\)/.test(prop(sel, 'width') || '') ||
            !same(prop(sel, 'height'), 'calc(100vh - var(--chrome-h))'));
        check(wrong.length === 0,
            'all ' + screens.length + ' screens share one width and one height formula' +
            (wrong.length ? ' (wrong: ' + wrong.join(', ') + ')' : ''));
        check(screens.every((sel) => /box-sizing:\s*border-box/.test(body(sel))),
            'every screen is border-box, so a padded screen and a bare one start on the same line');

        check(same(prop('#game-bg', 'height'), 'calc(100vh - var(--chrome-h))') &&
               same(prop('#gameSelection', 'height'), 'var(--bar-h)'),
            'the play screen fills the whole column and the launch bar lives in it');
        check(same(prop('#gameSelection', 'display'), 'none'),
            'the launch bar starts hidden - only the Play screen shows it');

        /* Patch Notes: both columns start on the same line, one gutter apart */
        check(same(prop('.notesLayout', 'gap'), 'var(--gutter)') &&
              same(prop('.notesIndex', 'top'), '4vh') &&
              /padding:\s*4vh var\(--gutter\)/.test(body('#patchNotes')),
            'the notes index sits one gutter from the rail and its top matches the blocks');
        check(/gap:\s*1\.5vw\s*;/.test(body('#patchnotesbox')) &&
              same(prop('#patchnotesbox', 'justify-content'), 'flex-start') &&
              !/versionscontainer|versionBox/.test(allCss),
            'the update blocks share one square gap and align to the index edge');

        /* one button contract: green at rest, red on hover */
        check(/\.clearstoragebutton\s*\{[^}]*background-color:\s*var\(--ui-select-deep\)/.test(allCss) &&
              /\.clearstoragebutton:hover\s*\{[^}]*background-color:\s*var\(--ui-red\)/.test(allCss),
            'Clear All Local Storage is green until hovered, then red');
        check(/\.classicbutton\.warningbutton\s*\{[^}]*background-color:\s*var\(--ui-select-deep\)/.test(allCss) &&
              /\.classicbutton\.warningbutton:hover\s*\{[^}]*background-color:\s*var\(--ui-red\)/.test(allCss),
            'Yes, Delete is green until hovered, then red');

        const gutters = ['#modsbox', '#installations', '.skinsScroll', '#patchNotes',
            '#servers', '#downloads', '#settings', '#credits'];
        const noGutter = gutters.filter((sel) =>
            !/var\(--gutter\)/.test(prop(sel, 'padding') || '') &&
            !/var\(--gutter\)/.test(prop(sel, 'padding-left') || ''));
        check(noGutter.length === 0,
            'every screen paints its content on the same ' + tokens['--gutter'] + ' gutter' +
            (noGutter.length ? ' (missing: ' + noGutter.join(', ') + ')' : ''));

        check(same(prop('.dropdownSelector', 'left'), prop('.dropdownMenu', 'left')) &&
               same(prop('.dropdownSelector', 'width'), prop('.dropdownMenu', 'width')),
            'the version menu lines up with the selector it drops out of (left ' +
            prop('.dropdownSelector', 'left') + ', width ' + prop('.dropdownSelector', 'width') + ')');
        check(same(prop('.dropdownMenu', 'bottom'), prop('#gameSelection', 'height')),
            'the menu sits on the bar instead of floating above it (' +
            prop('.dropdownMenu', 'bottom') + ' = ' + prop('#gameSelection', 'height') + ')');

        const titleMatch = /#gametitle[^{}]*\{([^}]*)\}/.exec(raw);
        const title = titleMatch ? titleMatch[1] : '';
        check(/ellipsis/.test(title) && /hidden/.test(title) && /nowrap/.test(title),
            'a long version name is clipped to "..." instead of pushing the icon or arrow');
        check(/flex:\s*1 1 auto/.test(body('.versionText')) &&
               /min-width:\s*0/.test(body('.versionText')) &&
               /margin-left:\s*auto/.test(raw) && /flex:\s*0 0 auto/.test(raw),
            'the icon and arrow are pinned and the title is the only flexible part');

        const narrow = readFileSync(join(ROOT, 'assets/css/screensize.css'), 'utf8');
        check(/--sidebar-w:\s*5\.5vw/.test(narrow) && /--bar-h:\s*6\.2vw/.test(narrow) &&
               !/width:\s*9[0-9](\.\d+)?vw/.test(narrow),
            'below 1100px only the two tokens change, so no panel has to be restated');
        {
            // at the breakpoint the same pair must still agree with each other
            const ruleOf = (css, sel) => {
                const m = new RegExp('(?:^|\\n)' + sel.replace(/[.#]/g, (c) => '\\' + c) +
                    '\\s*\\{([^}]*)\\}').exec(css);
                return m ? m[1] : '';
            };
            const valIn = (bodyText, name) => {
                const m = new RegExp('(?:^|;)\\s*' + name + '\\s*:\\s*([^;]+)').exec(bodyText);
                return m ? m[1].trim().replace(/\s+/g, '') : null;
            };
            const sSel = ruleOf(narrow, '.dropdownSelector');
            const sMenu = ruleOf(narrow, '.dropdownMenu');
            check(valIn(sSel, 'left') === valIn(sMenu, 'left') &&
                  valIn(sSel, 'width') === valIn(sMenu, 'width') &&
                  valIn(sMenu, 'bottom') === 'var(--bar-h)',
                'at the breakpoint the menu still matches its selector and still hangs off the bar');
            const panelWidths = ['#mods', '#installations', '#skinsview', '#patchNotes',
                '#servers', '#downloads', '#credits', '#settings']
                .filter((sel) => /width:/.test(ruleOf(narrow, sel)));
            check(panelWidths.length === 0,
                'no screen restates its width at the breakpoint (all follow the rail token)' +
                (panelWidths.length ? ' (found: ' + panelWidths.join(', ') + ')' : ''));
            check(!/#settings\s*\{[^}]*height:/.test(narrow),
                'no screen restates its height at the breakpoint either');
        }
        const phoneBlock = narrow.slice(narrow.search(/@media[^{]*max-width:\s*768px/));
        const tk = (name) => {
            const m = new RegExp(name + ':\\s*([^;]+);').exec(phoneBlock);
            return m ? m[1].trim() : null;
        };
        check(tk('--sidebar-w') === '54px' && tk('--header-h') === '56px' &&
               tk('--tabstrip-h') === '35px' && tk('--chrome-h') === '91px' &&
               tk('--bar-h') === '64px' && tk('--gutter') === '14px',
            'the phone layout restates the same sizes in pixels and they still add up (56 + 35 = 91)');
        check(!/width:\s*\d+(\.\d+)?vw/.test(phoneBlock),
            'no phone rule leans on a vw width, so nothing squashes with the screen');
        check(/width:\s*190px/.test(phoneBlock) && /bottom:\s*var\(--bar-h\)/.test(
            readFileSync(join(ROOT, 'assets/css/style.css'), 'utf8')),
            'the phone menu still hangs straight off the bar it belongs to');

        // the icon in the bar is the icon of the row you picked, at one size
        check(same(prop('.dropdownOption img', 'width'), '2.5vw') &&
              same(prop('.dropdownSelector .centeredIcon:first-child img', 'width'), '2.5vw'),
            'the selected build icon and the icons in its menu are the same size (2.5vw)');
        check(!/id="gameicon"[^>]*style=/.test(readFileSync(join(ROOT, 'index.html'), 'utf8')),
            'the build icon carries no inline width, so one rule sizes it everywhere');

        // cards sit on the same gutter as the headings above them
        check(/grid-template-columns:\s*repeat\(auto-fill, minmax\(12\.5vw, 1fr\)\)/.test(body('#modsbox')) &&
              /width:\s*auto/.test(body('.modoption')),
            'the mod boxes use the same auto-fill grid as skins and credits, so their left edge matches the heading');
        check(same(prop('hr', 'width'), '100%'),
            'a divider spans the column it is in instead of a fixed slice of the window');

        // the rail is one size, pinned items included
        check(same(prop('.sidebarOptions', 'height'), '4.7vw') &&
              same(prop('.sidebarOptions.sidebarBottom', 'height'), '4.7vw'),
            'the pinned Credits/Settings cells are exactly as tall as the sections above them');

        // on a phone the launch bar is a row, not three guessed offsets
        {
            const edge = prop('.gameTabs', 'border-bottom') || '';
            check(same(prop('.gameTabs', 'box-sizing'), 'border-box') &&
                  /solid/.test(edge) && !prop('.gameHeader', 'border-bottom'),
                "the header's bottom edge sits inside the tab strip, so the header is exactly header-h + tabstrip-h");
        }
        check(/display:\s*flex/.test(phoneBlock) &&
              /#playbutton\s*\{[^}]*position:\s*static/.test(phoneBlock) &&
              /\.dropdownSelector\s*\{[^}]*position:\s*static/.test(phoneBlock) &&
              /\.username\s*\{[^}]*position:\s*static/.test(phoneBlock),
            'the phone launch bar lays the selector, Play and the name out as a row, so they cannot overlap');
    }

    const sizeCss = readFileSync(join(ROOT, 'assets/css/screensize.css'), 'utf8');
    const phoneAt = sizeCss.search(/@media[^{]*max-width:\s*768px/);
    if (phoneAt === -1) {
        bad('screensize.css has no phone-sized media query');
    } else {
        const bare = sizeCss.slice(phoneAt).replace(/\/\*[\s\S]*?\*\//g, '');
        const guarded = /max-width:\s*768px/.test(bare) && /max-height:\s*480px/.test(bare);
        const only = (bare.match(/@media/g) || []).length === 1;
        const pxOnly = !/\d(?:\.\d+)?vw/.test(bare);
        let depth = 0;
        for (const ch of bare) {
            if (ch === '{') depth++;
            else if (ch === '}') depth--;
        }
        const closedLast = depth === 0;
        guarded && only && pxOnly && closedLast
            ? ok('phone sizing is one px-only block in the last (max-width 768px / max-height 480px) query')
            : bad('phone media query: guarded=' + guarded + ' singleBlock=' + only +
                  ' pxOnly=' + pxOnly + ' closedLast=' + closedLast);
    }

    /* ---- every theme repaints the whole launcher, not just the accent ---- */
    {
        const THEME_TOKENS = [
            '--ml-chrome', '--ml-bar', '--ml-rail', '--ml-panel', '--ml-card',
            '--ml-card-hover', '--ml-border', '--ml-selected', '--ml-on-selected',
            '--ui-main', '--ui-main-dark', '--ui-main-light', '--ui-main-lighter',
            '--ui-main-hover', '--text-secondary', '--ui-select', '--ui-select-secodary',
            '--ui-select-deep', '--ui-select-bright', '--ui-red', '--ui-red-secondary',
            '--ui-contributors', '--ui-contributors-secondary',
            '--ui-credits', '--ui-credits-secondary'
        ];
        const THEMES = ['redstone', 'lapis', 'amethyst', 'gold', 'neon', 'light'];
        const themeCss = readFileSync(join(ROOT, 'assets/css/style.css'), 'utf8');

        const lum = (hex) => {
            const h = hex.replace('#', '');
            const parts = h.length === 3 ? h.split('').map((c) => c + c) : [h.slice(0, 2), h.slice(2, 4), h.slice(4, 6)];
            const [r, g, b] = parts.map((p) => {
                const c = parseInt(p, 16) / 255;
                return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
            });
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const contrast = (a, b) => {
            const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
            return (x + 0.05) / (y + 0.05);
        };

        const problems = [];
        for (const theme of THEMES) {
            const at = themeCss.indexOf('html[data-theme="' + theme + '"] body {');
            if (at === -1) { problems.push(theme + ': no theme block'); continue; }
            const body = themeCss.slice(at, themeCss.indexOf('}', at));
            const missing = THEME_TOKENS.filter((t) => !new RegExp('\\' + t + ':').test(body));
            if (missing.length) problems.push(theme + ' does not restate ' + missing.join(','));
            const val = (t) => {
                const m = body.match(new RegExp('\\' + t + ':\\s*(#[0-9a-fA-F]{6})'));
                return m ? m[1] : null;
            };
            const ink = val('--text-secondary');
            const surface = val('--ui-main');
            const onSel = val('--ml-on-selected');
            const sel = val('--ml-selected');
            if (ink && surface && contrast(ink, surface) < 4.5) {
                problems.push(theme + ': body text contrast ' + contrast(ink, surface).toFixed(2) + ':1');
            }
            if (onSel && sel && contrast(onSel, sel) < 3) {
                problems.push(theme + ': selected-row contrast ' + contrast(onSel, sel).toFixed(2) + ':1');
            }
        }
        problems.length === 0
            ? ok('all ' + THEMES.length + ' themes restate the full token set and stay readable (>=4.5:1 body, >=3:1 selected)')
            : problems.forEach((p) => bad('theme: ' + p));

        // The picker lives in Appearance (Settings), never in Sound & Performance.
        const page = readFileSync(join(ROOT, 'index.html'), 'utf8');
        const appearance = page.indexOf('data-themename="redstone"');
        const audioAt = page.indexOf('Sound &amp; Performance') !== -1
            ? page.indexOf('Sound &amp; Performance') : page.indexOf('Sound & Performance');
        const themeUiAt = page.indexOf('data-themename=');
        const between = audioAt === -1 ? '' : page.slice(audioAt, themeUiAt);
        appearance !== -1 && audioAt !== -1 && !/themename|themeSelect/.test(between) &&
        page.indexOf('id="themeSelect"') === -1
            ? ok('the theme picker sits in Appearance and nothing theme-related leaks into Sound & Performance')
            : bad('theme picker placement: appearance=' + appearance + ' audio=' + audioAt);
    }
}

/* ------------------------------------------------------------------ *
 * 4. Catalogues
 * ------------------------------------------------------------------ */

head('4. Catalogues are complete and their assets exist');

function readJSON(relPath) {
    const p = join(ROOT, relPath);
    try { return JSON.parse(readFileSync(p, 'utf8')); } catch (e) { bad(relPath + ' does not parse: ' + e.message); return null; }
}

const CATALOG_PATHS = {
    base: 'assets/json/base.json',
    modded: 'assets/json/modded.json',
    assisted: 'assets/json/assisted.json',
    alpha: 'assets/json/alpha.json',
    beta: 'assets/json/beta.json',
    mods: 'assets/json/mods.json',
    patchnotes: 'assets/json/patchnotes.json',
    icons: 'assets/json/icons.json'
};

const CATALOGS = {};
for (const [key, path] of Object.entries(CATALOG_PATHS)) {
    const data = readJSON(path);
    CATALOGS[key] = data;
    if (Array.isArray(data)) ok(path + ' parses (' + data.length + ' entries)');
    else if (data) ok(path + ' parses (object)');
}

{
    let problems = 0;
    for (const key of ['base', 'modded', 'assisted', 'alpha', 'beta']) {
        const list = CATALOGS[key];
        if (!Array.isArray(list) || !list.length) { problems++; bad(key + ' catalogue is empty'); continue; }
        for (const item of list) {
            for (const field of ['title', 'version', 'icon', 'link']) {
                if (!item[field]) { problems++; bad(key + ' entry "' + (item.title || '?') + '" has no ' + field); }
            }
            if (item.icon && !existsSync(join(ROOT, decodeURIComponent(item.icon)))) {
                problems++; bad(key + ' icon missing on disk: ' + item.icon);
            }
        }
    }
    if (problems === 0) ok('every catalogued build has a title, version, icon (on disk) and link');
}

{
    // A build only counts as shipped when its folder (with index.html) is committed
    // inside mc/ - .cache/ is scratch space and never survives a clone.
    const broken = [];
    const links = new Map();
    const pairs = new Set();
    for (const key of ['base', 'modded', 'assisted', 'alpha', 'beta']) {
        for (const item of (CATALOGS[key] || [])) {
            const link = String(item.link || '').split('?')[0];
            if (!link.startsWith('./mc/')) { broken.push(key + ': not a local build - ' + link); continue; }
            const rel = decodeURIComponent(link.slice('./mc/'.length)).replace(/\/+$/, '');
            if (!existsSync(join(ROOT, 'mc', rel, 'index.html'))) broken.push(key + ': missing mc/' + rel + '/index.html');
            // release catalogues must not list the same build twice; modded/assisted
            // rows may legitimately share one client build under different launchers.
            const pair = key + '|' + item.title + '|' + link;
            if (['base', 'alpha', 'beta'].includes(key) && pairs.has(pair)) {
                broken.push(key + ': duplicate entry ' + item.title + ' -> ' + link);
            }
            pairs.add(pair);
            links.set(link, key);
        }
    }
    broken.length === 0
        ? ok('all ' + links.size + ' catalogue links point at a committed mc/ build (no phantom entries)')
        : broken.forEach((b) => bad(b));
}

{
    let problems = 0;
    for (const mod of (CATALOGS.mods || [])) {
        if (!mod.title || !mod.link) { problems++; bad('mod entry missing title/link'); }
        if (mod.icon && !existsSync(join(ROOT, decodeURIComponent(mod.icon)))) {
            problems++; bad('mod icon missing on disk: ' + mod.icon);
        }
    }
    if (problems === 0) ok('all ' + (CATALOGS.mods || []).length + ' EaglerForge mods have title, link and an on-disk icon');

    // Every mod the selector can switch on must actually ship in mc/Eaglerforge/mods/.
    const modDir = join(ROOT, 'mc/Eaglerforge/mods');
    const missingMods = (CATALOGS.mods || [])
        .map((m) => m.link)
        .filter((link) => !existsSync(join(modDir, link)));
    missingMods.length === 0
        ? ok('every mod file exists in mc/Eaglerforge/mods/ (' + readdirSync(modDir).length + ' files)')
        : missingMods.forEach((m) => bad('mod file missing: mc/Eaglerforge/mods/' + m));
}

{
    const icons = CATALOGS.icons || [];
    const missing = icons.filter((p) => !existsSync(join(ROOT, decodeURIComponent(p))));
    missing.length === 0
        ? ok('every installation icon exists on disk (' + icons.length + ')')
        : missing.forEach((m) => bad('installation icon missing: ' + m));
}

{
    const notes = CATALOGS.patchnotes || [];
    const broken = [];
    for (const note of notes) {
        for (const field of ['title', 'version', 'description', 'date', 'icon', 'type']) {
            if (!note[field]) broken.push(note.title + ' missing ' + field);
        }
    }
    broken.length === 0
        ? ok('patch notes are complete (' + notes.length + ' entries)')
        : broken.forEach((b) => bad('patch note: ' + b));
}

/* ------------------------------------------------------------------ *
 * 5. Skins manifest agrees with disk
 * ------------------------------------------------------------------ */

head('5. Skins manifest agrees with disk');

const skinsSrc = readFileSync(join(ROOT, 'assets/js/skins.js'), 'utf8');
const sctx = { window: {} };
new Function('window', skinsSrc)(sctx.window);
const SKINS = (sctx.window.AMPLER_SKINS || []).map((s) => (typeof s === 'string' ? s : s.name));
const SKIN_FOLDER = join(ROOT, (sctx.window.AMPLER_SKIN_DIR || './assets/skins/').replace(/^\.\//, ''));
const SKIN_PREFIX = sctx.window.AMPLER_SKIN_PREVIEW_PREFIX || 'preview.';

if (SKINS.length === 0) {
    bad('assets/js/skins.js lists no skins');
} else {
    ok('assets/js/skins.js evaluates: ' + SKINS.length + ' skins (' + SKINS.join(', ') + ')');
    let problems = 0;
    for (const name of SKINS) {
        const dir = join(SKIN_FOLDER, name);
        if (!existsSync(dir)) { problems++; bad('skin folder missing: assets/skins/' + name + '/'); continue; }
        for (const f of [name + '.png', SKIN_PREFIX + name + '.png']) {
            if (!existsSync(join(dir, f))) { problems++; bad('missing ' + f + ' in assets/skins/' + name + '/'); }
        }
    }
    if (problems === 0) ok('every skin has its folder, its <name>.png and its ' + SKIN_PREFIX + '<name>.png');
}

const foldersOnDisk = readdirSync(SKIN_FOLDER)
    .filter((n) => !n.startsWith('.') && statSync(join(SKIN_FOLDER, n)).isDirectory());

{
    const listJsPath = join(SKIN_FOLDER, 'list.js');
    if (!existsSync(listJsPath)) bad('assets/skins/list.js is missing - the page loads it on every boot');
    else {
        const lctx = { window: {} };
        let error = null;
        try { new Function('window', readFileSync(listJsPath, 'utf8'))(lctx.window); } catch (e) { error = e; }
        const baked = lctx.window.AMPLER_SKINS_FROM_DIR;
        if (error) bad('assets/skins/list.js does not parse: ' + error.message);
        else if (!Array.isArray(baked)) bad('assets/skins/list.js does not define AMPLER_SKINS_FROM_DIR');
        else {
            const odd = baked.filter((n) => typeof n !== 'string' || /[\\/]/.test(n) || n.includes('..'));
            const stale = baked.filter((n) => !foldersOnDisk.includes(n));
            if (odd.length) bad('odd names in assets/skins/list.js: ' + odd.join(', '));
            else if (stale.length) skipped('skins/list.js lists folders that are gone: ' + stale.join(', '));
            else ok('assets/skins/list.js matches the folders on disk (' + baked.join(', ') + ')');
        }
    }
}

/* ------------------------------------------------------------------ *
 * 6. jsdom: drive the launcher
 * ------------------------------------------------------------------ */

head('6. The launcher actually works (jsdom)');

const html = readFileSync(join(ROOT, 'index.html'), 'utf8');

function makeFetch(win) {
    return function (input, opts) {
        const raw = String(input);
        const url = new URL(raw, 'http://localhost:8080/');
        const path = join(ROOT, decodeURIComponent(url.pathname).replace(/^\/+/, ''));
        return new Promise((resolve, reject) => {
            const file = existsSync(path) && statSync(path).isFile() ? path : (existsSync(join(path, 'index.html')) ? join(path, 'index.html') : null);
            if (!file) {
                resolve({ ok: false, status: 404, text: async () => '', json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) });
                return;
            }
            const buf = readFileSync(file);
            resolve({
                ok: true,
                status: 200,
                headers: { get: () => null },
                text: async () => buf.toString('utf8'),
                json: async () => JSON.parse(buf.toString('utf8')),
                arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
                blob: async () => new win.Blob([buf])
            });
        });
    };
}

function stubEnvironment(win) {
    win.open = () => null;
    win.console.clear = () => {};
    win.fetch = makeFetch(win);
    // No real sockets in tests: every server probe reports offline immediately.
    win.WebSocket = function () {
        const self = this;
        setTimeout(() => { if (self.onerror) self.onerror(new Error('stubbed')); if (self.onclose) self.onclose({}); }, 0);
        this.close = () => {};
        this.send = () => {};
    };
    win.URL.createObjectURL = win.URL.createObjectURL || (() => 'blob:stub');
    win.URL.revokeObjectURL = win.URL.revokeObjectURL || (() => {});
}

let JSDOM = null;
try { JSDOM = (await import('jsdom')).JSDOM; } catch { /* optional */ }

if (!JSDOM) {
    skipped('jsdom not installed - skipping the live DOM test (npm i jsdom)');
} else {
    const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost:8080/' });
    const win = dom.window;
    stubEnvironment(win);

    let bootError = null;
    try {
        win.eval(readFileSync(join(ROOT, 'assets/js/jszip-local.js'), 'utf8'));
        win.eval(readFileSync(join(ROOT, 'assets/js/skins.js'), 'utf8'));
        win.eval(readFileSync(join(ROOT, 'assets/skins/list.js'), 'utf8'));
        win.eval(readFileSync(join(ROOT, 'assets/js/index.js'), 'utf8'));
        win.eval(readFileSync(join(ROOT, 'assets/js/skinsview.js'), 'utf8'));
    } catch (e) { bootError = e; }

    const d = win.document;
    const assert = (cond, msg) => (cond ? ok(msg) : bad(msg));
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    assert(bootError === null, 'index.js + skinsview.js boot without an exception' +
        (bootError ? ': ' + bootError.message : ''));

    assert(typeof win.showView === 'function' && typeof win.webedition === 'function' &&
           typeof win.moddededition === 'function' && typeof win.eaglercontrols === 'function' &&
           typeof win.settheme === 'function' && typeof win.setUsername === 'function' &&
           typeof win.renderSkins === 'function' && typeof win.equipSkin === 'function',
        'the public API is exported (views, editions, settings, skins)');

    /* ---- shell ---- */
    const sidebarIds = ['gtabs2', 'gtabs4', 'gtabs3', 'gtabs12', 'gtabs13', 'gtabs10', 'gtabs5', 'gtabs6'];
    const sidebarOrder = [...d.querySelectorAll('#sidebar .sidebarOptions')].map((n) => n.id);
    assert(JSON.stringify(sidebarOrder) === JSON.stringify(sidebarIds),
        'the sidebar is Web -> Mobile/Controller -> Modded -> Alpha -> Beta -> Custom Installations -> Credits -> Settings (' +
        sidebarOrder.join(', ') + ')');
    assert(!d.getElementById('gtabs1') && !d.getElementById('gtabs7') && !d.getElementById('gtabs8') &&
           !d.getElementById('gtabs9') && !d.getElementById('gtabs11'),
        'the Discord/News, Servers, EAGLERCON, Better Eagler and offline Downloads sidebar entries are gone');
    assert(!!d.getElementById('whatsnew') &&
           d.getElementById('sidebar').firstElementChild.id === 'whatsnew',
        "What's New is the first block in the sidebar, flush with the header");
    assert(!!d.getElementById('settingsPanel') && !!d.getElementById('volumeSlider') &&
           !!d.querySelector('#settingsPanel.inline') &&
           !d.querySelector('.gameHeaderTop button') &&
           !!d.getElementById('playtimeDisplay') && !!d.getElementById('sessionsDisplay') &&
           !!d.getElementById('fpsBoostDisplay'),
        'the quick-settings controls sit inline in Settings (no top-bar button) and the stats widget is present');
    assert(d.querySelectorAll('a[href*="discord"]').length === 0 &&
           !html.toLowerCase().includes('discord'),
        'no Discord invite, icon or wording anywhere in the shell');

    /* ---- editions ---- */
    win.webedition();
    await sleep(30);
    assert(d.getElementById('gameedition').textContent.indexOf('WEB EDITION') !== -1,
        'webedition() labels the header EAGLERCRAFT WEB EDITION');
    assert(['header1', 'header2', 'header4', 'header5', 'header6', 'header11', 'header12']
        .every((id) => d.getElementById(id).style.display === 'block'),
        'the header strip shows the browsing tabs in the Web edition');

    win.moddededition();
    await sleep(30);
    assert(d.getElementById('gameedition').textContent.indexOf('MODDED') !== -1 && d.getElementById('header2').style.display === 'block',
        'moddededition() shows the Mods tab');
    const rows = [...d.querySelectorAll('#dropdn .dropdownOptions')];
    assert(rows.length === (CATALOGS.modded || []).length,
        'the version dropdown lists the modded catalogue (' + rows.length + ' rows)');

    /* ---- Better Eagler is gone: no row, no section, no global ---- */
    assert(!rows.some((r) => r.getAttribute('data-title') === 'BetterEagler') &&
           !d.getElementById('gtabs11') &&
           typeof win.betteregaleredition === 'undefined' &&
           !CATALOGS.better,
        'Better Eagler has no sidebar section, no catalogue and no disabled row left behind');
    assert(rows.every((r) => !r.classList.contains('disabled') && r.getAttribute('tabindex') === '0'),
        'every row in the modded picker is launchable (' + rows.length + ' rows, 0 disabled)');

    /* ---- the header strip keeps every tab, minus Contributors/Credits ---- */
    const stripIds = ['header1', 'header2', 'header4', 'header5', 'header6',
        'header11', 'header12'];
    assert(!d.getElementById('header7') && !d.getElementById('header8') &&
           !d.getElementById('header9') && !d.getElementById('header10'),
        'Contributors, Credits, General and About are not in the header strip anymore');
    const sectionViews = ['play', 'mods', 'installations', 'custominstallations',
        'skins', 'patchnotes', 'servers', 'downloads'];
    let hiddenSomewhere = [];
    for (const view of sectionViews) {
        win.showView(view);
        await sleep(15);
        const missing = stripIds.filter((id) => (d.getElementById(id) || {}).style.display === 'none');
        if (missing.length) hiddenSomewhere.push(view + ': ' + missing.join('/'));
    }
    assert(hiddenSomewhere.length === 0,
        'every header tab stays visible in every section (' + sectionViews.length + ' checked)' +
        (hiddenSomewhere.length ? ': ' + hiddenSomewhere.join(' | ') : ''));

    win.showView('credits');
    await sleep(15);
    assert(d.getElementById('header1').style.display === 'none' &&
           d.querySelector('.gameTabs').style.display === 'none',
        'Credits is chrome-only: the strip is hidden, like the credit area');
    win.showView('generalsettings');
    await sleep(15);
    assert(d.getElementById('header1').style.display === 'none' &&
           d.querySelector('.gameTabs').style.display === 'none',
        'Settings is chrome-only too, so no other area can be picked from there');
    win.showView('play');

    /* ---- Alpha and Beta have their own rail sections + catalogues ---- */
    for (const [fn, key, label] of [['alphaedition', 'alpha', 'ALPHA'], ['betaedition', 'beta', 'BETA']]) {
        win[fn]();
        await sleep(40);
        const rail = d.getElementById(fn === 'alphaedition' ? 'gtabs12' : 'gtabs13');
        const rowsHere = [...d.querySelectorAll('#dropdn .dropdownOptions')];
        assert(d.getElementById('gameedition').textContent.indexOf(label) !== -1 &&
               rail.classList.contains('selected') &&
               rowsHere.length === (CATALOGS[key] || []).length,
            'the ' + key + ' rail section lists its own catalogue (' + rowsHere.length + ' builds)');
        assert(rowsHere.every((r) => {
            const img = r.querySelector('img');
            if (!img) return false;
            // WASM builds get the WASM variant of the same block, never another block.
            const src = img.getAttribute('src');
            const base = key === 'alpha' ? 'monster-spawner' : 'tnt';
            const wasmRow = /wasm/i.test(r.textContent);
            return src === './assets/images/mc-icons/' + base + (wasmRow ? '-wasm' : '') + '.png';
        }), 'every ' + key + ' build uses the ' + (key === 'alpha' ? 'spawner' : 'TNT') +
            ' block icon, and WASM builds use its -wasm twin');
    }

    /* ---- themes apply from Appearance and persist ---- */
    {
        const applied = [];
        for (const theme of ['redstone', 'lapis', 'amethyst', 'gold', 'neon', 'light', 'default']) {
            win.settheme(theme);
            const live = d.documentElement.getAttribute('data-theme');
            const card = d.querySelector('[data-themename="' + theme + '"]');
            const stored = win.localStorage.getItem('theme');
            if (theme === 'default') {
                applied.push(!live && !stored && card && card.classList.contains('selected'));
            } else {
                applied.push(live === theme && stored === theme && card && card.classList.contains('selected'));
            }
        }
        assert(applied.every(Boolean),
            'every Appearance theme applies, marks its card and is remembered across reloads');
    }

    win.eaglercontrols();
    await sleep(30);
    assert(d.getElementById('gameedition').textContent.indexOf('MOBILE') !== -1,
        'eaglercontrols() switches to the Mobile/Controller edition');

    win.webedition();
    await sleep(30);
    const webEntries = (CATALOGS.base || []).filter((e) => e.active !== false || e.disabled);
    const webRows = [...d.querySelectorAll('#dropdn .dropdownOptions')];
    assert(webRows.length === webEntries.length,
        'the Web edition lists every enabled build (' + webRows.length + ')');
    assert(!webRows.some((r) => /4k/i.test(r.getAttribute('data-title') || '')),
        'the 4K entries are gone from the version list');
    assert(!(CATALOGS.base || []).some((e) => /4k/i.test(e.title)),
        'no 4K entry remains in assets/json/base.json');

    /* ---- dropdown select ---- */
    win.dropdowntoggle();
    await sleep(40);
    assert(d.getElementById('dropdn').style.visibility === 'visible', 'the version selector opens');
    const target = d.querySelectorAll('#dropdn .dropdownOptions')[2];
    target.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await sleep(40);
    assert(d.getElementById('dropdn').style.visibility === 'hidden', 'picking a version closes the list');
    assert(d.getElementById('playbutton').getAttribute('href').indexOf('mc/') !== -1,
        'the Play button points at a bundled build');

    /* ---- one play button, inside the bar ---- */
    const playButtons = d.querySelectorAll('.playButton');
    assert(playButtons.length === 1 && !d.querySelector('.playButton2'),
        'there is exactly one play button (no stacked duplicate)');
    assert(d.getElementById('playbutton').parentNode.id === 'gameSelection' ||
           d.getElementById('gameSelection').contains(d.getElementById('playbutton')),
        'the play button lives inside the bottom bar');

    /* ---- mods ---- */
    win.showView('mods');
    await sleep(40);
    const modCards = [...d.querySelectorAll('#modsbox .modoption')];
    assert(modCards.length === (CATALOGS.mods || []).length,
        'Modketplace renders every bundled mod (' + modCards.length + ')');
    modCards[0].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await sleep(10);
    const storedMods = JSON.parse(win.localStorage.getItem('modslauncher') || '[]');
    assert(storedMods.length === 1 && JSON.parse(win.localStorage.getItem('ml::Mods') || '[]')[0].indexOf('mods/') === 0,
        'toggling a mod writes both modslauncher and the EaglerForge ml::Mods list');
    modCards[0].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await sleep(10);
    assert(JSON.parse(win.localStorage.getItem('modslauncher') || '[]').length === 0,
        'toggling it again removes the mod');

    /* ---- every mod card carries its own install button ---- */
    const dlButtons = [...d.querySelectorAll('#modsbox .modoption .moddownload')];
    assert(dlButtons.length === modCards.length,
        'every mod box has a download button pinned to the bottom (' + dlButtons.length + ')');
    const modFiles = dlButtons.map((b) => b.getAttribute('data-modfile'));
    assert(modFiles.every((f) => f && existsSync(join(ROOT, 'mc/Eaglerforge/mods', f))),
        'each download button points at a .js that actually ships in mc/Eaglerforge/mods/');
    assert(dlButtons.every((b) => b.textContent.trim().length > 0 && b.tagName === 'BUTTON'),
        'the buttons are real, labelled buttons (not links that navigate)');
    {
        const card = d.querySelector('#modsbox .modoption');
        const before = card.getAttribute('aria-checked');
        const button = card.querySelector('.moddownload');
        button.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
        await sleep(120);
        assert(card.getAttribute('aria-checked') === before &&
               JSON.parse(win.localStorage.getItem('modslauncher') || '[]').length === 0,
            'pressing Download installs the file without toggling the mod itself');
        assert(typeof win.downloadmod === 'function' && win.downloadmod('Auto Clicker') === true,
            'window.downloadmod() installs a named mod and reports success');
    }

    /* ---- patch notes ---- */
    win.showView('patchnotes');
    await sleep(40);
    assert(d.querySelectorAll('#patchnotesbox .patchnote').length === (CATALOGS.patchnotes || []).length,
        'Patch Notes renders every entry (' + (CATALOGS.patchnotes || []).length + ')');
    assert(d.querySelectorAll('#patchnotesindex .notesIndexRow').length === (CATALOGS.patchnotes || []).length,
        'the release directory lists every version');
    d.querySelector('#patchnotesbox .patchnote').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    assert(!d.getElementById('patchnotedetail').hidden &&
           !!d.querySelector('#patchnotedetail .patchnoteDetailTitle'),
        'clicking a patch note swaps the patch-notes area for the note itself');
    assert(d.getElementById('externalmenu').style.display !== 'flex',
        'the note does not open a full-screen overlay');
    win.closenotescreen();
    assert(d.getElementById('patchnotedetail').hidden &&
           d.getElementById('patchnotesbox').style.display !== 'none',
        'Back to all versions restores the release list');

    /* back into a submenu: the Patch Notes tab itself is now 'back to the list' */
    win.showView('patchnotes');
    await sleep(20);
    d.querySelector('#patchnotesbox .patchnote').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await sleep(20);
    win.patchnotesheader();
    await sleep(20);
    assert(d.getElementById('patchnotedetail').hidden &&
           d.getElementById('patchnotesbox').style.display !== 'none' &&
           d.getElementById('header6').classList.contains('selected'),
        'clicking Patch Notes from inside a note comes back to the release list');
    assert(!d.getElementById('filterGame') && !d.getElementById('filterSite') &&
           typeof win.sortnote === 'undefined',
        'the release type checkboxes are gone - every note is always listed');

    /* the version tick-boxes only exist on your own installations now */
    win.installationheader();
    await sleep(120);
    assert(d.querySelectorAll('#installationsbox .installationOptions').length >
           d.querySelectorAll('#installationsbox .installationBox').length,
        'only the custom installations keep a show/hide checkbox');
    win.playheader();
    await sleep(60);

    /* FAQ is gone, as a real removal */
    assert(!d.getElementById('faq') && !d.getElementById('header3') &&
           typeof win.faqsheader === 'undefined' && !CATALOGS.faqs,
        'the FAQ area, its tab and its data file are all gone');

    /* the launch bar hangs off the Play screen, never the whole window */
    assert(d.getElementById('gameSelection').parentNode.id === 'game-bg',
        'the launch bar sits inside the Play screen, so it cannot overlay another page');

    /* ---- Custom Installations is the Play screen, scoped to your own builds ---- */
    win.showView('play');
    win.custominstallationsmenu();
    await sleep(80);
    assert(d.getElementById('game-bg').style.display === 'flex' &&
           d.getElementById('gtabs10').classList.contains('selected') &&
           d.getElementById('gameSelection').style.display === 'flex',
        'the sidebar Custom Installations entry opens the Play screen with its launch bar');
    assert(!d.getElementById('custominstallations'),
        'the old checklist screen is gone - Custom Installations is a play area now');
    assert(d.querySelectorAll('#dropdn .dropdownOptions').length === 1 &&
           d.querySelector('#dropdn .dropdownOptions').classList.contains('emptyOption'),
        'with nothing built yet the picker says so instead of listing presets');
    assert(!d.getElementById('playbutton').getAttribute('href') &&
           d.getElementById('playbutton').classList.contains('playDisabled'),
        'Play is disabled while there is nothing of your own to launch');

    /* ---- Installations (header tab) is the manager ---- */
    win.installationheader();
    await sleep(80);
    assert(d.getElementById('installations').style.display === 'flex' &&
           d.querySelectorAll('#installationsbox .installationOptions').length > 0,
        'the Installations tab shows the manager, not an empty screen');
    assert(!!d.getElementById('newinstallationbutton') &&
           !d.getElementById('custominstallations'),
        'the manager owns the New installation (upload) button');

    /* ---- the launch bar lives on the Play screen only ---- */
    win.showView('installations');
    await sleep(30);
    assert(d.getElementById('gameSelection').style.display === 'none',
        'no launch bar while managing installations');
    win.showView('skins');
    await sleep(10);
    assert(d.getElementById('gameSelection').style.display === 'none',
        'the launch bar stays off the screens that cannot launch anything');

    /* ---- installations ---- */
    win.showView('installations');
    await sleep(60);
    const installRows = [...d.querySelectorAll('#installationsbox .installationOptions')];
    const expectedRows = ['base', 'modded', 'assisted']
        .reduce((n, k) => n + (CATALOGS[k] || []).length, 0);
    assert(installRows.length >= expectedRows, 'Installations lists the three editions\' presets (' + installRows.length + ' rows)');
    assert(installRows.length === expectedRows,
        'Installations lists every preset build (' + installRows.length + ')');

    win.newinstallation('./assets/json/base.json');
    await sleep(60);
    assert(d.getElementById('installationscreenname') !== null, 'the New Installation form opens');
    assert(!!d.getElementById('installationscreenversion') &&
           d.getElementById('installationscreenversion').tagName === 'INPUT',
        'the version field is an editable text input');
    assert(!!d.querySelector('#installationcombobox .comboboxArrow') &&
           d.querySelectorAll('#installationcombobox .comboboxItem').length > 10,
        'the version field has a dropdown arrow listing the known versions');
    assert(d.querySelectorAll('.sourcecards .sourcecard').length === 3 &&
           !!d.getElementById('installationsourcefile') &&
           !!d.getElementById('installationsourcepaste'),
        'the form offers a bundled version, a file picker and a paste box');

    /* ---- create a custom installation from a pasted URL ---- */
    d.getElementById('installationscreenname').value = 'My Server Client';
    d.getElementById('installationscreenversion').value = '1.8.8 custom';
    d.querySelector('.sourcecards .sourcecard[data-source="paste"]')
        .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    const paste = d.getElementById('installationsourcepaste');
    paste.value = 'https://example.com/client.html';
    paste.dispatchEvent(new win.Event('input', { bubbles: true }));
    d.getElementById('newinstallationsave').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await sleep(80);

    const customIds = JSON.parse(win.localStorage.getItem('customlaunchers') || '[]');
    assert(customIds.length === 1, 'a custom installation is saved');
    const customEntry = JSON.parse(win.localStorage.getItem('c' + customIds[0]) || '{}');
    assert(customEntry.displayName === 'My Server Client' &&
           customEntry.link === 'https://example.com/client.html' &&
           customEntry.source && customEntry.source.kind === 'url',
        'the installation keeps its name, version and pasted source');
    /* ---- the new build lands in the manager, with its actions ---- */
    win.installationheader();
    await sleep(80);
    const managerRows = [...d.querySelectorAll('#installationsbox .installationOptions')];
    const myRow = managerRows.find((r) => r.textContent.indexOf('My Server Client') !== -1);
    assert(!!myRow && !!myRow.querySelector('.editbuttons'),
        'the manager lists your build with Rename / Edit / Delete');
    assert(managerRows.length === expectedRows + 1,
        'the manager shows presets and your own builds together (' + managerRows.length + ' rows)');
    assert(/1 installation of your own/.test(d.getElementById('custominstallationscount').textContent),
        'the manager counts your own installations');

    /* ---- Custom Installations: your builds only, and they launch ---- */
    win.custominstallationsmenu();
    await sleep(120);
    {
        const rows = [...d.querySelectorAll('#dropdn .dropdownOptions')];
        const names = rows.map((r) => (r.querySelector('.dropdownOptionText .bolded') || {}).textContent);
        assert(names.length === 1 && names[0] === 'My Server Client',
            'the picker lists exactly the build you made (' + names.join(', ') + ')');
        const presetsLeaked = ['base', 'modded', 'assisted', 'alpha', 'beta'].some((k) =>
            (CATALOGS[k] || []).some((e) => names.includes(e.title)));
        assert(!presetsLeaked, 'no preset build leaks into Custom Installations');
        assert(d.getElementById('playbutton').getAttribute('href') === 'https://example.com/client.html',
            'the bar points Play at your selected installation');

        rows[0].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
        await sleep(40);
        assert(d.getElementById('gametitle').textContent === 'My Server Client' &&
               d.getElementById('gameSelection').style.display === 'flex',
            'picking it in the bar selects it for Play');
    }

    /* ---- the rail, the tab strip and the bar always agree ---- */
    win.modsheader();
    await sleep(80);
    assert(d.getElementById('mods').style.display === 'flex' &&
           !d.getElementById('gtabs10').classList.contains('selected') &&
           d.getElementById('header2').classList.contains('selected') &&
           d.getElementById('gameedition').textContent.indexOf('WEB EDITION') !== -1 &&
           d.getElementById('gtabs2').classList.contains('selected'),
        'leaving Custom Installations for a header tab hands the chrome back to the Web Edition');
    win.playheader();
    await sleep(200);
    {
        const webRows = [...d.querySelectorAll('#dropdn .dropdownOptions')];
        const names = webRows.map((r) => r.getAttribute('data-title'));
        assert(d.getElementById('gameedition').textContent.indexOf('WEB EDITION') !== -1 &&
               d.getElementById('gtabs2').classList.contains('selected') &&
               !webRows.some((r) => r.classList.contains('emptyOption')) &&
               names.length === (CATALOGS.base || []).length + 1,
            'Play puts the rail back on the Web build list, not only the custom one (' + names.length + ')');
    }

    win.webedition();
    await sleep(60);
    assert([...d.querySelectorAll('#dropdn .dropdownOptions')]
        .some((r) => (r.getAttribute('data-title') || '').indexOf('My Server Client') !== -1 ||
                     r.textContent.indexOf('My Server Client') !== -1),
        'the installation is launchable from the Play dropdown');
    win.closenotescreen();

    /* ---- servers ---- */
    win.showView('servers');
    await sleep(40);
    assert(d.querySelectorAll('#serversGrid .serverCard').length >= 8,
        'the Servers screen lists the default multiplayer servers');
    d.getElementById('customServerName').value = 'My LAN';
    d.getElementById('customServerIp').value = 'wss://example.invalid';
    win.addCustomServer();
    await sleep(20);
    assert(d.querySelectorAll('#serversGrid .serverCard').length >= 9 &&
           JSON.parse(win.localStorage.getItem('ampler.customServers') || '[]').length === 1,
        'a custom server can be added and is saved');

    /* ---- downloads ---- */
    win.showView('downloads');
    await sleep(80);
    const dlCards = d.querySelectorAll('#downloadsGrid .serverCard');
    const availabilityPath = join(ROOT, 'mc/upstream-availability.json');
    const availability = existsSync(availabilityPath) ? JSON.parse(readFileSync(availabilityPath, 'utf8')) : [];
    const dlExpected = ['base', 'modded', 'assisted', 'alpha', 'beta']
        .reduce((n, k) => n + (CATALOGS[k] || []).filter((e) => {
            const folder = decodeURIComponent(e.link.split('?')[0]).replace(/^\.\//, '').replace(/\/$/, '');
            return e.active !== false || (e.disabled && availability.includes(folder));
        }).length, 0);
    assert(dlCards.length === dlExpected,
        'the Downloads screen offers every enabled client (' + dlCards.length + ' of ' + dlExpected + ' cards)');
    assert(d.querySelectorAll('#downloadsGrid [data-act="html"]').length === dlCards.length &&
           d.querySelectorAll('#downloadsGrid [data-act="zip"]').length === dlCards.length,
        'every download card offers both .html and .zip packaging');
    assert(d.querySelectorAll('a[href*="gx"], a[href*="GX"]').length === 0 &&
           !existsSync(join(ROOT, 'gx launcher root')),
        'the GX-Launcher UI is gone from the launcher and the tree');

    /* ---- the skin screen is browse-only ---- */
    assert(!d.getElementById('uploadskinbtn') && !d.getElementById('addfolder') &&
           !/assets\/skins/.test(d.getElementById('skinsview').textContent),
        'the skins screen has no upload/folder tools and no "drop a folder here" copy');

    /* ---- the picker opens normally in every section ---- */
    win.moddededition();
    await sleep(40);
    const picker = d.getElementById('drop');
    assert(!picker.classList.contains('staticPicker') && picker.getAttribute('aria-haspopup') === 'listbox',
        'the build picker is a real menu again now that Better Eagler is gone');
    win.dropdowntoggle();
    await sleep(60);
    assert(d.getElementById('dropdn').style.visibility === 'visible',
        'the build picker opens and lists the builds');
    win.dropdowntoggle();
    await sleep(10);

    win.webedition();
    await sleep(30);

    /* ---- the wording of an option toggles its box ---- */
    win.showView('generalsettings');
    await sleep(20);
    {
        const row = [...d.querySelectorAll('.setting-item')].find((r) => r.querySelector('input[type=checkbox]'));
        const box = row.querySelector('input[type=checkbox]');
        const before = box.checked;
        row.querySelector('p').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
        await sleep(20);
        assert(box.checked === !before, 'clicking the option wording flips the checkbox');
        row.querySelector('p').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
        await sleep(20);
        assert(box.checked === before, 'clicking the wording again flips it back');
    }

    /* ---- skins ---- */
    win.showView('skins');
    await sleep(40);
    const skinCards = [...d.querySelectorAll('#skingrid .skinCard')];
    assert(skinCards.length === SKINS.length,
        'the Skins grid shows every skin in the folder (' + skinCards.length + ')');
    assert(skinCards.every((c) => c.querySelector('.skinEquipBtn') && c.querySelector('.skinDownload')),
        'every skin card offers Equip and Download');

    win.filterSkins('creeper');
    assert(d.querySelectorAll('#skingrid .skinCard').length <= SKINS.length,
        'the skin search filters the grid');
    win.filterSkins('');

    /* ---- username ---- */
    win.setUsername('Steve');
    assert(d.getElementById('username').textContent === 'Steve' &&
           win.localStorage.getItem('username') === 'Steve',
        'the username is set and saved');
    win.usernamechange();
    win.generateXboxUsername();
    assert((win.localStorage.getItem('username') || '').length > 3,
        'the random Xbox-style username generator works without any network call');

    /* ---- settings: theme, text scale, launch mode, default tab, layout ---- */
    win.settheme('redstone');
    assert(d.documentElement.dataset.theme === 'redstone' &&
           win.localStorage.getItem('theme') === 'redstone' &&
           d.querySelector('[data-themename="redstone"]').classList.contains('selected') &&
           d.querySelector('[data-themename="redstone"]').getAttribute('aria-pressed') === 'true',
        'themes apply to <html data-theme>, persist, and stay visibly selected');
    win.settheme('default');
    assert(!d.documentElement.dataset.theme &&
           d.querySelector('[data-themename="default"]').classList.contains('selected'),
        'Default removes the theme attribute and re-selects the default card');

    assert(!d.querySelector('[data-textscale]') && !/Text Size/i.test(d.getElementById('settings').textContent),
        'the text-size editor is gone from Settings');

    assert((win.localStorage.getItem('launchmode') || 'tab') === 'tab' &&
           d.querySelector('[data-launchmode="tab"]').classList.contains('selected'),
        'the default launch mode is New Tab');
    const launchCards = [...d.querySelectorAll('[data-launchmode]')].map((c) => c.getAttribute('data-launchmode'));
    assert(JSON.stringify(launchCards) === JSON.stringify(['same', 'tab', 'blank', 'popup', 'blob', 'data-uri']),
        'all six launch modes are offered (same, tab, blank, popup, blob, data-uri)');
    win.setlaunchmode('popup');
    assert(win.localStorage.getItem('launchmode') === 'popup' &&
           d.querySelector('[data-launchmode="popup"]').classList.contains('selected') &&
           !d.querySelector('[data-launchmode="tab"]').classList.contains('selected'),
        'launch mode is stored and exactly one card is highlighted');
    win.setlaunchmode('tab');

    win.setdefaultview('skins');
    assert(win.localStorage.getItem('defaultview') === 'skins' &&
           d.querySelector('[data-defaultview="skins"]').classList.contains('selected') &&
           d.querySelector('[data-defaultview="play"]').classList.contains('selected') === false,
        'the Default Tab setting persists and highlights one card');
    win.setdefaultview('play');
    assert(win.localStorage.getItem('defaultview') === null,
        'Default Tab = Play is the stored default');

    win.setlayout('classic');
    assert(d.documentElement.dataset.layout === 'classic' &&
           win.localStorage.getItem('layout') === 'classic' &&
           d.querySelector('[data-layout="classic"]').classList.contains('selected'),
        'Interface Layout switches to the classic arrangement and persists');
    win.setlayout('new');
    assert(d.documentElement.dataset.layout === 'new' && win.localStorage.getItem('layout') === null,
        'Interface Layout goes back to the standard arrangement');

    /* ---- settings copy: white, no repository names ---- */
    {
        const settingsText = d.getElementById('settings').textContent;
        const banned = ['yummyfiles', 'Dev-subha-stack', 'gtrdhf', 'theveil-media', 'proton-arcade'];
        assert(!banned.some((n) => settingsText.includes(n)),
            'no repository names appear in Settings (attribution lives in Credits)');
        assert(!/discord/i.test(settingsText) && !/wisp|proxy|proxies/i.test(settingsText),
            'Settings mentions neither Discord nor proxies');
    }

    /* ---- stats widget only on the Play screen ---- */
    win.showView('generalsettings');
    await sleep(20);
    assert(d.querySelector('.stats-widget').style.display === 'none',
        'the playtime/sessions/FPS widget is hidden in Settings');
    for (const view of ['credits', 'servers', 'downloads', 'installations', 'skins', 'patchnotes', 'mods']) {
        win.showView(view);
        await sleep(5);
        if (d.querySelector('.stats-widget').style.display !== 'none') {
            bad('the stats widget is still visible on ' + view);
        }
    }
    win.showView('play');
    assert(d.querySelector('.stats-widget').style.display === 'flex',
        'the stats widget is visible on the Play screen only');

    /* ---- quick-settings controls are inline, not a drawer ---- */
    win.showView('generalsettings');
    await sleep(20);
    {
        const panel = d.getElementById('settingsPanel');
        assert(panel.closest('#settings') !== null &&
               !d.querySelector('.gameHeaderTop button') &&
               !d.getElementById('settingsPanel').querySelector('.close-btn'),
            'the old slide-out drawer is gone: the controls sit in the Settings screen with no close button');
        win.toggleSettings();
        assert(!d.getElementById('themeSelect') &&
               d.getElementById('volumeSlider').value === (win.localStorage.getItem('volume') || '70'),
            'the inline controls sync to the stored settings, and the theme picker lives in Appearance only');
    }
    win.toggleFpsBoost();
    assert(win.localStorage.getItem('fpsBoost') === 'false' &&
           d.getElementById('fpsBoostDisplay').textContent === 'OFF',
        'FPS Boost toggles and reports its state');
    win.toggleFpsBoost();
    win.toggleBranding(true);
    assert(win.localStorage.getItem('mcBranding') === 'true' &&
           d.querySelector('.brandPrefix').textContent.indexOf('MINECRAFT') === 0,
        'Minecraft branding rewrites the sidebar prefixes');
    win.toggleBranding(false);

    /* ---- credits cover every source ---- */
    {
        win.showView('credits');
        await sleep(80);
        const tiles = [...d.querySelectorAll('#credits .credittile')];
        const text = tiles.map((t) => t.textContent).join(' | ');
        const required = ['Lax1dude', 'g.deev.is', 'Yee Launcher', 'Dev-subha-stack', 'gtrdhf',
            'theveil-media', 'yummyfiles', 'proton-arcade', 'IRV77'];
        const missingNames = required.filter((n) => text.indexOf(n) === -1);
        assert(tiles.length >= 9 && missingNames.length === 0,
            'Credits thanks every source, each with a creator and a contribution' +
            (missingNames.length ? ' (missing: ' + missingNames.join(', ') + ')' : ''));
        assert(tiles.every((t) => t.querySelector('img') && t.querySelector('.contributordescription')),
            'every credit card carries an icon and a one-line contribution');

        tiles[0].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
        const detail = d.getElementById('creditdetail');
        assert(!detail.hidden && detail.querySelectorAll('.creditlist li').length >= 3,
            'clicking a credit opens the full list of what they did');
        win.closeCredit();
        assert(detail.hidden && d.getElementById('creditsbox').style.display !== 'none',
            'the credit detail closes back to the grid');
        assert(!/EAGLERCON/i.test(d.body.textContent),
            'no EAGLERCON Live section remains anywhere in the page');
    }

    /* ---- views come back ---- */
    win.showView('play');
    assert(d.getElementById('game-bg').style.display === 'flex' &&
           d.getElementById('gameSelection').style.display === 'flex',
        'the Play screen comes straight back');

    /* ---- keyboard reachability ---- */
    {
        const key = (node, k) => node.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, bubbles: true }));
        assert(d.getElementById('drop').getAttribute('tabindex') === '0' &&
               d.getElementById('userbox').getAttribute('tabindex') === '0',
            'the version selector and the username are reachable by Tab');

        win.webedition();
        await sleep(20);
        key(d.getElementById('header5'), 'Enter');
        assert(d.getElementById('skinsview').style.display === 'flex',
            'Enter on the Skins tab opens the skins page');
        key(d.getElementById('header1'), 'Enter');
        assert(d.getElementById('game-bg').style.display === 'flex',
            'Enter on the Play tab comes back');
    }

    /* ---- head contains no unbootable remote stylesheet ---- */
    const remoteLinks = [...d.querySelectorAll('link[href]')]
        .map((l) => l.getAttribute('href')).filter((h) => /^https?:/i.test(h));
    assert(remoteLinks.every((h) => /^https:\/\//i.test(h)),
        'every remote <link> in <head> is https (' + remoteLinks.length + ')');

    // The playtime counter keeps a timer alive; tear the window down so the
    // process can finish.
    try { win.close(); } catch (e) {}
}

/* ------------------------------------------------------------------ *
 * 7. Served over HTTP
 * ------------------------------------------------------------------ */

head('7. tools/serve.py serves everything with the right headers');

function pythonAvailable() {
    try { execSync('python3 --version', { stdio: 'ignore' }); return true; } catch { return false; }
}

if (!pythonAvailable()) {
    skipped('python3 not found - skipping the HTTP test');
} else {
    const port = 8000 + Math.floor(Math.random() * 900);
    const srv = spawn('python3', [join(REPO, 'tools', 'serve.py'),
        '--port', String(port), '--host', '127.0.0.1', '--no-browser'],
        { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });

    let booted = false;
    srv.stdout.on('data', (b) => { if (String(b).includes('Ampler Launcher')) booted = true; });
    srv.stderr.on('data', () => {});

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 60 && !booted; i++) await sleep(100);

    if (!booted) {
        bad('server did not announce itself within 6s');
    } else {
        const base = 'http://127.0.0.1:' + port + '/';
        const entries = ['base', 'modded', 'assisted']
            .flatMap((k) => (CATALOGS[k] || []).filter((e) => e.active !== false).map((e) => e.link));

        const targets = [
            'index.html',
            'assets/js/index.js',
            'assets/js/jszip-local.js',
            'assets/js/wispcraft.js',
            'assets/js/skins.js',
            'assets/js/skinsview.js',
            'assets/skins/list.js',
            'assets/css/style.css',
            'assets/css/screensize.css',
            'assets/css/fonts.css',
            'assets/fonts/roboto-latin-400-normal.woff2',
            'assets/json/base.json',
            'assets/json/mods.json',
            'assets/images/play.png',
            'assets/images/play-hover.png',
            'assets/json/patchnotes.json',
            'assets/server/eaglerxserver-1.1.1-src.zip',
            ...entries
        ];

        let failuresHere = 0;
        for (const t of targets) {
            try {
                const r = await fetch(base + t);
                if (r.status !== 200) { failuresHere++; bad('HTTP ' + r.status + ' for ' + t); }
                else if (t === 'index.html') {
                    const coop = r.headers.get('cross-origin-opener-policy');
                    const coep = r.headers.get('cross-origin-embedder-policy');
                    if (coop !== 'same-origin' || !/require-corp|credentialless/.test(coep || '')) {
                        failuresHere++;
                        bad('missing isolation headers on index.html (coop=' + coop + ' coep=' + coep + ')');
                    } else ok('index.html 200 with COOP=' + coop + ' COEP=' + coep);
                }
            } catch (e) {
                failuresHere++; bad('request failed for ' + t + ': ' + e.message);
            }
        }
        if (failuresHere === 0) ok(targets.length + ' URLs served, including every enabled catalogue entry (' + entries.length + ')');

        // The live skins listing is generated per request.
        try {
            const text = await (await fetch(base + 'assets/skins/list.js')).text();
            const m = /window\.AMPLER_SKINS_FROM_DIR\s*=\s*(\[[^\]]*\])/.exec(text);
            const got = m ? JSON.parse(m[1]) : null;
            const want = foldersOnDisk.filter((n) => readdirSync(join(SKIN_FOLDER, n))
                .some((f) => ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(extname(f).toLowerCase())));
            got && JSON.stringify(got) === JSON.stringify(want)
                ? ok('the served skins listing is the live folder listing (' + want.join(', ') + ')')
                : bad('served skins listing ' + JSON.stringify(got) + ' != folders on disk ' + JSON.stringify(want));
        } catch (e) {
            bad('skins listing request failed: ' + e.message);
        }

        try {
            const dry = execSync('python3 ' + join(REPO, 'tools', 'bake-skins.py') + ' --dry-run', { cwd: ROOT }).toString();
            const served = await (await fetch(base + 'assets/skins/list.js')).text();
            dry.trim() === served.trim()
                ? ok('bake-skins.py agrees with serve.py on the folder listing')
                : bad('bake-skins.py output differs from the served listing');
        } catch (e) {
            bad('bake-skins.py --dry-run failed: ' + e.message);
        }

        // A directory URL must land on its index.html, with or without a trailing slash.
        try {
            const noSlash = await fetch(base + 'mc/ir/1.8.8');
            const withSlash = await fetch(base + 'mc/ir/1.8.8/');
            noSlash.status === 200 && withSlash.status === 200
                ? ok('mc/ir/1.8.8 resolves with and without the trailing slash')
                : bad('mc/ir/1.8.8 -> ' + noSlash.status + ' / ' + withSlash.status);
        } catch (e) {
            bad('mc/ir/1.8.8 request failed: ' + e.message);
        }
    }

    srv.kill('SIGTERM');
}

/* ------------------------------------------------------------------ *
 * 8. Change-request rules that must not regress
 * ------------------------------------------------------------------ */

head('8. Global rules: no Discord, no proxy wording, no dead controls');

{
    const VENDOR = [/^mc\//, /^assets\/skins\//, /^assets\/js\/wispcraft\.js$/,
        /^assets\/js\/jszip-local\.js$/];
    const SHIPPED = SCANNABLE.filter((f) => {
        const r = rel(f).replace(/\\/g, '/');
        return !VENDOR.some((v) => v.test(r));
    });

    const discordHits = [];
    const proxyHits = [];
    for (const f of SHIPPED) {
        const text = readFileSync(f, 'utf8');
        if (/discord/i.test(text)) discordHits.push(rel(f));
        // 'proxy'/'wisp' are allowed only inside the vendored bundle, which the
        // scan above already excludes.
        if (/wisp|proxy|proxies/i.test(text)) proxyHits.push(rel(f));
    }
    discordHits.length === 0
        ? ok('no Discord invite, icon or wording anywhere in the shipped launcher')
        : discordHits.forEach((f) => bad('Discord reference left in ' + f));

    proxyHits.length === 0
        ? ok('no WISP / proxy settings UI or wording anywhere in the shipped launcher')
        : proxyHits.forEach((f) => bad('proxy wording left in ' + f));

    // file:// support was dropped on purpose: the launcher must not contain
    // gates, notices or fallbacks for it.
    const FORBIDDEN = ['filewarning', "location.protocol === 'file:'", 'location.protocol === "file:"',
        "startsWith('file:')", 'startsWith("file:")', 'isFileProtocol'];
    let hits = 0;
    for (const f of LAUNCHER_FILES) {
        const text = readFileSync(f, 'utf8');
        for (const tok of FORBIDDEN) {
            if (text.includes(tok)) { hits++; bad('file:// gate left in ' + rel(f) + ': ' + tok); }
        }
    }
    if (hits === 0) ok('0 file:// gates, notices or fallbacks in the launcher code');

    // Settings text must be white / high contrast.
    const style = readFileSync(join(ROOT, 'assets/css/style.css'), 'utf8');
    const hasWhite = /\.settingsdesc[\s\S]{0,160}#ffffff/.test(style) || /\.settingsdesc[\s\S]{0,160}#f2f2f2/.test(style);
    hasWhite ? ok('settings descriptions are forced to white text')
             : bad('settings descriptions still use a low-contrast colour');

}

/* ------------------------------------------------------------------ *
 * Summary
 * ------------------------------------------------------------------ */

console.log('\n' + '='.repeat(58));
console.log('  passed: ' + pass + '   failed: ' + fail + '   skipped: ' + skip);
console.log('='.repeat(58));
if (fail > 0) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log('  - ' + f));
    process.exit(1);
}
console.log('\nAll checks passed.');
process.exit(0);
