// Reads files from the user's own NTSC 1.2 ROM in the browser: byte order, dmadata and Yaz0
(function (root) {
    "use strict";

    // Any byte order in, big-endian (.z64) out
    function toBigEndian(bytes) {
        const magic = (bytes[0] << 24 | bytes[1] << 16 | bytes[2] << 8 | bytes[3]) >>> 0;
        const out = new Uint8Array(bytes.length);
        if (magic === 0x80371240) {
            out.set(bytes);
        } else if (magic === 0x37804012) {
            for (let i = 0; i + 1 < bytes.length; i += 2) {
                out[i] = bytes[i + 1];
                out[i + 1] = bytes[i];
            }
        } else if (magic === 0x40123780) {
            for (let i = 0; i + 3 < bytes.length; i += 4) {
                out[i] = bytes[i + 3];
                out[i + 1] = bytes[i + 2];
                out[i + 2] = bytes[i + 1];
                out[i + 3] = bytes[i];
            }
        } else {
            throw new Error("not an N64 ROM");
        }
        return out;
    }

    function yaz0(src, offset, size) {
        const view = new DataView(src.buffer, src.byteOffset);
        if (view.getUint32(offset) !== 0x59617a30) throw new Error("file is not Yaz0 compressed");
        const out = new Uint8Array(view.getUint32(offset + 4));
        let s = offset + 16;
        let d = 0;
        while (d < out.length && s < offset + size) {
            const header = src[s++];
            for (let bit = 7; bit >= 0 && d < out.length; bit--) {
                if (header & (1 << bit)) {
                    out[d++] = src[s++];
                    continue;
                }
                const b1 = src[s++];
                const b2 = src[s++];
                const back = d - (((b1 & 0x0f) << 8) | b2) - 1;
                let length = b1 >> 4;
                length = length ? length + 2 : src[s++] + 0x12;
                for (let i = 0; i < length; i++) out[d++] = out[back + i];
            }
        }
        return out;
    }

    class Rom {
        constructor(bytes, data) {
            this.bytes = toBigEndian(bytes);
            this.view = new DataView(this.bytes.buffer);
            this.files = [];
            this.cache = new Map();
            let at = data.meta.dmadataStart;
            for (;;) {
                const vromStart = this.view.getUint32(at);
                const vromEnd = this.view.getUint32(at + 4);
                if (vromEnd === 0) break;
                this.files.push({ vromStart, vromEnd, romStart: this.view.getUint32(at + 8), romEnd: this.view.getUint32(at + 12) });
                at += 16;
            }
            this.check(data);
        }
        // The file table must agree with the NTSC 1.2 sizes the simulator was built from
        check(data) {
            const files = data.scenes.filter((s) => s.size).concat(data.objects.filter((o) => o.size));
            const wrong = files.filter((f) => {
                const entry = this.fileAt(f.vrom);
                return !entry || entry.vromStart !== f.vrom || entry.vromEnd - entry.vromStart !== f.size;
            });
            if (wrong.length) throw new Error(`this ROM is not NTSC 1.2 (${wrong.length} files differ)`);
        }
        fileAt(vrom) {
            let low = 0;
            let high = this.files.length - 1;
            while (low <= high) {
                const middle = (low + high) >> 1;
                const file = this.files[middle];
                if (vrom < file.vromStart) high = middle - 1;
                else if (vrom >= file.vromEnd) low = middle + 1;
                else return file;
            }
            return null;
        }
        contents(file) {
            let bytes = this.cache.get(file.vromStart);
            if (!bytes) {
                if (file.romStart === 0xffffffff) return null;
                bytes = file.romEnd === 0
                    ? this.bytes.subarray(file.romStart, file.romStart + (file.vromEnd - file.vromStart))
                    : yaz0(this.bytes, file.romStart, file.romEnd - file.romStart);
                this.cache.set(file.vromStart, bytes);
            }
            return bytes;
        }
        readWord(vrom) {
            const file = this.fileAt(vrom);
            if (!file || vrom + 4 > file.vromEnd) return null;
            const bytes = this.contents(file);
            if (!bytes) return null;
            const at = vrom - file.vromStart;
            return ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
        }
    }

    root.N64Rom = Rom;
})(typeof window !== "undefined" ? window : globalThis);
