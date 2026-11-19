// Ampler Launcher - sandbox for self-contained installations
// ---------------------------------------------------------------------------
// A custom installation is HTML the launcher did not write: pasted text, a
// picked .html file, or a page downloaded from somewhere. It used to be turned
// into a blob: URL opened as a normal page, which meant that HTML ran on the
// launcher's own origin - free to read localStorage (username, installation
// list, launch settings), rewrite the Play button, or call the launcher's own
// globals.
//
// This module wraps that HTML in a sandboxed iframe so it runs on an opaque
// origin with no access to the launcher. Because Eaglercraft clients keep their
// settings in localStorage, the frame gets a small shim instead of the real
// Storage: reads are served from a snapshot baked in at load time, and writes
// are posted to the wrapper page, which persists them under
// `ampler-sandbox:<scope>` on the launcher origin. The frame itself never sees
// that origin.
//
// What the sandbox does NOT provide: IndexedDB. Worlds saved by a sandboxed
// custom client stay in the frame for the session. Bundled clients are served
// as their own documents and are unaffected.
//
// Plain UMD: window.AmplerInstallSandbox in the page, require() in tests.
// ---------------------------------------------------------------------------
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.AmplerInstallSandbox = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var STORE_PREFIX = 'ampler-sandbox:';

    // Enough for a real client, without granting same-origin back.
    var SANDBOX_FLAGS = [
        'allow-scripts',
        'allow-modals',
        'allow-popups',
        'allow-forms',
        'allow-pointer-lock',
        'allow-downloads',
        'allow-orientation-lock'
    ].join(' ');

    function escapeAttr(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function storeKey(scope) {
        return STORE_PREFIX + String(scope);
    }

    /** The saved Storage snapshot for one installation, as a plain object. */
    function readSeed(scope, storage) {
        var store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
        if (!store) return {};
        try {
            var raw = store.getItem(storeKey(scope));
            if (!raw) return {};
            var parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return {};
            var out = {};
            Object.keys(parsed).forEach(function (k) { out[String(k)] = String(parsed[k]); });
            return out;
        } catch (e) {
            return {};
        }
    }

    function dropSeed(scope, storage) {
        var store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
        if (!store) return;
        try { store.removeItem(storeKey(scope)); } catch (e) {}
    }

    // The Storage shim that runs *inside* the opaque-origin frame. It has to
    // be synchronous for the client, so reads come from the local cache and
    // writes update the cache before being posted to the wrapper.
    function shimSource(scope, seed) {
        var seedJson = JSON.stringify(seed || {}).replace(/</g, '\u005cu003c');
        return '(function(){' +
            'var SCOPE=' + JSON.stringify(String(scope)).replace(/</g, '\u005cu003c') + ';' +
            'var SEED=' + seedJson + ';' +
            'var cache={};' +
            'function reset(from){cache={};Object.keys(from||{}).forEach(function(k){cache[k]=String(from[k]);});}' +
            'reset(SEED);' +
            'function snapshot(){var out={};Object.keys(cache).forEach(function(k){out[k]=cache[k];});return out;}' +
            'function flush(){try{parent.postMessage({amplerStorage:SCOPE,snapshot:snapshot()},\"*\");}catch(e){}}' +
            'function store(){return{' +
                'getItem:function(k){k=String(k);return Object.prototype.hasOwnProperty.call(cache,k)?cache[k]:null;},' +
                'setItem:function(k,v){cache[String(k)]=String(v);flush();},' +
                'removeItem:function(k){delete cache[String(k)];flush();},' +
                'clear:function(){cache={};flush();},' +
                'key:function(i){var ks=Object.keys(cache);i=Number(i);return i>=0&&i<ks.length?ks[i]:null;},' +
                'get length(){return Object.keys(cache).length;}' +
            '};}' +
            'var api=store();' +
            'try{Object.defineProperty(window,\"localStorage\",{configurable:true,get:function(){return api;}});}catch(e){}' +
            'try{Object.defineProperty(window,\"sessionStorage\",{configurable:true,get:function(){return store();}});}catch(e){}' +
        '})();';
    }

    /**
     * Take a client's HTML and give it the sandboxed Storage shim.
     * The shim is inserted as the first element of <head> (or <html>) so it is
     * in place before any of the client's own scripts run.
     */
    function instrumentHtml(html, options) {
        var opts = options || {};
        var source = String(html == null ? '' : html);
        var shim = '<script>' + shimSource(opts.scope, opts.seed) + '<\/script>';
        var head = /<head[^>]*>/i.exec(source);
        if (head) {
            var cut = head.index + head[0].length;
            return source.slice(0, cut) + shim + source.slice(cut);
        }
        var rootTag = /<html[^>]*>/i.exec(source);
        if (rootTag) {
            var at = rootTag.index + rootTag[0].length;
            return source.slice(0, at) + shim + source.slice(at);
        }
        return shim + source;
    }

    // The wrapper document. It is the same origin as the launcher, but it runs
    // no code from the installation: everything the client does happens inside
    // the sandboxed frame below.
    function buildSandboxPage(innerUrl, scope) {
        var bridge = '(function(){' +
            'var SCOPE=' + JSON.stringify(String(scope)).replace(/</g, '\u005cu003c') + ';' +
            'var KEY=' + JSON.stringify(storeKey(scope)).replace(/</g, '\u005cu003c') + ';' +
            'window.addEventListener(\"message\",function(event){' +
                'var data=event.data;' +
                'if(event.source!==document.getElementById("ampler-install-frame").contentWindow||!data||data.amplerStorage!==SCOPE||!data.snapshot)return;' +
                'try{window.localStorage.setItem(KEY,JSON.stringify(data.snapshot));}catch(e){}' +
            '});' +
        '})();';
        return '<!DOCTYPE html><html><head><meta charset="utf-8">' +
            '<title>Ampler Launcher</title>' +
            '<style>html,body{margin:0;padding:0;height:100%;overflow:hidden;background:#000}' +
            'iframe{border:0;width:100%;height:100%;display:block}</style>' +
            '</head><body>' +
            '<iframe id="ampler-install-frame" sandbox="' + SANDBOX_FLAGS + '"' +
            ' allowfullscreen allow="fullscreen; autoplay; clipboard-write; gamepad"' +
            ' referrerpolicy="no-referrer" src="' + escapeAttr(innerUrl) + '"></iframe>' +
            '<script>' + bridge + '<\/script>' +
            '</body></html>';
    }

    return {
        STORE_PREFIX: STORE_PREFIX,
        SANDBOX_FLAGS: SANDBOX_FLAGS,
        storeKey: storeKey,
        readSeed: readSeed,
        dropSeed: dropSeed,
        shimSource: shimSource,
        instrumentHtml: instrumentHtml,
        buildSandboxPage: buildSandboxPage
    };
}));
