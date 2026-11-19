// Ampler Launcher - URL policy
// ---------------------------------------------------------------------------
// One place decides which URLs the launcher is willing to open.
//
// The Play button's href is writable from several places (catalogue entry,
// custom installation, saved selection), so it is treated as untrusted input
// at the moment it is used, not only where it was entered. Everything that is
// not plain http(s) - or a blob: URL the launcher itself created for a
// self-contained installation - is refused.
//
// Plain UMD so the same file runs in the page (window.AmplerUrlPolicy) and in
// the Node test suite (require()).
// ---------------------------------------------------------------------------
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.AmplerUrlPolicy = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // Protocols the Play button may hand to location.href / window.open.
    var PLAY_SCHEMES = ['http:', 'https:', 'blob:'];

    // Protocols accepted when a user types an address for a custom install.
    var SOURCE_SCHEMES = ['http:', 'https:'];

    var FALLBACK_BASE = 'https://launcher.invalid/';

    function parse(value, base) {
        if (value === null || value === undefined) return null;
        var text = String(value).trim();
        if (!text || text === '#' || text.charAt(0) === '#') return null;
        try {
            return new URL(text, base || FALLBACK_BASE);
        } catch (e) {
            return null;
        }
    }

    /**
     * Resolve the Play button href into an absolute URL, or null when it is
     * empty, malformed, or on a protocol the launcher must not navigate to
     * (javascript:, data:, vbscript:, file:, ...).
     */
    function resolvePlayUrl(href, base) {
        var url = parse(href, base);
        if (!url) return null;
        if (PLAY_SCHEMES.indexOf(url.protocol) === -1) return null;
        return url;
    }

    /** True when a typed installation address is a plain http(s) URL. */
    function isSourceUrl(value) {
        if (!/^(https?:)?\/\/\S+$/i.test(String(value || '').trim())) return false;
        var url = parse(value);
        return !!url && SOURCE_SCHEMES.indexOf(url.protocol) !== -1;
    }

    /** The reason text used in user-facing notices. */
    function rejectionMessage() {
        return 'That address is not a web page the launcher can open. Use an http:// or https:// address.';
    }

    return {
        PLAY_SCHEMES: PLAY_SCHEMES,
        SOURCE_SCHEMES: SOURCE_SCHEMES,
        resolvePlayUrl: resolvePlayUrl,
        isSourceUrl: isSourceUrl,
        rejectionMessage: rejectionMessage
    };
}));
