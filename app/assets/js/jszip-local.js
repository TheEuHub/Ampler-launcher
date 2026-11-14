// Zero-dependency offline PKZIP builder compatible with the JSZip subset used by Downloads
(function (root) {
    'use strict';

    const CRC_TABLE = (function () {
        const t = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) {
                c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            }
            t[n] = c >>> 0;
        }
        return t;
    })();

    function crc32(bytes) {
        let c = 0xFFFFFFFF;
        for (let i = 0; i < bytes.length; i++) {
            c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
        }
        return (c ^ 0xFFFFFFFF) >>> 0;
    }

    function toBytes(input) {
        if (input instanceof Uint8Array) return Promise.resolve(input);
        if (input instanceof ArrayBuffer) return Promise.resolve(new Uint8Array(input));
        if (typeof Blob !== 'undefined' && input instanceof Blob) {
            return input.arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
        }
        const str = String(input == null ? '' : input);
        return Promise.resolve(new TextEncoder().encode(str));
    }

    function JSZip() {
        if (!(this instanceof JSZip)) return new JSZip();
        this._entries = [];
    }

    JSZip.prototype.file = function (name, content) {
        const cleanName = String(name || '').replace(/^\/+/, '');
        this._entries.push({ name: cleanName, content: content });
        return this;
    };

    JSZip.prototype.folder = function (prefix) {
        const self = this;
        const cleanPrefix = String(prefix || '').replace(/^\/+|\/+$/g, '') + '/';
        return {
            file: function (name, content) {
                self.file(cleanPrefix + String(name || '').replace(/^\/+/, ''), content);
                return this;
            }
        };
    };

    JSZip.prototype.generateAsync = async function (opts) {
        const resolved = [];
        for (let i = 0; i < this._entries.length; i++) {
            const e = this._entries[i];
            const data = await toBytes(e.content);
            const nameBytes = new TextEncoder().encode(e.name);
            resolved.push({
                nameBytes: nameBytes,
                data: data,
                crc: crc32(data)
            });
        }

        const localParts = [];
        const centralParts = [];
        let offset = 0;

        for (let i = 0; i < resolved.length; i++) {
            const item = resolved[i];
            const nLen = item.nameBytes.length;
            const dLen = item.data.length;

            // Local file header (30 bytes + filename)
            const lfh = new Uint8Array(30 + nLen);
            const ldv = new DataView(lfh.buffer);
            ldv.setUint32(0, 0x04034b50, true);
            ldv.setUint16(4, 20, true);
            ldv.setUint16(6, 0x0800, true); // UTF-8
            ldv.setUint16(8, 0, true);      // STORE
            ldv.setUint16(10, 0, true);
            ldv.setUint16(12, 0x21, true);
            ldv.setUint32(14, item.crc, true);
            ldv.setUint32(18, dLen, true);
            ldv.setUint32(22, dLen, true);
            ldv.setUint16(26, nLen, true);
            ldv.setUint16(28, 0, true);
            lfh.set(item.nameBytes, 30);

            localParts.push(lfh, item.data);

            // Central directory header (46 bytes + filename)
            const cdh = new Uint8Array(46 + nLen);
            const cdv = new DataView(cdh.buffer);
            cdv.setUint32(0, 0x02014b50, true);
            cdv.setUint16(4, 20, true);
            cdv.setUint16(6, 20, true);
            cdv.setUint16(8, 0x0800, true);
            cdv.setUint16(10, 0, true);
            cdv.setUint16(12, 0, true);
            cdv.setUint16(14, 0x21, true);
            cdv.setUint32(16, item.crc, true);
            cdv.setUint32(20, dLen, true);
            cdv.setUint32(24, dLen, true);
            cdv.setUint16(28, nLen, true);
            cdv.setUint16(30, 0, true);
            cdv.setUint16(32, 0, true);
            cdv.setUint16(34, 0, true);
            cdv.setUint16(36, 0, true);
            cdv.setUint32(38, 0, true);
            cdv.setUint32(42, offset, true);
            cdh.set(item.nameBytes, 46);

            centralParts.push(cdh);
            offset += lfh.length + dLen;
        }

        let cdSize = 0;
        for (let i = 0; i < centralParts.length; i++) cdSize += centralParts[i].length;

        const eocd = new Uint8Array(22);
        const edv = new DataView(eocd.buffer);
        edv.setUint32(0, 0x06054b50, true);
        edv.setUint16(4, 0, true);
        edv.setUint16(6, 0, true);
        edv.setUint16(8, resolved.length, true);
        edv.setUint16(10, resolved.length, true);
        edv.setUint32(12, cdSize, true);
        edv.setUint32(16, offset, true);
        edv.setUint16(20, 0, true);

        const allParts = localParts.concat(centralParts, [eocd]);
        if (opts && opts.type === 'uint8array') {
            let total = 0;
            for (let i = 0; i < allParts.length; i++) total += allParts[i].length;
            const out = new Uint8Array(total);
            let pos = 0;
            for (let i = 0; i < allParts.length; i++) {
                out.set(allParts[i], pos);
                pos += allParts[i].length;
            }
            return out;
        }
        return new Blob(allParts, { type: 'application/zip' });
    };

    root.JSZip = JSZip;
})(typeof window !== 'undefined' ? window : globalThis);
