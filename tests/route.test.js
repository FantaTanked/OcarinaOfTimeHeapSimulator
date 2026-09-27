// Route checks against heap values logged from a real run and the console-verified LACS warp
const fs = require("fs");
const { data, Sim, rules } = require("./load");

let failures = 0;
const check = (pass, text) => {
    if (!pass) failures++;
    console.log(`${pass ? "PASS" : "FAIL"}  ${text}`);
};
const hex = (v) => v.toString(16);
const romPath = process.env.N64_ROM;
const rom = romPath && fs.existsSync(romPath) ? new N64Rom(new Uint8Array(fs.readFileSync(romPath)), data) : null;

// Free space logged by Ship when the first room's actors had spawned, before the actors waiting on the room's objects ran Init
// (Navi's sparkle code was already loaded); Gohma's skeleton tables come after this point
for (const [entrance, free] of [["ENTR_KOKIRI_FOREST_1", 0x4c4e0], ["ENTR_DEKU_TREE_0", 0x2a790], ["ENTR_DEKU_TREE_BOSS_0", 0x5e480]]) {
    const w = new Sim.World(data, rules, N64Route.makeFlags({ events: ["EVENTCHKINF_A8"] }));
    const entry = data.entrances.find((e) => e.name === entrance);
    const sceneName = Object.keys(data.sceneData).find((n) => data.sceneData[n].id === entry.scene);
    w.sceneName = sceneName;
    w.beginScene(sceneName, 0, entry.spawn);
    w.updateAll();
    w.effect("Effect_Ss_KiraKira");
    const logged = w.arena.totalFree();
    check(logged === free, `${entrance}: free ${hex(logged)} once the room's actors spawn (logged ${hex(free)})`);
}
const arrival = N64Route.runRoute(data, rules, {}, [{ type: "enter", params: { entrance: "ENTR_KOKIRI_FOREST_1" } }]).world;
check(arrival.overlays.get(arrival.actorId("Bg_Treemouth")).address === 0x801e9bb0, "Deku Tree code on arriving in the Deku Tree area at 801E9BB0");

// The full LACS route: every room change checkpoint from the logged run, then the console pointer and the warp
for (const shipObjectTiming of [false, true]) {
    const example = rules.EXAMPLES.lacsFull.state;
    const flags = { ...example.flags, shipObjectTiming };
    const { results } = N64Route.runRoute(data, rules, flags, example.steps, rom);
    const label = shipObjectTiming ? "Ship object timing" : "N64 object timing";
    const rooms = results.filter((r) => r.step.type === "room");
    const logged = [[0x49780, 0x49410], [0x25d10, 0x1e980], [0x49690, 0x3ed50], [0x23a50, 0x1c4d0]];
    logged.forEach(([free, largest], i) => {
        const before = results[results.indexOf(rooms[i + 1]) - 1].heap;
        check(before.free === free && before.largest === largest,
            `${label}, leaving room change ${i + 1}: free ${hex(before.free)}, largest ${hex(before.largest)} (logged ${hex(free)} / ${hex(largest)})`);
    });
    const yes = results.find((r) => r.step.type === "talkDekuTree" && r.step.params.part === "yes");
    check(yes.pointer.value === 0x801faaa0, `${label}, pointer after saying yes: ${Sim.addr(yes.pointer.value)} (console 801FAAA0)`);
    const chu = results.find((r) => r.step.type === "pullChu" && r.step.params.tag === "angle chu");
    check(chu.report.chu === "angle chu at 801FAAA0", `${label}, ${chu.report.chu}`);
    const last = results[results.length - 1];
    if (rom) {
        const c = last.report.cutscene;
        check(c.outcome === "runs" && c.destination && c.destination.id === 0x28, `${label}, wrong warp: ${c.outcome}, ${c.destination ? c.destination.name : c.detail}`);
    } else {
        check(/left by En_Bom_Chu/.test(last.pointer.at), `${label}, pointer at Dodongo's Cavern: ${last.pointer.at}`);
    }
}
if (!rom) console.log("SKIP  wrong warp outcome (set N64_ROM to a local NTSC 1.2 ROM)");
process.exit(failures ? 1 : 0);
