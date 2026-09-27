// The graveyard Royal Family's Tomb unload must match the Python model and console (the grave is gone on room-1 load 19 by that count)
const { data, Sim, rules } = require("./load");

const STUCK_ON_CLIMB = new Set(["Obj_Kibako2", "Bg_Mjin", "En_Gs"]);
const STUCK_POE_TAG = "room1 entry12 p0000";

function run(actions) {
    const w = new Sim.World(data, rules, N64Route.makeFlags({ adult: true }));
    const spawns = data.sceneData.spot02.layers["2"].spawns;
    w.loadScene("spot02", 2, spawns.findIndex((s) => s.room === 0));
    w.effect("Effect_Ss_KiraKira");
    w.updateAll();
    for (const action of actions) rules.ACTIONS[action](w);
    const stuck = [];
    const history = [];
    for (let loads = 1; loads < 60; loads++) {
        if (w.curRoom === 1) crossTo(w, 0, stuck);
        crossTo(w, 1, stuck);
        const grave = w.live("Bg_Spot02_Objects").find((a) => (a.params & 0xff) === 2);
        history.push([loads, !!grave, w.arena.largestFree(), w.arena.totalFree()]);
        if (!grave) return { loads, history };
    }
    return { loads: null, history };
}

function crossTo(w, room, stuck) {
    w.crossTo(room, () => {
        if (room !== 0) return;
        for (const a of w.allActors()) {
            if (a.room === 1 && (STUCK_ON_CLIMB.has(a.info.name) || a.tag === STUCK_POE_TAG)) {
                a.room = -2;
                stuck.push(a);
            }
        }
    });
    if (room === 1) {
        for (const a of stuck) if (w.lists[a.category].includes(a)) w.delete(a, "object reloaded");
        stuck.length = 0;
    }
}

const expected = { "": 19, hookshot: 18 };
let failures = 0;
for (const [label, loads] of Object.entries(expected)) {
    const result = run(label ? label.split(",") : []);
    const first = result.history[0];
    const pass = result.loads === loads;
    if (!pass) failures++;
    console.log(`${pass ? "PASS" : "FAIL"}  graveyard ${label || "default"}: grave gone on load ${result.loads} (expected ${loads}); load 1 largest ${first[2].toString(16)} total ${first[3].toString(16)}`);
}
process.exit(failures ? 1 : 0);
