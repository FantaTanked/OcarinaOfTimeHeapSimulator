// The placement planner finds moves in the Deku Tree that leave a bombchu at 801FAAA0 and reach the light arrows cutscene
const fs = require("fs");
const { data, rules } = require("./load");

const romPath = process.env.N64_ROM;
if (!romPath || !fs.existsSync(romPath)) {
    console.log("SKIP  planner (set N64_ROM to a local NTSC 1.2 ROM)");
    process.exit(0);
}
const rom = new N64Rom(new Uint8Array(fs.readFileSync(romPath)), data);
const example = rules.EXAMPLES.lacsFull.state;
const warp = example.steps.map((s) => s.type).lastIndexOf("wrongWarp");
const results = N64Route.runRoute(data, rules, example.flags, example.steps, rom).results;
const start = N64Planner.startSteps(results, warp).suggested;
const kinds = Object.fromEntries(Object.keys(N64Planner.MOVES).map((k) => [k, true]));
const search = N64Planner.plan(data, rules, example.flags, example.steps, { start, warp, candidate: "Bombchu", target: 0x801faaa0, angle: "78D1",
    link: { pos: [0, 0, 0] }, destination: 0x28, kinds, maxMoves: 4, limit: 1, rom });
let next;
while (!(next = search.next()).done);
const found = next.value.plans[0];
const pass = !!found && example.steps[start].params.entrance === "ENTR_DEKU_TREE_0";
console.log(`${pass ? "PASS" : "FAIL"}  planner: from step ${start + 1} ${found ? found.moves.map((s) => s.type).join(", ") : "nothing"} puts a bombchu on 801FAAA0 for the light arrows cutscene`);
process.exit(pass ? 0 : 1);
