// ROM reading and the bombchu-into-flashback walk; needs a local NTSC 1.2 ROM path in N64_ROM (skipped otherwise)
const fs = require("fs");
const path = require("path");
const { data, Sim } = require("./load");

const romPath = process.env.N64_ROM;
if (!romPath || !fs.existsSync(romPath)) {
    console.log("SKIP  rom tests (set N64_ROM to a local NTSC 1.2 ROM)");
    process.exit(0);
}
const rom = new N64Rom(new Uint8Array(fs.readFileSync(romPath)), data);
let failures = 0;
const check = (pass, text) => {
    if (!pass) failures++;
    console.log(`${pass ? "PASS" : "FAIL"}  ${text}`);
};

// Decompressed files match the decomp's extracted copies
const extracted = process.env.N64_EXTRACTED;
if (extracted) {
    for (const name of ["spot00_scene", "gameplay_keep", "object_link_child"]) {
        const file = [...data.scenes, ...data.objects].find((f) => f.file === name || f.name === name);
        const expected = fs.readFileSync(path.join(extracted, name));
        let same = expected.length === file.size;
        for (let at = 0; same && at < file.size; at += 4) same = rom.readWord(file.vrom + at) === expected.readUInt32BE(at);
        check(same, `${name} decompresses to the extracted file`);
    }
}

// The bombchu header and the two skips land in the Hyrule Field flashback, which reaches the light arrows cutscene
const space = new Sim.ObjectSpace(data);
space.sceneInit(data.scenes[0x51], data.sceneData.spot00.layers["0"]);
const entry = 0x803651e8;
const result = Sim.simulateCutscene(data, entry - 8, (a) => {
    if (a === entry - 8) return { value: 0x00da03ff, source: "bombchu header" };
    if (a === entry - 4) return { value: 0x00080010, source: "bombchu header" };
    return space.readWord(a, rom);
});
check(result.outcome === "runs" && result.destination && result.destination.id === 0x28,
    `bombchu header into the Hyrule Field flashback: ${result.outcome}, ${result.destination ? result.destination.name : result.detail}`);
process.exit(failures ? 1 : 0);
