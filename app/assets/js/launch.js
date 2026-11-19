// Ampler Launcher - launch strategies
// ---------------------------------------------------------------------------
// How the selected build is opened: same tab, new tab, popup, about:blank,
// blob: or data: URI. These six paths carry most of the browser-quirk logic in
// the launcher (refused popups, sandboxed preview frames, noopener), so they
// live in their own module with no dependency on launcher state: the caller
// passes in the few functions it needs.
//
// Plain UMD: window.AmplerLaunch in the page, require() in the test suite.
// ---------------------------------------------------------------------------
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./url-policy.js'));
    } else {
        root.AmplerLaunch = factory(root.AmplerUrlPolicy);
    }
}(typeof self !== 'undefined' ? self : this, function (UrlPolicy) {
    'use strict';

    // Kept in the same order as the Settings cards, so the first entry is the
    // fallback for an unknown saved value.
    var MODES = ['same', 'tab', 'popup', 'blank', 'blob', 'data-uri'];
    var DEFAULT_MODE = 'tab';

    function normalizeMode(mode) {
        return MODES.indexOf(mode) === -1 ? DEFAULT_MODE : mode;
    }

    function escapeHtml(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // The frame page used by the about:blank / blob / data: strategies.
    function cloakPage(href) {
        return '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Ampler Launcher</title>' +
            '<style>html,body,iframe{margin:0;padding:0;border:0;width:100%;height:100%;overflow:hidden;background:#000}</style>' +
            '</head><body><iframe src="' + escapeHtml(href) + '" allowfullscreen ' +
            'allow="fullscreen; autoplay; clipboard-write; gamepad"></iframe></body></html>';
    }

    function create(options) {
        var opts = options || {};
        var doc = opts.document || (typeof document !== 'undefined' ? document : null);
        var win = opts.window || (typeof window !== 'undefined' ? window : null);
        var notice = typeof opts.notice === 'function' ? opts.notice : function () {};
        var currentMode = typeof opts.mode === 'function' ? opts.mode : function () { return DEFAULT_MODE; };

        function playHref() {
            var play = doc && doc.getElementById('playbutton');
            return play ? play.getAttribute('href') : null;
        }

        /** The Play button target as a validated absolute URL, or null. */
        function gameUrl() {
            var base = win && win.location ? win.location.href : undefined;
            return UrlPolicy.resolvePlayUrl(playHref(), base);
        }

        function blockedNotice() {
            notice('Your browser blocked the new window. Allow popups for this site.', 'LAUNCH');
        }

        /* window.open returns null when the browser (or a sandboxed frame such
           as a preview pane) refuses the window, and passing 'noopener' makes
           it return null even on success - so noopener is applied by hand and
           the return value stays usable. When the window is refused the build
           opens in this tab instead of leaving the button doing nothing. */

        function inFrame() {
            try { return win.self !== win.top; } catch (e) { return true; }
        }

        function openInTab(href) {
            if (inFrame()) return false;          // preview frames block popups outright
            try {
                var opened = win.open(href, '_blank');
                if (!opened) return false;
                try { opened.opener = null; } catch (e) {}
                return true;
            } catch (e) {
                return false;
            }
        }

        function launchOrNavigate(href) {
            var safe = UrlPolicy.resolvePlayUrl(href, win.location.href);
            if (!safe) { notice('Invalid launch address.', 'LAUNCH'); return false; }
            href = safe.href;
            if (!openInTab(href)) win.location.href = href;
            return true;
        }

        function writePage(target, html) {
            try {
                target.document.open();
                target.document.write(html);
                target.document.close();
                return true;
            } catch (e) {
                notice('Could not write the game page into the new window.', 'LAUNCH');
                return false;
            }
        }

        /**
         * Open the selected build. Returns { ok, mode, reason } instead of
         * throwing, so callers and tests can see what happened.
         */
        function launch(requested) {
            var target = gameUrl();
            if (!target) return { ok: false, mode: null, reason: 'no-target' };

            var href = target.href;
            var mode = requested === undefined || requested === null
                ? normalizeMode(currentMode())
                : normalizeMode(requested);

            if (mode === 'same') {
                win.location.href = href;
                return { ok: true, mode: mode, reason: null };
            }

            if (mode === 'tab') {
                launchOrNavigate(href);
                return { ok: true, mode: mode, reason: null };
            }

            if (mode === 'popup') {
                var popup = null;
                try {
                    popup = win.open(href, '_blank', 'popup,width=1280,height=720');
                } catch (e) { popup = null; }
                if (!popup) { blockedNotice(); return { ok: false, mode: mode, reason: 'blocked' }; }
                try { popup.opener = null; } catch (e) {}
                return { ok: true, mode: mode, reason: null };
            }

            if (mode === 'blank') {
                var host = null;
                try { host = win.open('about:blank', '_blank'); } catch (e) { host = null; }
                if (!host) { blockedNotice(); return { ok: false, mode: mode, reason: 'blocked' }; }
                writePage(host, cloakPage(href));
                return { ok: true, mode: mode, reason: null };
            }

            if (mode === 'blob' || mode === 'data-uri') {
                var page = cloakPage(href);
                var url;
                try {
                    url = mode === 'blob'
                        ? win.URL.createObjectURL(new win.Blob([page], { type: 'text/html' }))
                        : 'data:text/html;charset=utf-8,' + encodeURIComponent(page);
                } catch (e) {
                    blockedNotice();
                    return { ok: false, mode: mode, reason: 'unavailable' };
                }
                var tab = null;
                try { tab = win.open(url, '_blank'); } catch (e) { tab = null; }
                if (!tab) { blockedNotice(); return { ok: false, mode: mode, reason: 'blocked' }; }
                try { tab.opener = null; } catch (e) {}
                return { ok: true, mode: mode, reason: null };
            }

            return { ok: false, mode: mode, reason: 'unknown-mode' };
        }

        return {
            gameUrl: gameUrl,
            playHref: playHref,
            launch: launch,
            launchOrNavigate: launchOrNavigate,
            openInTab: openInTab,
            cloakPage: cloakPage
        };
    }

    return {
        MODES: MODES,
        DEFAULT_MODE: DEFAULT_MODE,
        normalizeMode: normalizeMode,
        cloakPage: cloakPage,
        create: create
    };
}));
