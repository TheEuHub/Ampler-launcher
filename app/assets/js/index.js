// Ampler Launcher - unified controller
// ---------------------------------------------------------------------------
// This file drives index.html. It merges the behaviour of all six source
// repositories into one launcher:
//
//   * theveil-media/AmplerLauncher   editions, installations, themes, launch
//                                    modes, custom installs
//   * gtrdhf/AmplerLauncher          live Servers screen,
//                                    Mobile/Controller editions
//   * Dev-subha-stack + yummyfiles   Mineforge/EaglerForge mod selector,
//                                    Minecraft branding, Quick Settings
//                                    panel, Quick Stats widget, FPS Boost
//   * proton-arcade (both)           offline-first structure, accessible
//                                    keyboard handling, scrollable dropdown
//   * gtrdhf/AmplerLauncher          live server status poller (Accept: MOTD),
//                                    offline client downloader
//
// Everything here is HTTPS/HTTP only - the launcher is always served (see
// tools/serve.py). file:// support was deliberately dropped: no
// feature is allowed to be degraded for a protocol the launcher never runs on.
// ---------------------------------------------------------------------------
(function () {
    'use strict';

    /* ------------------------------------------------------------------ *
     * Storage
     * ------------------------------------------------------------------ */

    var memoryStore = {};

    function sGet(key) {
        try {
            var v = window['localStorage'].getItem(key);
            return v === null ? null : v;
        } catch (e) {
            return Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : null;
        }
    }

    function sSet(key, value) {
        var str = String(value);
        memoryStore[key] = str;
        try { window['localStorage'].setItem(key, str); } catch (e) { /* private mode */ }
    }

    function sRemove(key) {
        delete memoryStore[key];
        try { window['localStorage'].removeItem(key); } catch (e) {}
    }

    function sClear() {
        memoryStore = {};
        try { window['localStorage'].clear(); } catch (e) {}
    }

    function sJSON(key, fallback) {
        var raw = sGet(key);
        if (!raw) return fallback;
        try {
            var v = JSON.parse(raw);
            return v === null ? fallback : v;
        } catch (e) {
            return fallback;
        }
    }

    /* ------------------------------------------------------------------ *
     * Small helpers
     * ------------------------------------------------------------------ */

    function el(id) { return document.getElementById(id); }

    function escapeHtml(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function onKey(node, handler) {
        if (!node) return;
        node.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
                event.preventDefault();
                handler(event);
            }
        });
    }

    var toastTimers = [];

    function toast(heading, text, colour) {
        var box = el('naerror');
        if (!box) return;
        var title = box.querySelector('.bolded');
        var body = el('errortext');
        if (title) title.innerHTML = escapeHtml(heading || 'NOTICE');
        if (body) {
            body.innerHTML = escapeHtml(text || '');
            body.style.color = colour || '#ffffff';
        }
        box.classList.remove('zoom-out');
        box.style.display = 'block';
        toastTimers.forEach(clearTimeout);
        toastTimers = [
            setTimeout(function () { box.classList.add('zoom-out'); }, 4200),
            setTimeout(function () {
                box.classList.remove('zoom-out');
                box.style.display = 'none';
                if (title) title.innerHTML = 'SORRY!';
                if (body) {
                    body.innerHTML = 'Done.';
                    body.style.color = '#ffffff';
                }
            }, 4420)
        ];
    }

    window.toast = toast;

    // Kept for markup that still calls the old helper.
    window.errorNA = function (what) {
        toast('SORRY!', 'The ' + (what || 'requested') + ' feature is not available here.');
    };

    function notice(text, heading, colour) { toast(heading || 'NOTICE', text, colour); }

    /* ------------------------------------------------------------------ *
     * Catalogues
     * ------------------------------------------------------------------ */

    var CATALOGS = {
        web: './assets/json/base.json',
        modded: './assets/json/modded.json',
        assisted: './assets/json/assisted.json',
        alpha: './assets/json/alpha.json',
        beta: './assets/json/beta.json'
    };

    var catalogCache = {};
    // The recovery tool writes this only after checking every file in each build.
    var upstreamAvailability = fetch('./mc/upstream-availability.json', { cache: 'no-cache' })
        .then(function (r) { return r.ok ? r.json() : []; })
        .catch(function () { return []; });

    function loadCatalog(path) {
        if (!catalogCache[path]) {
            catalogCache[path] = Promise.resolve()
                .then(function () {
                    if (typeof fetch !== 'function') throw new Error('fetch unavailable');
                    return fetch(path, { cache: 'no-cache' });
                })
                .then(function (res) {
                    if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + path);
                    return res.json();
                })
                .then(function (list) {
                    return upstreamAvailability.then(function (available) {
                    return (Array.isArray(list) ? list : []).map(function (item) {
                        var copy = {};
                        Object.keys(item).forEach(function (k) { copy[k] = item[k]; });
                        copy.link = item.link || item.path || '';
                        copy.path = copy.link;
                        var folder = decodeURIComponent(copy.link.split('?')[0]).replace(/^\.\//, '').replace(/\/$/, '');
                        if (copy.disabled && Array.isArray(available) && available.indexOf(folder) !== -1) {
                            copy.active = true;
                            delete copy.disabled;
                            delete copy.note;
                        }
                        return copy;
                    });
                    });
                })
                .catch(function (err) {
                    console.warn('[ampler] could not load ' + path, err);
                    return [];
                });
        }
        return catalogCache[path];
    }

    function linksFor(entry) {
        var out = [];
        var link = (entry && (entry.link || entry.path)) || '';
        if (!link) return out;
        out.push(link);
        if (/\/$/.test(link)) out.push(link + 'index.html');
        else if (!/\.html?$/i.test(link)) out.push(link + '/index.html');
        return out;
    }

    /* ------------------------------------------------------------------ *
     * Editions
     * ------------------------------------------------------------------ */

    var EDITIONS = {
        web: {
            catalog: CATALOGS.web,
            storeKey: 'basegame',
            label: 'EAGLERCRAFT WEB EDITION',
            background: './assets/images/web-edition.jpg',
            title: './assets/images/web-title.png',
            sidebar: 'gtabs2',
            hiddenHeaders: ['header2', 'header7', 'header8', 'header9', 'header10'],
            modsVisible: false
        },
        assisted: {
            catalog: CATALOGS.assisted,
            storeKey: 'assisted',
            label: 'EAGLERCRAFT MOBILE/CONTROLLER',
            background: './assets/images/controls-edition.jpg',
            title: './assets/images/controls-title.png',
            sidebar: 'gtabs4',
            hiddenHeaders: ['header2', 'header5', 'header7', 'header8', 'header9', 'header10'],
            modsVisible: false
        },
        modded: {
            catalog: CATALOGS.modded,
            storeKey: 'moddedgame',
            label: 'EAGLERCRAFT MODDED',
            background: './assets/images/modded-edition.jpg',
            title: './assets/images/modded-title.png',
            sidebar: 'gtabs3',
            hiddenHeaders: ['header5', 'header7', 'header8', 'header9', 'header10'],
            modsVisible: true
        },
        alpha: {
            catalog: CATALOGS.alpha,
            storeKey: 'alphagame',
            label: 'EAGLERCRAFT ALPHA',
            background: './assets/images/web-edition.jpg',
            title: './assets/images/web-title.png',
            sidebar: 'gtabs12',
            hiddenHeaders: [],
            modsVisible: false
        },
        beta: {
            catalog: CATALOGS.beta,
            storeKey: 'betagame',
            label: 'EAGLERCRAFT BETA',
            background: './assets/images/web-edition.jpg',
            title: './assets/images/web-title.png',
            sidebar: 'gtabs13',
            hiddenHeaders: [],
            modsVisible: false
        },
        custom: {
            // Not a catalogue: this edition is the user's own installations and
            // nothing else. It is the Web Edition play screen, scoped.
            catalog: null,
            storeKey: 'customgame',
            label: 'CUSTOM INSTALLATIONS',
            background: './assets/images/web-edition.jpg',
            title: './assets/images/web-title.png',
            sidebar: 'gtabs10',
            hiddenHeaders: [],
            modsVisible: false,
            customOnly: true
        },
        downloads: {
            catalog: null,
            label: 'OFFLINE DOWNLOADS',
            background: '',
            title: '',
            sidebar: 'gtabs9',
            hiddenHeaders: ['header1', 'header3', 'header4', 'header5', 'header6',
                'header7', 'header8', 'header9', 'header10', 'header11'],
            modsVisible: false
        },
        credits: {
            catalog: null,
            label: 'CREDITS / CONTRIBUTORS',
            background: '',
            title: '',
            sidebar: 'gtabs5',
            hiddenHeaders: ['header1', 'header2', 'header3', 'header4', 'header5', 'header6',
                'header9', 'header10', 'header11', 'header12'],
            modsVisible: false
        },
        settings: {
            catalog: null,
            label: 'SETTINGS',
            background: '',
            title: '',
            sidebar: 'gtabs6',
            hiddenHeaders: ['header1', 'header2', 'header3', 'header4', 'header5', 'header6',
                'header7', 'header8', 'header11', 'header12'],
            modsVisible: false
        }
    };

    var HEADER_TABS = {
        play: 'header1', mods: 'header2', faq: 'header3', installations: 'header4',
        custom: 'header1', skins: 'header5', patchnotes: 'header6',
        servers: 'header11', downloads: 'header12',
        credits: 'header8'
    };

    var VIEWS = ['game-bg', 'mods', 'faq', 'installations', 'skinsview',
        'patchNotes', 'servers', 'downloads', 'credits', 'settings'];

    var DEFAULT_VIEWS = ['play', 'mods', 'faq', 'installations', 'custom',
        'skins', 'patchnotes', 'servers', 'downloads'];

    var state = {
        edition: 'web',
        catalogPath: CATALOGS.web,
        selected: {},
        mods: [],
        view: 'play',
        servers: {},
        branding: sGet('mcBranding') === 'true',
        fpsBoost: sGet('fpsBoost') !== 'false'
    };

    window.launcher = CATALOGS.web;

    /* ------------------------------------------------------------------ *
     * View switching
     * ------------------------------------------------------------------ */

    function showView(name) {
        // Leaving the Custom Installations play screen hands the chrome back to
        // the Web Edition, so a header tab never shows under a rail that still
        // says "Custom".
        if (state.edition === 'custom' && name !== 'play') {
            state.edition = 'web';
            state.catalogPath = CATALOGS.web;
            window.launcher = CATALOGS.web;
            applyEditionChrome(EDITIONS.web);
            markSidebar(EDITIONS.web.sidebar);
            buildDropdown();
        }
        state.view = name;
        syncHeaderTabs();
        VIEWS.forEach(function (id) {
            var node = el(id);
            if (node) node.style.display = 'none';
        });

        // The launch bar belongs to the screens that launch something; the
        // stats widget stays on Play.
        var launcherViews = ['play', 'installations'];
        var bar = el('gameSelection');
        if (bar) bar.style.display = launcherViews.indexOf(name) !== -1 ? 'flex' : 'none';
        var stats = document.querySelector('.stats-widget');
        if (stats) stats.style.display = name === 'play' ? 'flex' : 'none';

        var target = {
            play: 'game-bg',
            mods: 'mods',
            faq: 'faq',
            installations: 'installations',
            skins: 'skinsview',
            patchnotes: 'patchNotes',
            servers: 'servers',
            downloads: 'downloads',
            credits: 'credits',
            generalsettings: 'settings',
            aboutsettings: 'settings'
        }[name];

        if (name === 'generalsettings' || name === 'aboutsettings') {
            if (el('generalsettings')) el('generalsettings').style.display = name === 'generalsettings' ? 'block' : 'none';
            if (el('aboutsettings')) el('aboutsettings').style.display = name === 'aboutsettings' ? 'block' : 'none';
        }

        if (target && el(target)) {
            el(target).style.display = 'flex';
        }

        // Header tab highlight
        Object.keys(HEADER_TABS).forEach(function (key) {
            var tab = el(HEADER_TABS[key]);
            if (!tab) return;
            tab.classList.toggle('selected', key === name);
        });

        closeDropdown();
        closeQuickSettings();

        if (name === 'skins' && typeof window.renderSkins === 'function') window.renderSkins();
        if (name === 'mods') renderMods();
        if (name === 'faq') renderFaq();
        if (name === 'patchnotes') renderPatchNotes();
        if (name === 'servers') renderServers();
        if (name === 'downloads') renderDownloads();
        if (name === 'installations') renderInstallations();
        if (name === 'generalsettings' || name === 'aboutsettings') syncQuickSettings();
        // The What's New block only stays lit while the notes are on screen.
        if (el('whatsnew') && name !== 'patchnotes') el('whatsnew').classList.remove('selected');
        if (name === 'credits') renderCredits();
    }

    window.showView = showView;

    /* Custom Installations borrows the Play screen, so Play reloads the edition
       it belongs to instead of reusing whatever bar was left behind. */
    window.playheader = function () {
        if (state.edition === 'custom' || !state.catalogPath) { setEdition('web'); return; }
        showView('play');
    };
    window.modsheader = function () { showView('mods'); };
    window.faqsheader = function () { showView('faq'); };
    window.faqheader = window.faqsheader;
    window.installationheader = function () { showView('installations'); };
    window.skinsheader = function () { showView('skins'); };
    window.patchnotesheader = function () { showView('patchnotes'); };
    window.serversheader = function () { showView('servers'); };
    window.downloadsheader = function () { showView('downloads'); };
    window.creditsheader = function () { showView('credits'); };
    window.generalsettingsheader = function () { showView('generalsettings'); };
    window.aboutsettingsheader = function () { showView('aboutsettings'); };

    /* ------------------------------------------------------------------ *
     * Sidebar / editions
     * ------------------------------------------------------------------ */

    function markSidebar(id) {
        ['whatsnew', 'gtabs2', 'gtabs3', 'gtabs4', 'gtabs12', 'gtabs13',
            'gtabs5', 'gtabs6', 'gtabs10']
            .forEach(function (key) {
                var node = el(key);
                if (node) node.classList.toggle('selected', key === id);
            });
    }

    /* The header strip keeps every destination in every section. Contributors
       and Credits are not part of it: the Credits screen is reached from the
       sidebar and shows its own single tab. */
    function syncHeaderTabs() {
        /* The strip belongs to the browsing screens. Credits and Settings are
           sidebar destinations with no tabs, exactly like Credits always was. */
        var chromeOnly = state.view === 'credits' || state.view === 'generalsettings' ||
            state.view === 'aboutsettings' || state.edition === 'credits' || state.edition === 'settings';
        for (var i = 1; i <= 12; i++) {
            var tab = el('header' + i);
            if (!tab) continue;
            tab.style.display = chromeOnly ? 'none' : 'block';
        }
        var strip = document.querySelector('.gameTabs');
        if (strip) strip.style.display = chromeOnly ? 'none' : 'flex';
    }

    function applyEditionChrome(conf) {
        if (el('gameedition')) el('gameedition').innerHTML = escapeHtml(conf.label);

        var bg = el('game-bg');
        if (bg) {
            bg.style.backgroundImage = conf.background ? 'url(' + conf.background + ')' : 'none';
        }
        var title = el('game-title');
        if (title) {
            title.style.display = conf.title ? 'block' : 'none';
            if (conf.title) title.src = conf.title;
        }

        syncHeaderTabs();
        markSidebar(conf.sidebar);

        var picker = el('drop');
        if (picker) {
            picker.setAttribute('aria-haspopup', 'listbox');
            picker.setAttribute('tabindex', '0');
        }
        closeDropdown();
    }

    function setEdition(key, keepView) {
        var conf = EDITIONS[key];
        if (!conf) return;
        state.edition = key;

        applyEditionChrome(conf);

        var drop = el('drop');
        if (drop) drop.style.display = key === 'downloads' || key === 'credits' || key === 'settings' ? 'none' : 'flex';

        if (key === 'downloads') {
            state.catalogPath = null;
            window.launcher = null;
            showView('downloads');
            return;
        }

        if (key === 'credits') {
            state.catalogPath = null;
            window.launcher = null;
            showView(keepView || 'credits');
            return;
        }

        if (key === 'settings') {
            state.catalogPath = null;
            window.launcher = null;
            showView('generalsettings');
            return;
        }

        state.catalogPath = conf.catalog;
        window.launcher = conf.catalog;

        if (conf.customOnly) {
            // Same screen as the Web Edition, but the picker is your own builds.
            showView('play');
            markSidebar(conf.sidebar);
            var own = customInstallations();
            var mine = findEntry(own, sJSON(conf.storeKey, null)) || own[0] || null;
            if (mine) selectEntry(mine, false);
            else emptyLaunchBar();
            buildDropdown();
            closeDropdown();
            return;
        }

        entriesForEdition().then(function (list) {
            var saved = sJSON(conf.storeKey, null);
            var entry = findEntry(list, saved);
            if (!entry || entry.disabled) entry = list.filter(function (x) { return x.active && !x.disabled; })[0];
            if (entry) {
                if (saved) sSet(conf.storeKey, JSON.stringify(saved));
                else sSet(conf.storeKey, JSON.stringify(entry));
                selectEntry(entry, false);
            }
            else emptyLaunchBar();
            buildDropdown();
        });
        showView('play');
        if (keepView) showView(keepView);
    }

    function findEntry(list, saved) {
        if (!saved || !list) return null;
        for (var i = 0; i < list.length; i++) {
            if (list[i].title === saved.title) return list[i];
        }
        return null;
    }

    window.webedition = function () { setEdition('web'); };
    window.moddededition = function () { setEdition('modded'); };
    window.alphaedition = function () { setEdition('alpha'); };
    window.betaedition = function () { setEdition('beta'); };
    window.eaglercontrols = function () { setEdition('assisted'); };
    /* Two different jobs, deliberately kept apart:
       - Custom Installations (sidebar) is a play screen scoped to your builds.
       - Installations (header tab) is the manager: create/upload, and see and
         tick every build you have. */
    window.custominstallationsmenu = function () { setEdition('custom'); };
    window.installationsmenu = function () {
        if (!EDITIONS[state.edition] || !state.catalogPath) setEdition('web');
        showView('installations');
    };
    window.downloadsmenu = function () { setEdition('downloads'); };
    window.creditsmenu = function () { setEdition('credits', 'credits'); };
    window.settingsmenu = function () { setEdition('settings'); };

    /* ------------------------------------------------------------------ *
     * Dropdown (version picker)
     * ------------------------------------------------------------------ */

    var SVG_UP = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="dropdownIcon"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 15l6 -6l6 6" /></svg>';
    var SVG_DOWN = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="dropdownIcon"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 9l6 6l6 -6" /></svg>';

    function entryLabel(entry) {
        return (entry && (entry.displayName || entry.title)) || '';
    }

    function isPresetsOn() {
        return sGet('launcherpresets') !== 'false';
    }

    function isEntryEnabled(entry) {
        if (entry && entry.disabled) return true;
        if (isPresetsOn()) {
            var flag = sGet('ampler.on.' + entry.title);
            return flag === null ? entry.active !== false : flag === 'true';
        }
        return sGet('ampler.on.' + entry.title) === 'true';
    }

    function storeKeyForEdition() {
        var conf = EDITIONS[state.edition];
        return (conf && conf.storeKey) || 'basegame';
    }

    // Preset builds plus the installations the user created for this edition.
    function entriesForEdition() {
        var conf = EDITIONS[state.edition] || {};
        // The custom edition never reads a catalogue - only what the user built.
        if (conf.customOnly) return Promise.resolve(customInstallations());
        var storeKey = storeKeyForEdition();
        return loadCatalog(state.catalogPath || CATALOGS.web).then(function (list) {
            var custom = customInstallations().filter(function (e) { return e.custom === storeKey; });
            return list.concat(custom);
        });
    }

    function currentEntries() {
        return entriesForEdition().then(function (list) {
            var visible = list.filter(isEntryEnabled);
            if (!visible.length) visible = list.filter(function (x) { return x.active; }).slice(0, 1);
            return visible;
        });
    }

    function buildDropdown() {
        var menu = el('dropdn');
        var conf = EDITIONS[state.edition] || {};
        if (!menu || (!state.catalogPath && !conf.customOnly)) return Promise.resolve();
        return currentEntries().then(function (list) {
            menu.innerHTML = '';
            if (!list.length) {
                // Nothing to pick: say so, and point at the screen that fixes it.
                var hint = document.createElement('div');
                hint.className = 'dropdownOptions emptyOption';
                hint.innerHTML = '<div class="dropdownOption"><div class="dropdownOptionText">' +
                    '<p class="bolded">No installations yet</p>' +
                    '<p>Add one with New installation</p></div></div>';
                hint.addEventListener('click', function () { showView('installations'); });
                menu.appendChild(hint);
                return;
            }
            list.forEach(function (entry) {
                var row = document.createElement('div');
                row.className = 'dropdownOptions' + (entry.disabled ? ' disabled' : '');
                row.setAttribute('role', 'option');
                row.setAttribute('data-title', entry.title);
                row.innerHTML =
                    '<div class="dropdownOption">' +
                    '<img src="' + escapeHtml(entry.icon) + '" alt="">' +
                    '<div class="dropdownOptionText">' +
                    '<p class="bolded">' + escapeHtml(entryLabel(entry)) + '</p>' +
                    '<p>' + escapeHtml(entry.disabled ? (entry.note || entry.version) : entry.version) + '</p>' +
                    '</div></div>';
                if (entry.disabled) {
                    // Visible but inert: no hover state, no pointer, clicks ignored.
                    row.setAttribute('aria-disabled', 'true');
                    menu.appendChild(row);
                    return;
                }
                row.setAttribute('tabindex', '0');
                row.addEventListener('click', function () {
                    selectEntry(entry, true);
                    closeDropdown();
                });
                onKey(row, function () {
                    selectEntry(entry, true);
                    closeDropdown();
                });
                menu.appendChild(row);
            });
            markSelectedRow();
            wireMenuKeys();
            revealRow(selectedRowInMenu());
        });
    }

    /* Keeping the row you are on next to the Play button
       ------------------------------------------------------------------
       The list is taller than the screen, so whatever moves the cursor has
       to move the list with it. Left to itself the browser parks the focused
       row somewhere near the bottom edge and the whole panel shifts with it;
       instead we focus without scrolling and then place the row ourselves,
       a little above the bottom edge, so the next row and the Play button
       under the list stay in view. */

    function rowHeight(row) {
        return (row && row.offsetHeight) || 0;
    }

    function revealRow(row) {
        var menu = el('dropdn');
        if (!menu || !row) return;
        var step = rowHeight(row);
        if (!step) return;
        // Counterweight: land the row this far above the bottom edge.
        var pad = Math.round(step * 0.75);
        var top = row.offsetTop;
        var bottom = top + step;
        if (bottom + pad > menu.scrollTop + menu.clientHeight) {
            menu.scrollTop = bottom + pad - menu.clientHeight;
        } else if (top - pad < menu.scrollTop) {
            menu.scrollTop = top - pad;
        }
    }

    function focusRow(row) {
        if (!row) return false;
        // preventScroll stops the browser's own jump; revealRow does it once.
        try { row.focus({ preventScroll: true }); } catch (e) { row.focus(); }
        revealRow(row);
        return true;
    }

    function focusableRows() {
        var menu = el('dropdn');
        if (!menu) return [];
        return Array.prototype.filter.call(menu.children, function (row) {
            return row.hasAttribute('tabindex') && !row.classList.contains('disabled');
        });
    }

    function selectedRowInMenu() {
        var menu = el('dropdn');
        if (!menu) return null;
        var current = state.selected[state.edition] && state.selected[state.edition].title;
        var rows = focusableRows();
        for (var i = 0; i < rows.length; i++) {
            if (rows[i].getAttribute('data-title') === current) return rows[i];
        }
        return rows[0] || null;
    }

    /* Arrow keys walk the list and carry the scroll with them; running off the
       last row hands the cursor to the Play button under the list. */
    function wireMenuKeys() {
        var menu = el('dropdn');
        if (!menu || menu.getAttribute('data-keys') === 'on') return;
        menu.setAttribute('data-keys', 'on');
        menu.addEventListener('keydown', function (event) {
            var rows = focusableRows();
            if (!rows.length) return;
            var index = rows.indexOf(document.activeElement);
            var jump = event.key === 'ArrowDown' ? 1 : (event.key === 'ArrowUp' ? -1 : 0);

            if (jump) {
                event.preventDefault();
                var next = index + jump;
                if (next < 0) { focusRow(rows[0]); return; }
                if (next >= rows.length) {
                    var play = el('playbutton');
                    closeDropdown();
                    if (play) {
                        play.focus({ preventScroll: true });
                        if (play.scrollIntoView) play.scrollIntoView({ block: 'nearest' });
                    }
                    return;
                }
                focusRow(rows[next]);
                return;
            }
            if (event.key === 'Home') { event.preventDefault(); focusRow(rows[0]); return; }
            if (event.key === 'End') { event.preventDefault(); focusRow(rows[rows.length - 1]); return; }
            if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
                if (index === -1) return;
                event.preventDefault();
                rows[index].click();
            }
        });
    }

    function markSelectedRow() {
        var menu = el('dropdn');
        if (!menu) return;
        var current = state.selected[state.edition] && state.selected[state.edition].title;
        Array.prototype.forEach.call(menu.children, function (row) {
            row.setAttribute('aria-selected', row.getAttribute('data-title') === current ? 'true' : 'false');
        });
    }

    /* No custom installations yet: the bar says so and Play does nothing. */
    function emptyLaunchBar() {
        if (el('gametitle')) el('gametitle').textContent = 'No installations yet';
        if (el('gameversion')) el('gameversion').textContent = 'Add one in Installations';
        if (el('gameicon')) el('gameicon').src = './assets/images/mc-icons/hopper.png';
        var play = el('playbutton');
        if (play) {
            play.removeAttribute('href');
            play.classList.add('playDisabled');
            play.setAttribute('aria-disabled', 'true');
        }
        var picker = el('drop');
        if (picker) picker.classList.add('emptyPicker');
    }

    function selectEntry(entry, remember) {
        if (!entry || entry.disabled) return;
        state.selected[state.edition] = entry;

        if (el('gametitle')) el('gametitle').textContent = entryLabel(entry);
        if (el('gameversion')) el('gameversion').textContent = entry.version;
        if (el('gameicon')) el('gameicon').src = entry.icon;

        var play = el('playbutton');
        if (play) {
            play.href = entry.link;
            play.classList.remove('playDisabled');
            play.removeAttribute('aria-disabled');
        }
        var picker = el('drop');
        if (picker) picker.classList.remove('emptyPicker');

        var storeKey = EDITIONS[state.edition] && EDITIONS[state.edition].storeKey;
        if (remember && storeKey) sSet(storeKey, JSON.stringify(entry));

        markSelectedRow();
    }

    function openDropdown() {
        var menu = el('dropdn');
        if (!menu) return Promise.resolve();
        return buildDropdown().then(function () {
            menu.style.visibility = 'visible';
            if (el('dropdownuparrow')) el('dropdownuparrow').innerHTML = SVG_UP;
            if (el('drop')) el('drop').setAttribute('aria-expanded', 'true');
            // Open with the build you are on sitting just above the Play button.
            revealRow(selectedRowInMenu());
        });
    }

    function closeDropdown() {
        var menu = el('dropdn');
        if (menu) menu.style.visibility = 'hidden';
        if (el('dropdownuparrow')) el('dropdownuparrow').innerHTML = SVG_DOWN;
        if (el('drop')) el('drop').setAttribute('aria-expanded', 'false');
    }

    window.dropdowntoggle = function () {
        var menu = el('dropdn');
        if (!menu) return;
        if (menu.style.visibility === 'visible') closeDropdown();
        else openDropdown();
    };

    /* ------------------------------------------------------------------ *
     * Mods (Modketplace -> EaglerForge ModAPI)
     * ------------------------------------------------------------------ */

    var modsData = null;

    function syncModsToStorage() {
        var enabled = state.mods.slice();
        sSet('modslauncher', JSON.stringify(enabled));
        // EaglerForge's ModAPI reads ml::Mods; keep both in step so the mods are
        // present even if the game page is opened directly.
        sSet('ml::Mods', JSON.stringify(enabled.map(function (link) {
            return 'mods/' + String(link).replace(/^\.?\/?mods\//, '');
        })));
    }

    function modFileName(mod) {
        return String((mod && mod.link) || '').replace(/^\.?\/?(mods\/)?/, '');
    }

    function modFileUrl(mod) {
        return './mc/Eaglerforge/mods/' + encodeURIComponent(modFileName(mod));
    }

    /* Saves the mod's .js to the user's machine so it can be dropped into any
       EaglerForge client. The same file already ships in mc/Eaglerforge/mods/,
       so what is downloaded is byte-for-byte the mod the launcher loads. */
    function downloadMod(mod) {
        var file = modFileName(mod);
        if (!file) return false;
        var done = function (ok) {
            notice(ok
                ? 'Installed ' + file + ' - check your downloads, then drop it in your client\'s mods folder.'
                : 'Could not install ' + file + ' - the file did not load.',
                'MOD INSTALL', ok ? '#7CFC98' : '#FF9B9B');
        };
        if (typeof fetch !== 'function') { done(false); return false; }
        fetch(modFileUrl(mod)).then(function (r) {
            if (!r || !r.ok) throw new Error('missing mod file');
            return r.blob();
        }).then(function (blob) {
            if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
                done(true);
                return;
            }
            var href = URL.createObjectURL(blob);
            var link = document.createElement('a');
            link.href = href;
            link.download = file;
            link.rel = 'noopener';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(function () { URL.revokeObjectURL(href); }, 4000);
            done(true);
        }).catch(function () { done(false); });
        return true;
    }

    window.downloadmod = function (title) {
        var mod = (modsData || []).filter(function (m) { return m.title === title; })[0];
        return mod ? downloadMod(mod) : false;
    };

    function renderMods() {
        var box = el('modsbox');
        if (!box) return;
        var render = function (list) {
            modsData = list;
            box.innerHTML = '';
            list.forEach(function (mod) {
                var on = sGet('mod.' + mod.title) === 'true';
                var card = document.createElement('div');
                card.className = 'modoption' + (on ? ' selected' : '');
                card.setAttribute('role', 'checkbox');
                card.setAttribute('tabindex', '0');
                card.setAttribute('aria-checked', on ? 'true' : 'false');
                card.innerHTML =
                    '<img src="' + escapeHtml(mod.icon) + '" alt="">' +
                    '<div class="moddetails">' +
                    '<p class="bolded modtitle">' + escapeHtml(mod.title) + '</p>' +
                    '<p class="modauthor">' + escapeHtml(mod.author) + '</p>' +
                    '<p>' + escapeHtml(mod.description) + '</p>' +
                    '</div>' +
                    '<button type="button" class="moddownload" data-modfile="' +
                    escapeHtml(modFileName(mod)) + '" aria-label="Download ' +
                    escapeHtml(modFileName(mod)) + '">Download .js</button>';

                var toggle = function () {
                    var nowOn = sGet('mod.' + mod.title) === 'true';
                    if (nowOn) {
                        sRemove('mod.' + mod.title);
                        state.mods = state.mods.filter(function (m) { return m !== mod.link; });
                        card.classList.remove('selected');
                        card.setAttribute('aria-checked', 'false');
                    } else {
                        sSet('mod.' + mod.title, 'true');
                        if (state.mods.indexOf(mod.link) === -1) state.mods.push(mod.link);
                        card.classList.add('selected');
                        card.setAttribute('aria-checked', 'true');
                    }
                    syncModsToStorage();
                    notice((nowOn ? 'Removed ' : 'Added ') + mod.title + '. Reload the game to apply.',
                        'MODS', '#7CFC98');
                };

                card.addEventListener('click', toggle);
                onKey(card, toggle);

                var dl = card.querySelector('.moddownload');
                if (dl) {
                    var save = function (ev) {
                        // The card is the toggle; the button is its own action.
                        if (ev && ev.stopPropagation) ev.stopPropagation();
                        if (ev && ev.preventDefault) ev.preventDefault();
                        downloadMod(mod);
                    };
                    dl.addEventListener('click', save);
                    dl.addEventListener('keydown', function (ev) {
                        if (ev.key === 'Enter' || ev.key === ' ') save(ev);
                    });
                }

                box.appendChild(card);
            });
        };

        fetch('./mc/Eaglerforge/ModLoader.js', { method: 'HEAD', cache: 'no-cache' })
            .then(function (r) { if (!r.ok) throw new Error('EaglerForge is missing'); })
            .then(function () {
                if (modsData) return modsData;
                return fetch('./assets/json/mods.json', { cache: 'no-cache' }).then(function (r) {
                    if (!r.ok) throw new Error('mod list is missing');
                    return r.json();
                });
            }).then(render)
            .catch(function () { box.textContent = 'EaglerForge and its mod files are not installed. Run the upstream recovery tool.'; });
    }

    /* ------------------------------------------------------------------ *
     * FAQ + Patch notes
     * ------------------------------------------------------------------ */

    var faqData = null;

    function renderFaq() {
        var box = el('faqbox');
        if (!box) return;
        var render = function (list) {
            faqData = list;
            box.innerHTML = '';
            list.forEach(function (item) {
                var wrap = document.createElement('div');
                wrap.className = 'faqoption';
                wrap.innerHTML =
                    '<div class="bolded faqtext"><p class="faqsymbol">Q</p><p>' + escapeHtml(item.question) + '</p></div>' +
                    '<div class="faqtext"><p class="bolded faqsymbol">A</p><p>' + escapeHtml(item.answer) + '</p></div>';
                box.appendChild(wrap);
            });
        };
        if (faqData) { render(faqData); return; }
        fetch('./assets/json/faqs.json', { cache: 'no-cache' })
            .then(function (r) { return r.json(); })
            .then(render)
            .catch(function () {});
    }

    var notesData = null;
    var noteFilters = { game: true, site: true };

    function renderPatchNotes() {
        var box = el('patchnotesbox');
        if (!box) return;
        var render = function (list) {
            notesData = list;
            box.innerHTML = '';
            list.forEach(function (note) {
                if (note.type && !noteFilters[note.type]) return;
                var card = document.createElement('div');
                card.className = 'patchnote';
                card.setAttribute('tabindex', '0');
                card.innerHTML =
                    '<img src="./assets/images/' + escapeHtml(note.icon) + '" alt="">' +
                    '<div class="bolded patchnotedetails"><p>' + escapeHtml(note.title) + '</p><p>' + escapeHtml(note.version) + '</p></div>';
                card.addEventListener('click', function () { openNote(note); });
                onKey(card, function () { openNote(note); });
                box.appendChild(card);
            });
            if (!box.children.length) box.innerHTML = '<p>Nothing matches those filters.</p>';
            renderNotesIndex(list);
        };
        if (notesData) { render(notesData); return; }
        fetch('./assets/json/patchnotes.json', { cache: 'no-cache' })
            .then(function (r) { return r.json(); })
            .then(render)
            .catch(function () {});
    }

    window.sortnote = function (type) {
        noteFilters[type] = !noteFilters[type];
        renderPatchNotes();
    };

    function openScreen(title, html) {
        var menu = el('externalmenu');
        if (!menu) return;
        menu.innerHTML =
            '<div class="bolded notescreenheader">' +
            '<p>' + escapeHtml(title) + '</p>' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" onclick="closenotescreen()"><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>' +
            '</div><hr><div class="notescreendetails">' + html + '</div>';
        menu.style.display = 'flex';
    }

    /* A patch note opens inside this screen: the release list is swapped for
       the note itself, so nothing covers the launcher. */
    function renderNotesIndex(list) {
        var index = el('patchnotesindex');
        if (!index) return;
        index.innerHTML = '';
        (list || []).forEach(function (note, i) {
            if (note.type && !noteFilters[note.type]) return;
            var row = document.createElement('div');
            row.className = 'notesIndexRow' + (note.latest ? ' latest' : '');
            row.setAttribute('tabindex', '0');
            row.setAttribute('role', 'button');
            row.innerHTML = '<span class="notesIndexVersion">' + escapeHtml(note.version) + '</span>' +
                '<span class="notesIndexName">' + escapeHtml(note.title) + '</span>';
            row.addEventListener('click', function () { openNote(note); });
            onKey(row, function () { openNote(note); });
            index.appendChild(row);
        });
    }

    function openNote(note) {
        var detail = el('patchnotedetail');
        var list = (note.notes || []).map(function (line) {
            return '<li>' + escapeHtml(line) + '</li>';
        }).join('');
        if (!detail) return;
        detail.innerHTML =
            '<div class="patchnoteDetailHead">' +
            '<img src="./assets/images/' + escapeHtml(note.icon) + '" alt="">' +
            '<div>' +
            '<p class="bolded patchnoteDetailTitle">' + escapeHtml(note.title) + '</p>' +
            '<p class="patchnoteDetailMeta">' + escapeHtml(note.version) + ' &middot; ' + escapeHtml(note.date) + '</p>' +
            '</div>' +
            '<div class="classicbutton" role="button" tabindex="0" onclick="closenotescreen()"><p class="bolded">Back to all versions</p></div>' +
            '</div>' +
            '<p class="patchnoteDetailDesc">' + escapeHtml(note.description) + '</p>' +
            (list ? '<ul class="patchnotelist">' + list + '</ul>' : '<p>Full log coming soon.</p>');
        detail.hidden = false;
        ['patchnotesbox', 'patchnotesindex'].forEach(function (id) {
            var node = el(id);
            if (node) node.style.display = 'none';
        });
        var screen = el('patchNotes');
        if (screen) screen.scrollTop = 0;
    }

    window.closenotescreenpatch = function () { window.closenotescreen(); };

    window.generaterecentnote = function () {
        showView('patchnotes');
        markSidebar('whatsnew');
        fetch('./assets/json/patchnotes.json', { cache: 'no-cache' })
            .then(function (r) { return r.json(); })
            .then(function (list) {
                if (!list || !list.length) return;
                notesData = list;
                renderNotesIndex(list);
                openNote(list[0]);
            })
            .catch(function () {});
    };

    window.closenotescreen = function () {
        var menu = el('externalmenu');
        if (menu) {
            menu.style.display = 'none';
            menu.innerHTML = '';
        }
        var detail = el('patchnotedetail');
        if (detail) { detail.hidden = true; detail.innerHTML = ''; }
        ['patchnotesbox', 'patchnotesindex'].forEach(function (id) {
            var node = el(id);
            if (node) node.style.display = '';
        });
    };


    /* ------------------------------------------------------------------ *
     * Credits (assets/json/credits.json)
     * ------------------------------------------------------------------ */

    var creditsData = null;

    function renderCredits() {
        var box = el('creditsbox');
        if (!box) return;
        var paint = function (list) {
            creditsData = list;
            box.innerHTML = '';
            list.forEach(function (person, index) {
                var card = document.createElement('div');
                card.className = 'credittile';
                card.setAttribute('tabindex', '0');
                card.setAttribute('role', 'button');
                card.setAttribute('data-credit', String(index));
                card.innerHTML =
                    '<img src="./assets/images/' + escapeHtml(person.icon) + '" alt="" loading="lazy">' +
                    '<div class="creditside">' +
                    '<p class="bolded contributoruser">' + escapeHtml(person.name) + '</p>' +
                    '<p class="creditrole">' + escapeHtml(person.role) + '</p>' +
                    '<p class="contributordescription">' + escapeHtml(person.blurb) + '</p>' +
                    '</div>';
                card.addEventListener('click', function () { openCredit(index); });
                onKey(card, function () { openCredit(index); });
                box.appendChild(card);
            });
        };
        if (creditsData) { paint(creditsData); return; }
        fetch('./assets/json/credits.json', { cache: 'no-cache' })
            .then(function (r) { return r.json(); })
            .then(paint)
            .catch(function () { box.innerHTML = '<p>Could not load the credits list.</p>'; });
    }

    function openCredit(index) {
        var person = (creditsData || [])[index];
        var detail = el('creditdetail');
        var grid = el('creditsbox');
        if (!person || !detail) return;

        var items = (person.contributions || []).map(function (line) {
            return '<li>' + escapeHtml(line) + '</li>';
        }).join('');

        detail.innerHTML =
            '<div class="creditDetailHead">' +
            '<img src="./assets/images/' + escapeHtml(person.icon) + '" alt="">' +
            '<div>' +
            '<p class="bolded contactname">' + escapeHtml(person.name) + '</p>' +
            '<p class="creditrole">' + escapeHtml(person.role) + '</p>' +
            (person.url ? '<a class="creditlink" href="' + escapeHtml(person.url) + '" target="_blank" rel="noopener">' + escapeHtml(person.url.replace(/^https?:\/\//, '')) + '</a>' : '') +
            '</div>' +
            '<div class="classicbutton creditBack" role="button" tabindex="0" onclick="closeCredit()"><p class="bolded">Back to credits</p></div>' +
            '</div>' +
            '<p class="creditblurb">' + escapeHtml(person.blurb) + '</p>' +
            '<p class="bolded settingstitle">Everything they contributed</p>' +
            '<ul class="creditlist">' + items + '</ul>';

        detail.hidden = false;
        if (grid) grid.style.display = 'none';
        var screen = el('credits');
        if (screen) screen.scrollTop = 0;
    }

    window.closeCredit = function () {
        var detail = el('creditdetail');
        var grid = el('creditsbox');
        if (detail) { detail.hidden = true; detail.innerHTML = ''; }
        if (grid) grid.style.display = '';
    };

    /* ------------------------------------------------------------------ *
     * Installations
     * ------------------------------------------------------------------ */

    function customInstallations() {
        var ids = sJSON('customlaunchers', []);
        return (Array.isArray(ids) ? ids : []).map(function (id) {
            return sJSON('c' + id, null);
        }).filter(Boolean);
    }

    /* --- Storage for self-contained installations ---------------------- *
     * A browser cannot re-open a file the user picked, so the HTML itself is
     * kept (IndexedDB, falling back to localStorage) and turned back into a
     * blob: URL on every load. That way a custom installation survives a
     * reload even when its source was a local file.
     * ------------------------------------------------------------------- */

    var DB_NAME = 'ampler-installer';
    var DB_STORE = 'html';
    var dbPromise = null;
    var htmlCache = {};

    function dbOpen() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise(function (resolve, reject) {
            if (!window.indexedDB) { reject(new Error('no indexedDB')); return; }
            var request = window.indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = function () {
                if (!request.result.objectStoreNames.contains(DB_STORE)) {
                    request.result.createObjectStore(DB_STORE);
                }
            };
            request.onsuccess = function () { resolve(request.result); };
            request.onerror = function () { reject(request.error || new Error('indexedDB error')); };
        });
        return dbPromise;
    }

    function dbRun(mode, run) {
        return dbOpen().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(DB_STORE, mode);
                var store = tx.objectStore(DB_STORE);
                var request = run(store);
                tx.oncomplete = function () { resolve(request ? request.result : undefined); };
                tx.onerror = function () { reject(tx.error || new Error('indexedDB transaction failed')); };
            });
        });
    }

    function saveInstallHtml(key, html) {
        htmlCache[key] = html;
        return dbRun('readwrite', function (store) { return store.put(html, key); })
            .catch(function () {
                try { sSet('amplerhtml.' + key, html); } catch (e) {
                    notice('This HTML is too large to store. Use a URL instead.', 'INSTALLATIONS');
                }
            });
    }

    function loadInstallHtml(key) {
        if (htmlCache[key] !== undefined) return Promise.resolve(htmlCache[key]);
        return dbRun('readonly', function (store) { return store.get(key); })
            .then(function (value) {
                if (typeof value === 'string') { htmlCache[key] = value; return value; }
                return sGet('amplerhtml.' + key);
            })
            .catch(function () { return sGet('amplerhtml.' + key); });
    }

    function dropInstallHtml(key) {
        delete htmlCache[key];
        sRemove('amplerhtml.' + key);
        dbRun('readwrite', function (store) { return store.delete(key); }).catch(function () {});
    }

    function blobFor(entry) {
        if (entry._blobUrl) return entry._blobUrl;
        var html = htmlCache[entry.title];
        if (typeof html !== 'string') return null;
        try {
            entry._blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
        } catch (e) {
            return null;
        }
        return entry._blobUrl;
    }

    function hydrateCustomInstallations() {
        var entries = customInstallations();
        return Promise.all(entries.map(function (entry) {
            var source = entry.source || {};
            if (source.kind !== 'html') return null;
            return loadInstallHtml(entry.title).then(function (html) {
                if (typeof html !== 'string') return null;
                htmlCache[entry.title] = html;
                var url = blobFor(entry);
                if (!url) return null;
                entry.link = url;
                entry.path = url;
                sSet('c' + entry.title, JSON.stringify(entry));
                var selected = state.selected[entry.custom];
                if (selected && selected.title === entry.title) selectEntry(entry, false);
            });
        }));
    }

    function storeKeyForStore(storeKey) {
        return storeKey === 'moddedgame' ? 'modded'
            : storeKey === 'assisted' ? 'assisted' : 'web';
    }

    function renderInstallations() {
        var box = el('installationsbox');
        if (!box) return;
        box.innerHTML = '';

        var own = customInstallations();
        var count = el('custominstallationscount');
        if (count) {
            count.textContent = own.length
                ? own.length + ' installation' + (own.length === 1 ? '' : 's') + ' of your own \u2014 tick one to show it in the version list.'
                : 'Nothing of your own yet \u2014 use New installation to upload or link a client.';
        }

        var groups = [
            { key: 'web', catalog: CATALOGS.web, storeKey: 'basegame', name: 'WEB EDITION' },
            { key: 'modded', catalog: CATALOGS.modded, storeKey: 'moddedgame', name: 'MODDED' },
            { key: 'assisted', catalog: CATALOGS.assisted, storeKey: 'assisted', name: 'MOBILE / CONTROLLER' }
        ];

        Promise.all(groups.map(function (g) { return loadCatalog(g.catalog); })).then(function (lists) {
            groups.forEach(function (g, index) {
                var heading = document.createElement('p');
                heading.className = 'bolded';
                heading.style.margin = '1.5vw 0 0.5vw';
                heading.textContent = g.name;
                box.appendChild(heading);
                box.appendChild(document.createElement('hr'));

                var list = lists[index];
                var current = sJSON(g.storeKey, null);

                if (isPresetsOn()) {
                    list.forEach(function (entry) {
                        box.appendChild(installationRow(entry, g.key, current));
                    });
                } else {
                    var only = findEntry(list, current) || list[0];
                    if (only) box.appendChild(installationRow(only, g.key, current));
                }

                customInstallations().forEach(function (entry) {
                    if (entry.custom !== g.storeKey) return;
                    box.appendChild(installationRow(entry, g.key, current, true));
                });
            });
        });
    }

    function installationRow(entry, editionKey, current, custom) {
        var row = document.createElement('div');
        row.className = 'installationOptions';

        var inner = document.createElement('div');
        inner.className = 'installationOption';

        var isCurrent = current && current.title === entry.title;

        var box = document.createElement('input');
        box.className = 'installationBox';
        box.type = 'checkbox';
        box.checked = isEntryEnabled(entry) || isCurrent;
        box.addEventListener('change', function () {
            sSet('ampler.on.' + entry.title, box.checked ? 'true' : 'false');
            buildDropdown();
            notice((box.checked ? 'Showing ' : 'Hiding ') + entryLabel(entry) + ' in the version list.', 'INSTALLATIONS');
        });

        var icon = document.createElement('img');
        icon.src = entry.icon;
        icon.alt = '';

        var text = document.createElement('div');
        text.className = 'installationOptionText';
        var title = document.createElement('p');
        title.className = 'bolded';
        title.textContent = entryLabel(entry);
        var version = document.createElement('p');
        version.textContent = entry.version;
        text.appendChild(title);
        text.appendChild(version);

        inner.appendChild(box);
        inner.appendChild(icon);
        inner.appendChild(text);
        row.appendChild(inner);

        if (custom) {
            var buttons = document.createElement('div');
            buttons.className = 'editbuttons';

            var rename = document.createElement('div');
            rename.className = 'classicbutton';
            rename.innerHTML = '<p class="bolded">Rename</p>';
            rename.addEventListener('click', function () { renameInstallation(entry); });

            var edit = document.createElement('div');
            edit.className = 'classicbutton';
            edit.innerHTML = '<p class="bolded">Edit</p>';
            edit.addEventListener('click', function () { editInstallation(entry); });

            var del = document.createElement('div');
            del.className = 'redbutton classicbutton';
            del.innerHTML = '<p class="bolded">Delete</p>';
            del.addEventListener('click', function () {
                confirmAction('Delete installation?', 'Remove "' + entryLabel(entry) + '" from this launcher.',
                    function () {
                        sRemove('c' + entry.title);
                        sSet('customlaunchers', JSON.stringify(
                            sJSON('customlaunchers', []).filter(function (x) { return x !== entry.title; })
                        ));
                        dropInstallHtml(entry.title);
                        renderInstallations();
                        buildDropdown();
                        if ((EDITIONS[state.edition] || {}).customOnly) setEdition('custom');
                    });
            });

            buttons.appendChild(rename);
            buttons.appendChild(edit);
            buttons.appendChild(del);
            row.appendChild(buttons);
        }

        return row;
    }

    function editionKeyForPath(path) {
        if (path === CATALOGS.web) return { storeKey: 'basegame', key: 'web' };
        if (path === CATALOGS.modded) return { storeKey: 'moddedgame', key: 'modded', catalog: CATALOGS.modded };
        return { storeKey: 'assisted', key: 'assisted', catalog: CATALOGS.assisted };
    }

    function saveCustomInstallation(data, existing) {
        var count = parseInt(sGet('customlaunchersnumber') || '0', 10) || 0;
        var id = ('0' + count).slice(-2) + 'cl' + data.name;
        var entry = {
            title: id,
            displayName: data.name,
            version: data.version,
            icon: data.icon,
            link: data.link,
            path: data.link,
            active: true,
            custom: data.storeKey,
            source: data.source
        };

        if (existing) {
            sRemove('c' + existing.title);
            if (existing.title !== id) dropInstallHtml(existing.title);
            sSet('customlaunchers', JSON.stringify(
                sJSON('customlaunchers', []).filter(function (x) { return x !== existing.title; })
            ));
        }

        if (data.source && data.source.kind === 'html' && typeof data.html === 'string') {
            saveInstallHtml(id, data.html);
        } else if (existing && !(data.source && data.source.kind === 'html')) {
            dropInstallHtml(existing.title);
        }

        var ids = sJSON('customlaunchers', []);
        ids.push(entry.title);
        sSet('customlaunchers', JSON.stringify(ids));
        sSet('customlaunchersnumber', count + 1);
        sSet('c' + entry.title, JSON.stringify(entry));

        notice('Installation "' + data.name + '" ' + (existing ? 'updated' : 'saved') + '.',
            'INSTALLATIONS', '#7CFC98');
        renderInstallations();
        buildDropdown();
        if ((EDITIONS[state.edition] || {}).customOnly) setEdition('custom');
    }

    window.newinstallation = function (path) {
        var catalog = path || state.catalogPath || CATALOGS.web;
        var meta = editionKeyForPath(catalog);
        openInstallationForm({
            catalog: catalog,
            title: 'Create New Installation',
            name: '',
            version: '',
            link: '',
            icon: '',
            onSave: function (data) {
                saveCustomInstallation(data, null);
            }
        });
    };

    window.newcustominstallation = function () {
        window.newinstallation(CATALOGS.web);
    };

    function editInstallation(entry) {
        var catalog = entry.custom === 'moddedgame' ? CATALOGS.modded
            : entry.custom === 'assisted' ? CATALOGS.assisted : CATALOGS.web;
        openInstallationForm({
            catalog: catalog,
            title: 'Edit Installation',
            name: entryLabel(entry),
            version: entry.version,
            link: entry.link,
            icon: entry.icon,
            source: entry.source,
            existing: entry,
            onSave: function (data) {
                saveCustomInstallation(data, entry);
            }
        });
    }

    function renameInstallation(entry) {
        var menu = el('externalmenu');
        if (!menu) return;
        menu.innerHTML =
            '<div class="bolded notescreenheader">' +
            '<p>Rename Installation</p>' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" onclick="closenotescreen()"><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>' +
            '</div><hr><div class="newinstallationdetails">' +
            '<p class="bolded newinstallationheader">NAME</p>' +
            '<input id="renameinstallationinput" type="text" autocomplete="off" maxlength="40">' +
            '</div><div class="newinstallationfooter"><hr><div class="newinstallationfooterbuttons">' +
            '<div class="classicbutton" onclick="closenotescreen()"><p class="bolded">Cancel</p></div>' +
            '<div class="greenbutton classicbutton" id="renameinstallationsave"><p class="bolded">Save</p></div>' +
            '</div></div>';
        menu.style.display = 'flex';
        var input = el('renameinstallationinput');
        input.value = entryLabel(entry);
        input.focus();
        input.select();
        el('renameinstallationsave').addEventListener('click', function () {
            var name = input.value.trim();
            if (!name) { notice('Give the installation a name.', 'INSTALLATIONS'); return; }
            entry.displayName = name;
            sSet('c' + entry.title, JSON.stringify(entry));
            window.closenotescreen();
            renderInstallations();
            buildDropdown();
            var selected = state.selected[entry.custom];
            if (selected && selected.title === entry.title) selectEntry(entry, false);
            notice('Installation renamed.', 'INSTALLATIONS', '#7CFC98');
        });
    }

    function openInstallationForm(opts) {
        var menu = el('externalmenu');
        if (!menu) return;
        menu.innerHTML = '';

        var header = document.createElement('div');
        header.className = 'bolded notescreenheader';
        header.innerHTML =
            '<p>' + escapeHtml(opts.title) + '</p>' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" onclick="closenotescreen()"><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>';

        var details = document.createElement('div');
        details.className = 'newinstallationdetails';

        var iconWrap = document.createElement('div');
        iconWrap.className = 'newinstallationicons';
        var chosenIcon = opts.icon;

        fetch('./assets/json/icons.json', { cache: 'no-cache' })
            .then(function (r) { return r.json(); })
            .then(function (icons) {
                (icons || []).forEach(function (src) {
                    var img = document.createElement('img');
                    img.src = src;
                    img.className = 'icon';
                    img.alt = '';
                    if (chosenIcon === src) img.classList.add('selected');
                    img.addEventListener('click', function () {
                        Array.prototype.forEach.call(iconWrap.children, function (n) {
                            n.classList.remove('selected');
                        });
                        img.classList.add('selected');
                        chosenIcon = src;
                        iconWrap.setAttribute('data-icon', src);
                    });
                    iconWrap.appendChild(img);
                });
                if (!chosenIcon && iconWrap.firstChild) {
                    iconWrap.firstChild.classList.add('selected');
                    chosenIcon = iconWrap.firstChild.getAttribute('src');
                }
                iconWrap.setAttribute('data-icon', chosenIcon || '');
            })
            .catch(function () {});

        var nameLabel = document.createElement('p');
        nameLabel.className = 'bolded newinstallationheader';
        nameLabel.textContent = 'NAME';
        var nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.id = 'installationscreenname';
        nameInput.autocomplete = 'off';
        nameInput.placeholder = 'New Installation';
        nameInput.value = opts.name || '';

        var versionLabel = document.createElement('p');
        versionLabel.className = 'bolded newinstallationheader';
        versionLabel.textContent = 'VERSION';

        // Editable combobox: type anything, or use the arrow to pick a build.
        var combo = document.createElement('div');
        combo.className = 'combobox';
        combo.id = 'installationcombobox';

        var versionInput = document.createElement('input');
        versionInput.type = 'text';
        versionInput.id = 'installationscreenversion';
        versionInput.className = 'comboboxInput';
        versionInput.autocomplete = 'off';
        versionInput.spellcheck = false;
        versionInput.placeholder = 'Version';
        versionInput.value = opts.version || '';

        var arrow = document.createElement('button');
        arrow.type = 'button';
        arrow.className = 'comboboxArrow';
        arrow.setAttribute('aria-label', 'Show versions');
        arrow.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6l6 -6" /></svg>';

        var list = document.createElement('div');
        list.className = 'comboboxList';
        list.setAttribute('role', 'listbox');
        list.style.display = 'none';

        combo.appendChild(versionInput);
        combo.appendChild(arrow);
        combo.appendChild(list);

        var options = [];          // { label, link }
        var chosenLink = opts.link && opts.link.indexOf('blob:') !== 0 ? opts.link : '';
        var pendingHtml = null;    // HTML read from a file or pasted
        var sourceKind = opts.source && opts.source.kind ? opts.source.kind : 'catalog';
        var sourceValue = opts.source && opts.source.value ? opts.source.value : '';

        var sourceLabel = document.createElement('p');
        sourceLabel.className = 'bolded newinstallationheader';
        sourceLabel.textContent = 'SOURCE';

        var sourceDesc = document.createElement('p');
        sourceDesc.className = 'settingsdesc';
        sourceDesc.textContent = 'Load a bundled version, open an HTML file from your computer, or paste a URL / HTML.';

        var sourceCards = document.createElement('div');
        sourceCards.className = 'sourcecards';
        ['catalog', 'file', 'paste'].forEach(function (kind) {
            var card = document.createElement('div');
            card.className = 'settingcard compact sourcecard';
            card.setAttribute('data-source', kind);
            card.tabIndex = 0;
            card.innerHTML = '<p class="bolded">' +
                (kind === 'catalog' ? 'Bundled version' : kind === 'file' ? 'Browse HTML file' : 'Paste HTML / URL') +
                '</p>';
            card.addEventListener('click', function () { pickSource(kind); });
            onKey(card, function () { pickSource(kind); });
            sourceCards.appendChild(card);
        });

        var fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.html,text/html';
        fileInput.id = 'installationsourcefile';
        fileInput.hidden = true;

        var sourceArea = document.createElement('textarea');
        sourceArea.id = 'installationsourcepaste';
        sourceArea.className = 'sourcearea';
        sourceArea.spellcheck = false;
        sourceArea.placeholder = 'https://example.com/game.html   —   or paste a full offline HTML client';
        sourceArea.value = sourceKind === 'url' ? sourceValue : '';

        var sourceStatus = document.createElement('p');
        sourceStatus.className = 'settingsdesc sourcestatus';
        sourceStatus.id = 'installationsourcestatus';

        function setStatus(text) { sourceStatus.textContent = text; }

        function pickSource(kind) {
            sourceKind = kind;
            Array.prototype.forEach.call(sourceCards.children, function (card) {
                card.classList.toggle('selected', card.getAttribute('data-source') === kind);
            });
            var showPaste = kind === 'paste';
            sourceArea.style.display = showPaste ? 'block' : 'none';
            if (kind === 'catalog') {
                setStatus('This installation opens a version bundled with the launcher.');
                pendingHtml = null;
            } else if (kind === 'file') {
                setStatus('Choose an .html file. Its contents are stored in this browser so it keeps working after a reload.');
                fileInput.click();
            } else {
                setStatus('Paste an https:// address, or the full HTML of an offline client.');
            }
        }

        fileInput.addEventListener('change', function () {
            var file = fileInput.files && fileInput.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function () {
                pendingHtml = String(reader.result || '');
                sourceKind = 'html';
                versionInput.value = versionInput.value || file.name.replace(/\.html?$/i, '');
                setStatus('Loaded ' + file.name + ' (' + Math.max(1, Math.round(file.size / 1024)) + ' KB). Stored in this browser.');
            };
            reader.onerror = function () { setStatus('Could not read that file.'); };
            reader.readAsText(file);
        });

        sourceArea.addEventListener('input', function () {
            var value = sourceArea.value.trim();
            pendingHtml = null;
            if (!value) { sourceKind = 'paste'; return; }
            sourceKind = /^(https?:)?\/\/\S+$/i.test(value) ? 'url' : 'html';
            if (sourceKind === 'html') pendingHtml = sourceArea.value;
            setStatus(sourceKind === 'url' ? 'Will open ' + value : 'Will store the pasted HTML in this browser.');
        });

        function renderOptions() {
            list.innerHTML = '';
            options.forEach(function (option) {
                var item = document.createElement('div');
                item.className = 'comboboxItem';
                item.setAttribute('role', 'option');
                item.textContent = option.label;
                item.addEventListener('click', function () {
                    versionInput.value = option.label;
                    chosenLink = option.link;
                    list.style.display = 'none';
                });
                list.appendChild(item);
            });
        }

        arrow.addEventListener('click', function (event) {
            event.stopPropagation();
            list.style.display = list.style.display === 'none' ? 'block' : 'none';
        });
        versionInput.addEventListener('input', function () {
            chosenLink = '';
            list.style.display = 'none';
        });

        loadCatalog(opts.catalog).then(function (catalogList) {
            options = catalogList.map(function (item) {
                return { label: item.title + ' — ' + item.version, link: item.link };
            });
            if (!versionInput.value) {
                var current = catalogList.filter(function (x) { return x.active; })[0] || catalogList[0];
                if (current) {
                    versionInput.value = current.title + ' — ' + current.version;
                    chosenLink = current.link;
                }
            }
            renderOptions();
        });

        var footer = document.createElement('div');
        footer.className = 'newinstallationfooter';
        footer.innerHTML = '<hr><div class="newinstallationfooterbuttons">' +
            '<div class="classicbutton" onclick="closenotescreen()"><p class="bolded">Cancel</p></div>' +
            '<div class="greenbutton classicbutton" id="newinstallationsave"><p class="bolded">Save</p></div>' +
            '</div>';

        details.appendChild(iconWrap);
        details.appendChild(nameLabel);
        details.appendChild(nameInput);
        details.appendChild(versionLabel);
        details.appendChild(combo);
        details.appendChild(sourceLabel);
        details.appendChild(sourceDesc);
        details.appendChild(sourceCards);
        details.appendChild(fileInput);
        details.appendChild(sourceArea);
        details.appendChild(sourceStatus);

        menu.appendChild(header);
        menu.appendChild(document.createElement('hr'));
        menu.appendChild(details);
        menu.appendChild(footer);
        menu.style.display = 'flex';

        pickSource(sourceKind === 'catalog' ? 'catalog'
            : sourceKind === 'html' ? 'paste'
            : sourceKind);

        var saveBtn = el('newinstallationsave');
        if (saveBtn) {
            saveBtn.addEventListener('click', function () {
                var name = nameInput.value.trim() || 'New Installation';
                var version = versionInput.value.trim();
                var icon = iconWrap.getAttribute('data-icon') || chosenIcon || './assets/images/logo.png';
                var link = '';
                var source = { kind: 'catalog', value: '' };

                if (sourceKind === 'url') {
                    var typed = (sourceArea.value || '').trim();
                    if (!/^(https?:)?\/\/\S+$/i.test(typed)) {
                        notice('Enter a full http(s) address.', 'INSTALLATIONS');
                        return;
                    }
                    link = typed;
                    source = { kind: 'url', value: typed };
                } else if (sourceKind === 'html') {
                    var html = pendingHtml;
                    if (!html && sourceArea.value.trim()) html = sourceArea.value;
                    if (!html) { notice('Choose an HTML file or paste the HTML first.', 'INSTALLATIONS'); return; }
                    try {
                        link = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
                    } catch (e) {
                        link = '';
                    }
                    source = { kind: 'html', value: '' };
                    pendingHtml = html;
                } else {
                    if (!chosenLink) {
                        var match = options.filter(function (o) { return o.label === version; })[0];
                        if (match) chosenLink = match.link;
                    }
                    if (!chosenLink) {
                        notice('Pick a version from the list (or type one and add a source).', 'INSTALLATIONS');
                        return;
                    }
                    link = chosenLink;
                    source = { kind: 'catalog', value: version };
                    if (!version) version = 'custom';
                }

                if (!version) version = 'custom';
                opts.onSave({
                    name: name,
                    version: version,
                    link: link,
                    icon: icon,
                    source: source,
                    html: sourceKind === 'html' ? pendingHtml : null,
                    storeKey: opts.existing ? opts.existing.custom : editionKeyForPath(opts.catalog).storeKey
                });
                window.closenotescreen();
            });
        }
    }

    window.presetlaunchers = function () {
        var check = el('launcherpresets');
        sSet('launcherpresets', check && check.checked ? 'true' : 'false');
        if (check && check.checked) {
            // Restore the catalogue defaults.
            Object.keys(CATALOGS).forEach(function (key) {
                sJSON('ampler.on', null);
            });
            try {
                var doomed = [];
                var store = window['localStorage'];
                for (var i = 0; i < store.length; i++) {
                    var key = store.key(i);
                    if (key && key.indexOf('ampler.on.') === 0) doomed.push(key);
                }
                doomed.forEach(sRemove);
            } catch (e) {}
        } else {
            // Keep only the currently selected entry visible per edition.
            Promise.all([loadCatalog(CATALOGS.web), loadCatalog(CATALOGS.modded), loadCatalog(CATALOGS.assisted)])
                .then(function (lists) {
                    lists.forEach(function (list, index) {
                        var storeKey = ['basegame', 'moddedgame', 'assisted'][index];
                        var current = sJSON(storeKey, null);
                        var keep = current ? current.title : (list[0] && list[0].title);
                        list.forEach(function (entry) {
                            sSet('ampler.on.' + entry.title, entry.title === keep ? 'true' : 'false');
                        });
                    });
                    renderInstallations();
                    buildDropdown();
                });
        }
    };

    /* ------------------------------------------------------------------ *
     * Confirmation dialog
     * ------------------------------------------------------------------ */

    var confirmCallback = null;

    function confirmAction(title, desc, cb) {
        confirmCallback = cb;
        var menu = el('confirmationmenu');
        if (!menu) return;
        var screenNode = menu.querySelector('.confrimationmenuscreen');
        if (screenNode) screenNode.classList.remove('deleteinstallation');
        menu.querySelector('.warningtitle').textContent = title;
        menu.querySelector('.warningdesc').textContent = desc;
        menu.querySelector('.warningbutton').onclick = function () {
            var fn = confirmCallback;
            window.confirmationcancel();
            if (fn) fn();
        };
        menu.style.display = 'flex';
    }

    window.confirmationcancel = function () {
        confirmCallback = null;
        var menu = el('confirmationmenu');
        if (menu) menu.style.display = 'none';
    };

    window.clearlocalstorage = function () {
        confirmAction('Clear All Local Storage',
            'This deletes every saved setting, installation, skin and mod choice on this site. The launcher reloads afterwards.',
            function () {
                sClear();
                location.reload();
            });
    };

    /* ------------------------------------------------------------------ *
     * Servers screen (live status via Accept: MOTD)
     * ------------------------------------------------------------------ */

    var DEFAULT_SERVERS = [
        { name: 'ArchMC', host: 'wss://mc.arch.lol' },
        { name: 'AssPixel', host: 'wss://mc.asspixel.net' },
        { name: 'Zentic', host: 'wss://zentic.cc' },
        { name: 'TuffNet', host: 'wss://tuff.ws' },
        { name: 'Rice Network', host: 'wss://play.ricenetwork.xyz' },
        { name: 'CraftClue', host: 'wss://play.craftclue.rocks' },
        { name: 'vanillamc', host: 'wss://play.vanillamc.org' },
        { name: 'Local Relay (LAN)', host: 'ws://127.0.0.1:8081' }
    ];

    function serverList() {
        var custom = sJSON('ampler.customServers', []);
        return (Array.isArray(custom) ? custom : []).concat(DEFAULT_SERVERS);
    }

    function renderServers() {
        var grid = el('serversGrid');
        if (!grid) return;
        grid.innerHTML = '';
        serverList().forEach(function (server, index) {
            grid.appendChild(serverCard(server, index));
        });
        refreshAllServers();
    }

    function serverCard(server, index) {
        var card = document.createElement('div');
        card.className = 'serverCard';
        card.setAttribute('data-server-index', String(index));
        card.innerHTML =
            '<div class="serverCardTop">' +
            '<canvas class="serverIconCanvas" width="64" height="64"></canvas>' +
            '<div class="serverInfo">' +
            '<div class="serverNameRow">' +
            '<p class="serverName">' + escapeHtml(server.name) + '</p>' +
            '<span class="serverBadge">checking…</span>' +
            '</div>' +
            '<p class="serverMotd">Contacting server…</p>' +
            '<p class="serverAddr">' + escapeHtml(server.host) + '</p>' +
            '</div></div>' +
            '<div class="serverCardActions">' +
            '<div class="classicbutton" data-act="copy"><p class="bolded">Copy IP</p></div>' +
            '<div class="classicbutton" data-act="join"><p class="bolded">Join</p></div>' +
            (server.custom ? '<div class="redbutton classicbutton" data-act="remove"><p class="bolded">Remove</p></div>' : '') +
            '</div>';

        card.querySelector('[data-act="copy"]').addEventListener('click', function () {
            var done = function () { notice('Copied ' + server.host, 'SERVERS', '#7CFC98'); };
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(server.host).then(done).catch(function () {
                    notice('Copy failed - select the address manually.', 'SERVERS');
                });
            } else {
                var area = document.createElement('textarea');
                area.value = server.host;
                document.body.appendChild(area);
                area.select();
                try { document.execCommand('copy'); done(); } catch (e) {}
                area.remove();
            }
        });

        card.querySelector('[data-act="join"]').addEventListener('click', function () {
            var target = sJSON('basegame', null) || {};
            var base = target.link || './mc/ir/1.12.2-wasm/';
            var sep = base.indexOf('?') === -1 ? '?' : '&';
            var url = base + sep + 'server=' + encodeURIComponent(server.host);
            launchOrNavigate(url);
        });

        var removeBtn = card.querySelector('[data-act="remove"]');
        if (removeBtn) {
            removeBtn.addEventListener('click', function () {
                var next = sJSON('ampler.customServers', []).filter(function (s) {
                    return s.host !== server.host;
                });
                sSet('ampler.customServers', JSON.stringify(next));
                renderServers();
            });
        }

        return card;
    }

    function paintServerIcon(canvas, rgba) {
        if (!canvas || !rgba) return;
        var ctx = canvas.getContext('2d');
        if (!ctx) return;
        try {
            var imgData = new ImageData(new Uint8ClampedArray(rgba), 64, 64);
            ctx.putImageData(imgData, 0, 0);
        } catch (e) {}
    }

    function paintServerState(card, data, ping, online) {
        var badge = card.querySelector('.serverBadge');
        var motd = card.querySelector('.serverMotd');
        var name = card.querySelector('.serverName');

        badge.className = 'serverBadge ' + (online ? 'online' : 'offline');
        badge.textContent = online ? (ping + ' ms') : 'offline';

        if (online) {
            var info = (data && data.data) || {};
            var lines = info.motd || [];
            if (typeof lines === 'string') lines = lines.split('\n');
            var text = (lines[0] || '').replace(/§./g, '').trim();
            var players = (typeof info.online === 'number' ? info.online : '?');
            var max = (typeof info.max === 'number' ? info.max : '?');
            motd.textContent = (text || 'No MOTD') + '  ·  ' + players + '/' + max + ' players';
            if (data && data.name && data.name !== 'EaglercraftXServer') name.textContent = data.name;
        } else {
            motd.textContent = 'Could not reach this server (offline, or blocks browser relays).';
        }
    }

    function probeServer(card, server) {
        return new Promise(function (resolve) {
            var done = false;
            var started = Date.now();
            var ws;
            try {
                ws = new WebSocket(server.host);
            } catch (e) {
                finish(false, null, 0);
                return;
            }

            var timer = setTimeout(function () { finish(false, null, 0); }, 8000);

            function finish(online, data, ping, rgba) {
                if (done) return;
                done = true;
                clearTimeout(timer);
                try { ws.close(); } catch (e) {}
                if (rgba) paintServerIcon(card.querySelector('.serverIconCanvas'), rgba);
                paintServerState(card, data, ping, online);
                resolve(online);
            }

            ws.onopen = function () {
                try { ws.send('Accept: MOTD'); } catch (e) {}
            };
            var pending = null;
            var pendingPing = 0;

            ws.onmessage = function (event) {
                if (typeof event.data === 'string') {
                    var parsed = null;
                    try { parsed = JSON.parse(event.data); } catch (e) {}
                    var ping = Date.now() - started;
                    paintServerState(card, parsed, ping, true);
                    if (parsed && parsed.data && parsed.data.icon) {
                        // The 64x64 icon arrives as a second, binary frame.
                        pending = parsed;
                        pendingPing = ping;
                        setTimeout(function () {
                            if (!done) { try { ws.close(); } catch (e) {} finish(true, pending, pendingPing); }
                        }, 1200);
                        return;
                    }
                    try { ws.close(); } catch (e) {}
                    finish(true, parsed, ping);
                } else if (event.data && event.data.arrayBuffer) {
                    event.data.arrayBuffer().then(function (buffer) {
                        paintServerIcon(card.querySelector('.serverIconCanvas'), new Uint8Array(buffer));
                        try { ws.close(); } catch (e) {}
                        finish(true, pending, pendingPing, new Uint8Array(buffer));
                    }).catch(function () {});
                }
            };
            ws.onerror = function () { finish(false, null, 0); };
            ws.onclose = function () { if (!done) finish(false, null, 0); };
        });
    }

    window.refreshAllServers = function () {
        var grid = el('serversGrid');
        if (!grid) return;
        var list = serverList();
        Array.prototype.forEach.call(grid.children, function (card, index) {
            if (list[index]) probeServer(card, list[index]);
        });
    };

    window.addCustomServer = function () {
        var nameInput = el('customServerName');
        var hostInput = el('customServerIp');
        var name = (nameInput && nameInput.value || '').trim();
        var host = (hostInput && hostInput.value || '').trim();
        if (!/^wss?:\/\/\S+$/i.test(host)) {
            notice('The server address must start with ws:// or wss://', 'SERVERS');
            return;
        }
        var list = sJSON('ampler.customServers', []);
        list.unshift({ name: name || host.replace(/^wss?:\/\//, ''), host: host, custom: true });
        sSet('ampler.customServers', JSON.stringify(list));
        if (nameInput) nameInput.value = '';
        if (hostInput) hostInput.value = '';
        renderServers();
        notice('Server added.', 'SERVERS', '#7CFC98');
    };

    /* ------------------------------------------------------------------ *
     * Downloads screen (offline .html / .zip for every client)
     * ------------------------------------------------------------------ */

    var ZIP_CANDIDATES = ['index.html', 'classes.js', 'assets.epk', 'assets.epw', 'favicon.png', 'index.js', 'lang/en_US.lang'];

    function renderDownloads() {
        var grid = el('downloadsGrid');
        if (!grid) return;
        grid.innerHTML = '';

        var groups = [
            { name: 'Web Edition', catalog: CATALOGS.web },
            { name: 'Modded', catalog: CATALOGS.modded },
            { name: 'Mobile / Controller', catalog: CATALOGS.assisted },
            { name: 'Alpha Releases', catalog: CATALOGS.alpha },
            { name: 'Beta Releases', catalog: CATALOGS.beta }
        ];

        Promise.all(groups.map(function (g) { return loadCatalog(g.catalog); })).then(function (lists) {
            groups.forEach(function (group, index) {
                var heading = document.createElement('p');
                heading.className = 'bolded';
                heading.style.gridColumn = '1 / -1';
                heading.style.marginTop = '1vw';
                heading.textContent = group.name;
                grid.appendChild(heading);

                lists[index].filter(function (e) { return e.active !== false; }).forEach(function (entry) {
                    var card = document.createElement('div');
                    card.className = 'serverCard';
                    card.innerHTML =
                        '<div class="serverCardTop">' +
                        '<img src="' + escapeHtml(entry.icon) + '" alt="" style="width:3.6vw;height:3.6vw;image-rendering:pixelated;">' +
                        '<div class="serverInfo">' +
                        '<p class="serverName">' + escapeHtml(entry.title) + '</p>' +
                        '<p class="serverAddr">' + escapeHtml(entry.version) + '</p>' +
                        '</div></div>' +
                        '<div class="serverCardActions">' +
                        '<a class="classicbutton" style="text-decoration:none;color:white;" href="' + escapeHtml(entry.link) + '"><p class="bolded">Open</p></a>' +
                        '<div class="classicbutton" data-act="html"><p class="bolded">.html</p></div>' +
                        '<div class="classicbutton greenbutton" data-act="zip"><p class="bolded">.zip</p></div>' +
                        '</div>';

                    card.querySelector('[data-act="html"]').addEventListener('click', function (ev) {
                        downloadSingle(entry, ev.currentTarget);
                    });
                    card.querySelector('[data-act="zip"]').addEventListener('click', function (ev) {
                        downloadZip(entry, ev.currentTarget);
                    });

                    grid.appendChild(card);
                });
            });

        });
    }

    function fetchFirst(urls) {
        var i = 0;
        function attempt() {
            if (i >= urls.length) return Promise.reject(new Error('not found'));
            var url = urls[i++];
            return fetch(url, { cache: 'no-cache' }).then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return { url: url, res: res };
            }).catch(attempt);
        }
        return attempt();
    }

    function saveBlob(blob, filename) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    }

    function safeName(text) {
        return String(text).replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'client';
    }

    var upstreamFiles = fetch('./tools/upstream-files.json', { cache: 'no-cache' })
        .then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; });

    function packagedFiles(entry) {
        var folder = decodeURIComponent(entry.link.split('?')[0]).replace(/^\.\//, '').replace(/\/$/, '') + '/';
        return upstreamFiles.then(function (files) {
            return files.filter(function (item) { return item.target.indexOf(folder) === 0; })
                .map(function (item) { return item.target.slice(folder.length); });
        });
    }

    function downloadSingle(entry, button) {
        button.style.opacity = '0.5';
        packagedFiles(entry).then(function (files) {
            if (files.length > 1) throw new Error('multi-file');
            return fetchFirst(linksFor(entry));
        }).then(function (found) {
            return found.res.text().then(function (text) {
                saveBlob(new Blob([text], { type: 'text/html' }), safeName(entry.title) + '.html');
                notice(entry.title + ' downloaded as a single .html file.', 'DOWNLOADS', '#7CFC98');
            });
        }).catch(function (error) {
            notice(error.message === 'multi-file'
                ? 'This client needs multiple files. Download the ZIP instead.'
                : 'Could not fetch ' + entry.title + '. It is not bundled on this server.', 'DOWNLOADS');
        }).then(function () { button.style.opacity = '1'; });
    }

    function downloadZip(entry, button) {
        var base = entry.link.split('?')[0].replace(/\/?$/, '/');
        button.style.opacity = '0.5';

        var jszip = window.JSZip || (window.jszipLocal && window.jszipLocal.JSZip) || null;
        if (!jszip) {
            notice('No ZIP writer available; downloading the .html instead.', 'DOWNLOADS');
            downloadSingle(entry, button);
            return;
        }

        var zip = new jszip();
        var found = 0;

        packagedFiles(entry).then(function (files) {
            var required = files.length > 0;
            if (!required) files = ZIP_CANDIDATES;
            return Promise.all(files.map(function (file) {
                var encoded = file.split('/').map(encodeURIComponent).join('/');
                return fetch(base + encoded, { cache: 'no-cache' }).then(function (res) {
                    if (!res.ok) {
                        if (required) throw new Error('Missing ' + file);
                        return null;
                    }
                    return res.arrayBuffer().then(function (buf) {
                        zip.file(file, buf);
                        found++;
                    });
                });
            }));
        }).then(function () {
            if (!found) throw new Error('No files found');
            zip.file('README.txt',
                entry.title + ' (' + entry.version + ')\n\n' +
                'Extracted from the Ampler Launcher offline bundle.\n' +
                'Serve this folder over HTTP (for example, python3 -m http.server) and open index.html.\n');
            return zip.generateAsync({ type: 'blob' }).then(function (blob) {
                saveBlob(blob, safeName(entry.title) + '.zip');
                notice(entry.title + ' packaged (' + found + ' file' + (found === 1 ? '' : 's') + ').', 'DOWNLOADS', '#7CFC98');
            });
        }).catch(function () {
            notice('Could not build the ZIP for ' + entry.title + '.', 'DOWNLOADS');
        }).then(function () { button.style.opacity = '1'; });
    }

    /* ------------------------------------------------------------------ *
     * Quick Settings panel + Quick Stats widget (Dev-subha-stack)
     * ------------------------------------------------------------------ */

    // The old slide-out drawer is gone; its controls are part of Settings now.
    window.toggleSettings = function () { syncQuickSettings(); };

    function closeQuickSettings() { /* nothing to close any more */ }

    function syncQuickSettings() {
        var volume = el('volumeSlider');
        if (volume) volume.value = sGet('volume') || '70';
        var perf = el('perfMode');
        if (perf) perf.checked = sGet('performanceMode') === 'true';
        var auto = el('autoSave');
        if (auto) auto.checked = sGet('autoSave') !== 'false';
        var brand = el('mcBrandingToggle');
        if (brand) brand.checked = state.branding;
        var brandMain = el('mcBrandingCheckbox');
        if (brandMain) brandMain.checked = state.branding;
    }

    window.changeTheme = function () { /* themes are picked from Appearance */ };

    window.setVolume = function () {
        var slider = el('volumeSlider');
        if (!slider) return;
        sSet('volume', slider.value);
        // Media elements inside the launcher (if any) follow the setting.
        document.querySelectorAll('audio, video').forEach(function (node) {
            node.volume = Math.min(1, Math.max(0, Number(slider.value) / 100));
        });
    };

    window.togglePerformanceMode = function () {
        var box = el('perfMode');
        var on = !!(box && box.checked);
        sSet('performanceMode', on ? 'true' : 'false');
        document.documentElement.classList.toggle('perf-mode', on);
        notice(on ? 'Performance mode enabled - animations reduced.' : 'Performance mode disabled.',
            'PERFORMANCE', '#7CFC98');
    };

    window.toggleAutoSave = function () {
        var box = el('autoSave');
        sSet('autoSave', box && box.checked ? 'true' : 'false');
    };

    window.toggleFpsBoost = function () {
        state.fpsBoost = !state.fpsBoost;
        sSet('fpsBoost', state.fpsBoost ? 'true' : 'false');
        applyFpsBoost();
        notice('FPS Boost ' + (state.fpsBoost ? 'enabled' : 'disabled') + '.', 'FPS BOOST', '#7CFC98');
    };

    function applyFpsBoost() {
        var label = el('fpsBoostDisplay');
        if (label) {
            label.textContent = state.fpsBoost ? 'ON' : 'OFF';
            label.style.color = state.fpsBoost ? '#7CFC98' : '#ff8080';
        }
        document.documentElement.classList.toggle('fps-boost', state.fpsBoost);
    }

    function applyBranding() {
        document.documentElement.classList.toggle('mc-branding', state.branding);
        var brand = el('mcBrandingToggle');
        if (brand) brand.checked = state.branding;
        var brandMain = el('mcBrandingCheckbox');
        if (brandMain) brandMain.checked = state.branding;
        var prefix = document.querySelectorAll('.brandPrefix');
        Array.prototype.forEach.call(prefix, function (node) {
            node.textContent = state.branding ? 'MINECRAFT :' : 'EAGLERCRAFT :';
        });
        var edition = el('gameedition');
        if (edition) {
            var conf = EDITIONS[state.edition];
            if (conf) edition.innerHTML = escapeHtml(state.branding
                ? conf.label.replace('EAGLERCRAFT', 'MINECRAFT')
                : conf.label);
        }
        var gameTitle = el('game-title');
        if (gameTitle && state.branding && state.edition === 'web') {
            gameTitle.src = './assets/images/web-title.png';
        } else if (gameTitle && !state.branding && state.edition === 'web') {
            gameTitle.src = './assets/images/web-title.png';
        }
    }

    window.toggleBranding = function (on) {
        state.branding = !!on;
        sSet('mcBranding', state.branding ? 'true' : 'false');
        applyBranding();
        if (state.edition === 'web') applyEditionChrome(EDITIONS.web);
        applyBranding();
    };

    // Playtime / session counter
    var playtimeTimer = null;

    function startStats() {
        var seconds = parseInt(sGet('playtime') || '0', 10) || 0;
        var sessions = parseInt(sGet('sessionCount') || '0', 10) || 0;
        paintStats(seconds, sessions);

        if (sGet('autoSave') !== 'false') {
            sessions += 1;
            sSet('sessionCount', sessions);
            paintStats(seconds, sessions);
        }

        if (playtimeTimer) clearInterval(playtimeTimer);
        playtimeTimer = setInterval(function () {
            seconds += 1;
            if (sGet('autoSave') !== 'false') sSet('playtime', seconds);
            else seconds = parseInt(sGet('playtime') || '0', 10) || seconds;
            paintStats(seconds, sessions);
        }, 1000);
    }

    function paintStats(seconds, sessions) {
        var hours = Math.floor(seconds / 3600);
        var minutes = Math.floor((seconds % 3600) / 60);
        if (el('playtimeDisplay')) el('playtimeDisplay').textContent = hours + 'h ' + minutes + 'm';
        if (el('sessionsDisplay')) el('sessionsDisplay').textContent = String(sessions);
    }

    function countLaunch() {
        var sessions = (parseInt(sGet('sessionCount') || '0', 10) || 0) + 1;
        sSet('sessionCount', sessions);
        paintStats(parseInt(sGet('playtime') || '0', 10) || 0, sessions);
    }

    /* ------------------------------------------------------------------ *
     * Themes / text size / launch mode
     * ------------------------------------------------------------------ */

    /* Clicking the wording of an option toggles its box, so the box itself
       never has to be hit. */
    function wireOptionRows() {
        Array.prototype.forEach.call(document.querySelectorAll('.settingoption'), function (row) {
            if (row.dataset.wired) return;
            row.dataset.wired = '1';
            row.addEventListener('click', function (event) {
                var box = row.querySelector('input[type="checkbox"]');
                if (!box || event.target === box) return;
                box.checked = !box.checked;
                box.dispatchEvent(new Event('change', { bubbles: true }));
            });
        });
    }

    // One shared helper so every settings control behaves identically:
    // the chosen card keeps an accent border + tick + aria-pressed state, and
    // the state is restored from storage on every load.
    function markSettingCards(attribute, value) {
        Array.prototype.forEach.call(document.querySelectorAll('[' + attribute + ']'), function (card) {
            var on = String(card.getAttribute(attribute)) === String(value);
            card.classList.toggle('selected', on);
            card.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
    }

    function settheme(name) {
        var theme = name || 'default';
        if (theme === 'default') sRemove('theme');
        else sSet('theme', theme);
        if (theme === 'default') delete document.documentElement.dataset.theme;
        else document.documentElement.dataset.theme = theme;

        markSettingCards('data-themename', theme);
    }

    window.settheme = settheme;

    window.settextscale = function (scale) {
        var value = Math.min(2, Math.max(0.5, parseFloat(scale) || 1));
        if (value === 1) sRemove('textscale');
        else sSet('textscale', value);
        document.documentElement.style.setProperty('--text-scale', value);
        markSettingCards('data-textscale', value === 1 ? '1' : String(value));
    };

    function launchMode() {
        return sGet('launchmode') || 'tab';
    }

    window.setlaunchmode = function (mode) {
        sSet('launchmode', mode);
        markSettingCards('data-launchmode', mode);
    };

    function defaultView() {
        var view = sGet('defaultview');
        return DEFAULT_VIEWS.indexOf(view) === -1 ? 'play' : view;
    }

    window.setdefaultview = function (view) {
        var next = DEFAULT_VIEWS.indexOf(view) === -1 ? 'play' : view;
        if (next === 'play') sRemove('defaultview');
        else sSet('defaultview', next);
        markSettingCards('data-defaultview', next);
    };

    function currentLayout() {
        var layout = sGet('layout');
        return ['new', 'classic', 'compact'].indexOf(layout) === -1 ? 'new' : layout;
    }

    function applyLayout(name) {
        document.documentElement.dataset.layout = name;
    }

    window.setlayout = function (name) {
        var layout = ['new', 'classic', 'compact'].indexOf(name) === -1 ? 'new' : name;
        if (layout === 'new') sRemove('layout');
        else sSet('layout', layout);
        applyLayout(layout);
        markSettingCards('data-layout', layout);
    };

    /* ------------------------------------------------------------------ *
     * Username
     * ------------------------------------------------------------------ */

    var NAME_A = ['Amber', 'Blaze', 'Cobalt', 'Copper', 'Crimson', 'Diamond', 'Ember', 'Echo',
        'Flint', 'Frost', 'Golden', 'Granite', 'Iron', 'Ivory', 'Jade', 'Lunar', 'Maple',
        'Mossy', 'Neon', 'Nova', 'Obsidian', 'Onyx', 'Prism', 'Quartz', 'Rapid', 'Redstone',
        'Ruby', 'Sapphire', 'Scarlet', 'Silver', 'Slate', 'Solar', 'Spruce', 'Storm', 'Sunset',
        'Thunder', 'Titan', 'Velvet', 'Violet', 'Willow', 'Winter', 'Zephyr'];
    var NAME_B = ['Arrow', 'Badger', 'Beacon', 'Bison', 'Cactus', 'Comet', 'Crane', 'Dragon',
        'Ferret', 'Fox', 'Golem', 'Hammer', 'Heron', 'Knight', 'Lynx', 'Miner', 'Otter',
        'Panda', 'Phoenix', 'Pike', 'Raven', 'Rogue', 'Scribe', 'Shark', 'Sparrow', 'Tiger',
        'Torch', 'Viper', 'Warden', 'Wolf', 'Yeti'];

    function randomName() {
        var a = NAME_A[Math.floor(Math.random() * NAME_A.length)];
        var b = NAME_B[Math.floor(Math.random() * NAME_B.length)];
        var n = Math.floor(Math.random() * 90) + 10;
        return a + b + n;
    }

    function setUsername(name, save) {
        var clean = String(name == null ? '' : name).replace(/\s+/g, ' ').trim().slice(0, 24) || 'Player';
        if (el('username')) el('username').textContent = clean;
        var input = el('inlineUsernameInput');
        if (input && input.value !== clean) input.value = clean;
        var settingsInput = el('usernameinput');
        if (settingsInput && settingsInput.value !== clean) settingsInput.value = clean;
        if (save) {
            sSet('username', clean);
            syncUsernameIntoProfiles(clean);
        }
        return clean;
    }

    // Eaglercraft stores the name inside its own profile blobs; keep them in step.
    function syncUsernameIntoProfiles(name) {
        ['_eaglercraft_1.12.profile', '_eaglercraftX.profile', '_eaglercraft_1.8.profile',
            '_eaglercraft_1.12.p', '_eaglercraftX.p', '_eaglercraft_1.8.p', 'profile']
            .forEach(function (key) {
                var raw = sGet(key);
                if (!raw) return;
                try {
                    var parsed = JSON.parse(raw);
                    if (!parsed || typeof parsed !== 'object') return;
                    parsed.username = name;
                    parsed.name = name;
                    parsed.playerName = name;
                    sSet(key, JSON.stringify(parsed));
                } catch (e) {}
            });
    }

    window.setUsername = function (name, save) {
        return setUsername(name, save !== false);
    };
    window.usernamechange = function () {
        setUsername(el('usernameinput') ? el('usernameinput').value : '', true);
    };
    window.randomizeUsername = function () {
        setUsername(randomName(), true);
        var input = el('usernameinput');
        if (input) input.value = sGet('username') || 'Player';
        notice('New username: ' + (sGet('username') || 'Player'), 'USERNAME', '#ffffff');
    };
    window.generateXboxUsername = window.randomizeUsername;

    window.editUser = function () {
        var box = el('userbox');
        var input = el('inlineUsernameInput');
        if (!box || !input) return;
        if (box.classList.contains('usernameEditing')) return;
        box.classList.add('usernameEditing');
        input.value = sGet('username') || 'Player';
        input.focus();
        input.select();
    };

    function commitUser(save) {
        var box = el('userbox');
        var input = el('inlineUsernameInput');
        if (!box || !input) return;
        if (!box.classList.contains('usernameEditing')) return;
        box.classList.remove('usernameEditing');
        setUsername(input.value, !!save);
    }

    /* ------------------------------------------------------------------ *
     * Launching the selected build
     * ------------------------------------------------------------------ */

    function cloakPage(href) {
        return '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Ampler Launcher</title>' +
            '<style>html,body,iframe{margin:0;padding:0;border:0;width:100%;height:100%;overflow:hidden;background:#000}</style>' +
            '</head><body><iframe src="' + escapeHtml(href) + '" allowfullscreen allow="fullscreen; autoplay; clipboard-write; gamepad"></iframe></body></html>';
    }

    function writePage(win, html) {
        try {
            win.document.open();
            win.document.write(html);
            win.document.close();
        } catch (e) {
            notice('Could not write the game page into the new window.', 'LAUNCH');
        }
    }

    function gameUrlFor() {
        var play = el('playbutton');
        var href = play ? play.getAttribute('href') : null;
        if (!href || href === '#') return null;
        try { return new URL(href, location.href); } catch (e) { return null; }
    }

    function blockedNotice() {
        notice('Your browser blocked the new window. Allow popups for this site.', 'LAUNCH');
    }

    /* Opening a build
       ------------------------------------------------------------------
       window.open returns null when the browser (or a sandboxed frame such
       as a preview pane) refuses the window, and passing 'noopener' makes it
       return null even on success - so noopener is applied by hand and the
       return value stays usable. When the window is refused the build opens
       in this tab instead of leaving the button doing nothing. */

    function inFrame() {
        try { return window.self !== window.top; } catch (e) { return true; }
    }

    function openInTab(href) {
        if (inFrame()) return false;          // preview frames block popups outright
        try {
            var win = window.open(href, '_blank');
            if (!win) return false;
            try { win.opener = null; } catch (e) {}
            return true;
        } catch (e) {
            return false;
        }
    }

    function launchOrNavigate(href) {
        if (!openInTab(href)) location.href = href;
        return true;
    }

    function launch(mode) {
        var target = gameUrlFor();
        if (!target) {
            notice('Pick a version first.', 'LAUNCH');
            return false;
        }
        var href = target.href;

        if (mode === 'same') {
            location.href = href;
            return true;
        }

        if (mode === 'tab') {
            return launchOrNavigate(href);
        }

        if (mode === 'popup') {
            var win = window.open(href, '_blank', 'popup,width=1280,height=720');
            if (!win) blockedNotice();
            return true;
        }

        if (mode === 'blank') {
            var host = window.open('about:blank', '_blank');
            if (!host) { blockedNotice(); return true; }
            writePage(host, cloakPage(href));
            return true;
        }

        if (mode === 'blob' || mode === 'data-uri') {
            var page = cloakPage(href);
            var url;
            try {
                url = mode === 'blob'
                    ? URL.createObjectURL(new Blob([page], { type: 'text/html' }))
                    : 'data:text/html;charset=utf-8,' + encodeURIComponent(page);
            } catch (e) {
                blockedNotice();
                return true;
            }
            var tab = window.open(url, '_blank', 'noopener');
            if (!tab) blockedNotice();
            return true;
        }

        // Unknown mode: behave like the default (New Tab).
        return launchOrNavigate(href);
    }

    /* ------------------------------------------------------------------ *
     * Global wiring
     * ------------------------------------------------------------------ */

    function wire() {
        var play = el('playbutton');
        if (play) {
            play.addEventListener('click', function (event) {
                if (!gameUrlFor()) return;
                event.preventDefault();
                countLaunch();
                launch(launchMode());
            });
        }

        var drop = el('drop');
        if (drop) {
            onKey(drop, function () { window.dropdowntoggle(); });
        }

        // Header tabs: wired here instead of with inline onclick, so the
        // launcher needs no 'unsafe-inline' handlers and works the same for
        // mouse, touch, keyboard and assistive tech.
        wireOptionRows();
        if (el('whatsnew')) {
            el('whatsnew').addEventListener('keydown', function (event) {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    window.generaterecentnote();
                }
            });
        }
        Array.prototype.forEach.call(document.querySelectorAll('[data-view]'), function (tab) {
            var view = tab.getAttribute('data-view');
            var go = function (event) {
                if (event) event.preventDefault();
                showView(view);
            };
            tab.addEventListener('click', go);
            onKey(tab, go);
        });

        // Settings cards: keyboard operable and always reflect the saved state.
        ['data-themename', 'data-textscale', 'data-launchmode', 'data-defaultview', 'data-layout']
            .forEach(function (attr) {
                Array.prototype.forEach.call(document.querySelectorAll('[' + attr + ']'), function (card) {
                    onKey(card, function () { card.click(); });
                });
            });

        var picker = el('drop');
        if (picker) {
            picker.addEventListener('keydown', function (event) {
                var key = event.key;
                if (key !== 'Enter' && key !== ' ' && key !== 'Spacebar' && key !== 'ArrowDown') return;
                event.preventDefault();
                openDropdown().then(function () { focusRow(selectedRowInMenu()); });
            });
        }

        var userBox = el('userbox');
        var userInput = el('inlineUsernameInput');
        if (userInput) {
            userInput.addEventListener('keydown', function (event) {
                if (event.key === 'Enter') { event.preventDefault(); commitUser(true); }
                if (event.key === 'Escape') { event.preventDefault(); commitUser(false); }
            });
            userInput.addEventListener('blur', function () { commitUser(true); });
        }

        document.addEventListener('click', function (event) {
            var node = event.target;
            while (node) {
                if (node.id === 'drop' || node.id === 'dropdn') return;
                if (node.id === 'settingsPanel') return;
                node = node.parentNode;
            }
            closeDropdown();
        });

        document.addEventListener('keydown', function (event) {
            if (event.key !== 'Escape') return;
            var menu = el('dropdn');
            if (menu && menu.style.visibility === 'visible') closeDropdown();
            var ext = el('externalmenu');
            if (ext && ext.style.display === 'flex') window.closenotescreen();
            var confirmBox = el('confirmationmenu');
            if (confirmBox && confirmBox.style.display === 'flex') window.confirmationcancel();
        });

        window.addEventListener('resize', function () {
            // Nothing to restack now that the dropdown scrolls, but keep the
            // selected rows highlighted after a rotation.
            markSelectedRow();
        });
    }

    function boot() {
        // Username
        setUsername(sGet('username') || randomName(), !sGet('username'));

        // Settings UI - every control restores its saved state
        settheme(sGet('theme') || 'default');
        window.settextscale(parseFloat(sGet('textscale')) || 1);
        window.setlaunchmode(launchMode());
        window.setdefaultview(defaultView());
        window.setlayout(currentLayout());
        syncQuickSettings();
        applyBranding();
        applyFpsBoost();
        startStats();

        if (el('launcherpresets')) el('launcherpresets').checked = isPresetsOn();

        if (sGet('performanceMode') === 'true') document.documentElement.classList.add('perf-mode');
        if (sGet('fpsBoost') === null) sSet('fpsBoost', 'true');

        // Enabled mods
        var storedMods = sJSON('modslauncher', []);
        state.mods = Array.isArray(storedMods) ? storedMods : [];
        syncModsToStorage();

        wire();

        // Open the tab chosen in Settings -> Default Tab.
        var start = defaultView();
        var edition = start === 'servers' ? 'web'
            : start === 'downloads' ? 'downloads'
            : start === 'mods' ? 'modded'
            : start === 'custom' ? 'custom'
            : 'web';
        setEdition(edition);
        if (start !== 'play' && start !== 'custom') showView(start);
        if (start === 'mods') markSidebar('gtabs3');
        hydrateCustomInstallations().then(function () { buildDropdown(); });

        // Warm the catalogues so switching editions feels instant.
        Object.keys(CATALOGS).forEach(function (k) { loadCatalog(CATALOGS[k]); });

        console.clear();
    }

    // Markup is above this script, so boot immediately.
    if (document.getElementById('mainPage')) boot();
    else document.addEventListener('DOMContentLoaded', boot);
})();
