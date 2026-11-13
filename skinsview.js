/* ---------------------------------------------------------------------------
 * Ampler Launcher - Skins manager
 *
 * Merges proton-arcade/AmplerLauncher's skins page (folder-driven library,
 * canvas front preview, search, downloads, folder import) with
 * Dev-subha-stack/minecraft-launcher's skin sync (the chosen skin is written
 * into the Eaglercraft profiles so it is used in game).
 *
 * The library is whatever lives in assets/skins/. Three ways in:
 *   1. drop a folder into assets/skins/  (the server lists it live);
 *   2. "Add skin folder" - session only, nothing written to disk;
 *   3. "Upload Skin (.png)" - a single file, session only, equipped instantly.
 * ------------------------------------------------------------------------- */
(function () {
    'use strict';

    var CUSTOM_SKIN_KEY = 'launcher.customSkin';
    var PROFILE_KEYS = [
        '_eaglercraft_1.12.profile', '_eaglercraftX.profile', '_eaglercraft_1.8.profile',
        '_eaglercraft_1.12.p', '_eaglercraftX.p', '_eaglercraft_1.8.p', 'profile'
    ];
    var IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
    var PREVIEW_SCALE = 10;

    var state = {
        library: [],
        filter: '',
        missing: {},
        equipped: null,
        built: false,
        blobUrls: []
    };

    function el(id) { return document.getElementById(id); }

    function sGet(key) {
        try { return window.localStorage.getItem(key); } catch (e) { return null; }
    }
    function sSet(key, value) {
        try { window.localStorage.setItem(key, value); } catch (e) {}
    }

    function isImageName(name) {
        var ext = String(name || '').split('.').pop().toLowerCase();
        return IMAGE_EXT.indexOf(ext) !== -1;
    }

    function baseDir() {
        return String(window.AMPLER_SKIN_DIR || './assets/skins/').replace(/\/?$/, '/');
    }

    function previewPrefix() {
        return window.AMPLER_SKIN_PREVIEW_PREFIX || 'preview.';
    }

    /* ------------------------------------------------------------------ *
     * Library
     * ------------------------------------------------------------------ */

    function entryForFolder(name) {
        var dir = baseDir() + encodeURIComponent(name) + '/';
        return {
            name: name,
            skinUrl: dir + encodeURIComponent(name) + '.png',
            previewUrl: dir + encodeURIComponent(previewPrefix() + name) + '.png',
            fileName: name + '.png',
            source: 'disk'
        };
    }

    function buildLibrary() {
        var names = [];
        var push = function (n) {
            var clean = String(n || '').trim();
            if (clean && names.indexOf(clean) === -1) names.push(clean);
        };

        // Live folder listing injected by serve.py / bake-skins.py
        (window.AMPLER_SKINS_FROM_DIR || []).forEach(push);
        // Manifest (order + any extra names)
        (window.AMPLER_SKINS || []).forEach(function (s) { push(typeof s === 'string' ? s : s && s.name); });

        state.library = names.map(entryForFolder);

        var saved = sGet(CUSTOM_SKIN_KEY);
        if (saved) {
            try {
                var parsed = JSON.parse(saved);
                state.equipped = parsed && parsed.fileName ? parsed.fileName : null;
            } catch (e) {}
        }
    }

    /* ------------------------------------------------------------------ *
     * Rendering
     * ------------------------------------------------------------------ */

    function drawFrontPreview(url, img, fallbackNode) {
        var probe = new Image();
        probe.onload = function () {
            var w = probe.naturalWidth;
            var h = probe.naturalHeight;
            var k = 0;
            if (w >= 64 && h >= 64) k = Math.floor(Math.min(w / 64, h / 64));
            if (!k) { img.src = url; return; }

            var legacy = (h * 2 <= w);
            var scale = PREVIEW_SCALE;
            var canvas = document.createElement('canvas');
            canvas.width = 16 * scale;
            canvas.height = 32 * scale;
            canvas.className = 'skinPreviewCanvas';
            var ctx = canvas.getContext('2d');
            if (!ctx) { img.src = url; return; }
            ctx.imageSmoothingEnabled = false;

            function part(sx, sy, sw, sh, dx, dy, flip) {
                if (flip) {
                    ctx.save();
                    ctx.translate((dx + sw) * scale, dy * scale);
                    ctx.scale(-1, 1);
                    ctx.drawImage(probe, sx * k, sy * k, sw * k, sh * k, 0, 0, sw * scale, sh * scale);
                    ctx.restore();
                } else {
                    ctx.drawImage(probe, sx * k, sy * k, sw * k, sh * k,
                        dx * scale, dy * scale, sw * scale, sh * scale);
                }
            }

            // head (front + hat layer)
            part(8, 8, 8, 8, 4, 0, false);
            part(40, 8, 8, 8, 4, 0, false);
            // body
            part(20, 20, 8, 12, 4, 8, false);
            if (!legacy) part(20, 36, 8, 12, 4, 8, false);
            // right arm
            part(44, 20, 4, 12, 0, 8, false);
            if (legacy) part(44, 20, 4, 12, 12, 8, true);
            else part(36, 52, 4, 12, 12, 8, false);
            // left arm
            part(4, 20, 4, 12, 4, 20, false);
            if (legacy) part(4, 20, 4, 12, 8, 20, true);
            else part(4, 52, 4, 12, 8, 20, false);
            // legs
            if (!legacy) {
                part(20, 52, 4, 12, 4, 20, false);
                part(4, 52, 4, 12, 8, 20, false);
            } else {
                part(4, 20, 4, 12, 4, 20, false);
                part(4, 20, 4, 12, 8, 20, true);
            }

            if (fallbackNode && fallbackNode.parentNode) fallbackNode.parentNode.removeChild(fallbackNode);
            if (img.parentNode) img.parentNode.removeChild(img);
            if (img.parentNode === null && fallbackNode && fallbackNode.parentNode) {
                fallbackNode.parentNode.appendChild(canvas);
            }
            if (!canvas.parentNode) {
                var wrap = el('skingrid');
                if (wrap && fallbackNode && fallbackNode.parentNode) fallbackNode.parentNode.appendChild(canvas);
            }
        };
        probe.onerror = function () { img.src = url; };
        probe.src = url;
    }

    function skinCard(entry) {
        var equipped = state.equipped === entry.fileName;

        var card = document.createElement('div');
        card.className = 'skinCard' + (equipped ? ' equipped' : '');
        card.setAttribute('data-skin-name', entry.name);
        card.setAttribute('data-skin-url', entry.skinUrl);
        card.setAttribute('data-skin-file', entry.fileName);

        var wrap = document.createElement('div');
        wrap.className = 'skinPreviewWrap';

        var img = document.createElement('img');
        img.className = 'skinPreview';
        img.alt = entry.name;
        img.draggable = false;
        img.onerror = function () {
            // No preview.<name>.png on disk - draw the front of the skin.
            img.onerror = null;
            drawFrontPreview(entry.skinUrl, img, null);
        };
        if (entry.previewUrl) img.src = entry.previewUrl;
        else img.src = entry.skinUrl;
        wrap.appendChild(img);

        var footer = document.createElement('div');
        footer.className = 'skinFooter';

        var label = document.createElement('p');
        label.className = 'skinName';
        label.textContent = entry.name;
        label.title = entry.fileName;

        var actions = document.createElement('div');
        actions.className = 'skinActions';

        var equip = document.createElement('button');
        equip.type = 'button';
        equip.className = 'skinEquipBtn';
        equip.textContent = equipped ? 'Equipped' : 'Equip';
        equip.title = equipped ? 'This skin is applied to your Eaglercraft profile' : 'Use this skin in game';
        equip.addEventListener('click', function () { equipSkin(entry); });

        var download = document.createElement('button');
        download.type = 'button';
        download.className = 'skinDownload';
        download.title = 'Download ' + entry.fileName;
        download.innerHTML =
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
            'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" />' +
            '<path d="M7 11l5 5l5 -5" /><path d="M12 4l0 12" /></svg>';
        download.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            downloadSkin(entry);
        });

        actions.appendChild(equip);
        actions.appendChild(download);
        footer.appendChild(label);
        footer.appendChild(actions);
        card.appendChild(wrap);
        card.appendChild(footer);
        return card;
    }

    function updateCount(visible, known) {
        var count = el('skinscount');
        if (!count) return;
        if (!known) {
            count.textContent = '';
        } else if (visible !== known) {
            count.textContent = visible + ' of ' + known + ' skins';
        } else {
            count.textContent = known + (known === 1 ? ' skin' : ' skins');
        }
    }

    function renderSkins() {
        if (!state.built) {
            buildLibrary();
            state.built = true;
        }
        var grid = el('skingrid');
        if (!grid) return;

        var query = state.filter;
        grid.innerHTML = '';

        var known = 0;
        var shown = 0;
        state.library.forEach(function (entry) {
            if (state.missing[entry.name]) return;
            known++;
            if (query && entry.name.toLowerCase().indexOf(query) === -1) return;
            grid.appendChild(skinCard(entry));
            shown++;
        });

        var empty = el('skinempty');
        if (empty) empty.hidden = known !== 0;
        grid.hidden = known === 0;
        updateCount(shown, known);
    }

    window.renderSkins = renderSkins;

    window.filterSkins = function (value) {
        state.filter = String(value || '').trim().toLowerCase();
        renderSkins();
    };

    /* ------------------------------------------------------------------ *
     * Equip -> write into the Eaglercraft profiles
     * ------------------------------------------------------------------ */

    function bytesToBase64(bytes) {
        var binary = '';
        var chunk = 0x8000;
        for (var i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        return btoa(binary);
    }

    function applyToProfiles(payload) {
        // 1. The launcher key that the bundled 1.12.2 / 1.8.8 builds read on boot.
        sSet(CUSTOM_SKIN_KEY, JSON.stringify(payload));

        // 2. The Eaglercraft profile blobs themselves.
        PROFILE_KEYS.forEach(function (key) {
            var raw = sGet(key);
            if (!raw) return;
            try {
                var parsed = JSON.parse(raw);
                if (!parsed || typeof parsed !== 'object') return;
                parsed.customSkin = { data: payload.data, model: payload.model || 'default' };
                parsed.customSkinModel = payload.model || 'default';
                parsed.presetSkin = 'CUSTOM';
                parsed.presetSkinId = -1;
                parsed.skinType = payload.model === 'slim' ? 1 : 0;
                sSet(key, JSON.stringify(parsed));
            } catch (e) {}
        });
    }

    function equipSkin(entry) {
        var finish = function (payload) {
            payload.fileName = entry.fileName;
            payload.name = entry.name;
            applyToProfiles(payload);
            state.equipped = entry.fileName;
            renderSkins();
            if (typeof window.toast === 'function') {
                window.toast('SKIN EQUIPPED',
                    entry.name + ' is now your skin. Launch any Eaglercraft client to see it.', '#7CFC98');
            }
        };

        fetch(entry.skinUrl, { cache: 'no-cache' })
            .then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.arrayBuffer();
            })
            .then(function (buffer) {
                var bytes = new Uint8Array(buffer);
                finish({
                    data: bytesToBase64(bytes),
                    model: 'default',
                    width: 64,
                    height: 64,
                    dataUrl: URL.createObjectURL(new Blob([bytes], { type: 'image/png' })),
                    updatedAt: Date.now()
                });
            })
            .catch(function () {
                // A blob: URL (folder/single-file import) cannot be fetched on
                // every browser; fall back to the image itself.
                var img = new Image();
                img.onload = function () {
                    var canvas = document.createElement('canvas');
                    canvas.width = 64;
                    canvas.height = 64;
                    var ctx = canvas.getContext('2d');
                    if (!ctx) return;
                    ctx.imageSmoothingEnabled = false;
                    ctx.drawImage(img, 0, 0, 64, 64);
                    var dataUrl = canvas.toDataURL('image/png');
                    var base64 = dataUrl.split(',')[1] || '';
                    finish({
                        data: base64,
                        model: 'default',
                        width: 64,
                        height: 64,
                        dataUrl: dataUrl,
                        updatedAt: Date.now()
                    });
                };
                img.onerror = function () {
                    if (typeof window.toast === 'function') {
                        window.toast('SKIN ERROR', 'That skin file could not be read.', 'goldenrod');
                    }
                };
                img.src = entry.skinUrl;
            });
    }

    window.equipSkin = equipSkin;

    /* ------------------------------------------------------------------ *
     * Download
     * ------------------------------------------------------------------ */

    function downloadSkin(entry) {
        var link = document.createElement('a');
        link.href = entry.skinUrl;
        link.download = entry.fileName;
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        link.remove();
        if (typeof window.toast === 'function') {
            window.toast('DOWNLOAD', 'Saved ' + entry.fileName, '#7CFC98');
        }
    }

    /* ------------------------------------------------------------------ *
     * Import: folder picker + single file upload
     * ------------------------------------------------------------------ */

    function addFromFiles(fileList, asFolders) {
        var groups = {};
        var order = [];

        Array.prototype.forEach.call(fileList, function (file) {
            if (!isImageName(file.name)) return;
            var path = file.webkitRelativePath || file.name;
            var parts = path.split('/').filter(Boolean);
            var folder = (asFolders && parts.length >= 2)
                ? parts[parts.length - 2]
                : parts[parts.length - 1].replace(/\.[^.]+$/, '');
            if (!groups[folder]) { groups[folder] = []; order.push(folder); }
            groups[folder].push({ file: file, base: parts[parts.length - 1] });
        });

        var added = 0;
        order.forEach(function (name) {
            var files = groups[name];
            var skin = null;
            var preview = null;
            files.forEach(function (item) {
                if (item.base.toLowerCase().indexOf(previewPrefix().toLowerCase()) === 0) preview = item.file;
                else if (!skin) skin = item.file;
            });
            skin = skin || (files[0] && files[0].file);
            if (!skin) return;

            var skinUrl = URL.createObjectURL(skin);
            var previewUrl = preview ? URL.createObjectURL(preview) : null;
            state.blobUrls.push(skinUrl);
            if (previewUrl) state.blobUrls.push(previewUrl);

            state.library = state.library.filter(function (entry) { return entry.name !== name; });
            state.library.unshift({
                name: name,
                skinUrl: skinUrl,
                previewUrl: previewUrl,
                fileName: skin.name || (name + '.png'),
                source: 'imported'
            });
            added++;
        });

        return added;
    }

    window.pickSkinFolder = function () {
        var input = el('skinfolder');
        if (!input) return;
        try { input.webkitdirectory = true; } catch (e) {}
        input.click();
    };

    window.pickSingleSkinFile = function () {
        var input = el('skinfileinput');
        if (!input) return;
        input.click();
    };

    function initPickers() {
        var folderInput = el('skinfolder');
        if (folderInput) {
            folderInput.addEventListener('change', function () {
                var files = folderInput.files;
                if (files && files.length) {
                    var added = addFromFiles(files, true);
                    if (added) {
                        window.showView && window.showView('skins');
                        renderSkins();
                        if (typeof window.toast === 'function') {
                            window.toast('SKINS LOADED', added + (added === 1 ? ' skin' : ' skins') +
                                ' loaded for this session.', '#7CFC98');
                        }
                    } else if (typeof window.toast === 'function') {
                        window.toast('NO SKINS FOUND', 'That folder did not contain any images.', 'goldenrod');
                    }
                }
                folderInput.value = '';
            });
        }

        var fileInput = el('skinfileinput');
        if (fileInput) {
            fileInput.addEventListener('change', function () {
                var files = fileInput.files;
                if (files && files.length) {
                    var added = addFromFiles(files, false);
                    if (added) {
                        window.showView && window.showView('skins');
                        renderSkins();
                        // Uploading is an explicit "use this" action - equip it.
                        var entry = state.library[0];
                        if (entry) equipSkin(entry);
                    }
                }
                fileInput.value = '';
            });
        }
    }

    /* ------------------------------------------------------------------ *
     * Boot
     * ------------------------------------------------------------------ */

    function init() {
        initPickers();
        // The Skins view starts hidden; render once so the count is right when
        // the tab is opened, and re-render on demand afterwards.
        renderSkins();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
