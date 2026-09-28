// The wrong warp finder rediscovers the console-verified LACS setup from the pointer alone
const fs = require("fs");
const { data, rules } = require("./load");

const romPath = process.env.N64_ROM;
if (!romPath || !fs.existsSync(romPath)) {
    console.log("SKIP  finder (set N64_ROM to a local NTSC 1.2 ROM)");
    process.exit(0);
}
const rom = new N64Rom(new Uint8Array(fs.readFileSync(romPath)), data);
const example = rules.EXAMPLES.lacsFull.state;
const warp = example.steps.map((s) => s.type).lastIndexOf("wrongWarp");
const found = N64Finder.find(data, rules, example.flags, example.steps, warp, rom);
const lacs = found.results.find((r) => r.candidate === "Bombchu" && r.offset === 0 && r.sim.destination && r.sim.destination.id === 0x28);
const pass = !!lacs && lacs.angles.some(([from, to]) => 0x78d1 >= from && 0x78d1 <= to);
console.log(`${pass ? "PASS" : "FAIL"}  finder: a bombchu at 801FAAA0 facing 0x78D1 reaches the light arrows cutscene (${found.parses} parses)`);
process.exit(pass ? 0 : 1);
