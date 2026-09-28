// Placement planner: moves that put an actor Link can leave at the address a wrong warp parses, checked on the whole route
(function (root) {
    "use strict";

    const Sim = root.N64Sim;
    const Route = root.N64Route;
    const Finder = root.N64Finder;
    const NODE = 0x30;
    const TRAVEL = ["enter", "savewarp", "wrongWarp", "warpSong", "voidOut", "faroresWind", "enterGrotto", "leaveGrotto", "gameOverContinue"];

    // How each finder candidate is left once Link stands in place facing the angle (the steps in rules.js)
    const arrow = (ammo) => () => [{ type: "shootArrow", params: { ammo, outcome: "draw only (keep it drawn)" } }];
    const PLACE = {
        "Bombchu": (angle) => [{ type: "pullChu", params: { angle, tag: "planned" } }],
        "Bomb": () => [{ type: "takeOutItem", params: { item: "bomb", tag: "planned" } }],
        "Hookshot": () => [{ type: "takeOutHookshot", params: {} }],
        "Arrow": arrow("arrow"),
        "Fire arrow": arrow("fire arrow"),
        "Ice arrow": arrow("ice arrow"),
        "Light arrow": arrow("light arrow"),
        "Slingshot seed": arrow("slingshot seed"),
        "Deku Nut": () => [{ type: "throwNut", params: { finish: false } }],
        "Boomerang": () => [{ type: "throwBoomerang", params: { finish: false } }],
        "Bottle bug": () => [{ type: "releaseBugs", params: {} }],
        "Bottle fish": () => [{ type: "releaseFromBottle", params: { what: "fish", finish: false } }],
        "Blue fire": () => [{ type: "releaseFromBottle", params: { what: "blue fire", finish: false } }],
    };
    // What can follow the placement before the route travels on; a bombchu may be dropped and blown up first
    const FINISH = {
        "Bombchu": [[], [{ type: "dropChu", params: {} }], [{ type: "dropChu", params: {} }, { type: "chuExplodes", params: { which: "planned" } }]],
    };

    // Kinds of move the search may use
    const MOVES = {
        rooms: "Go to a neighbouring room",
        enemies: "Kill enemies",
        pickups: "Collect items lying around, or let one over Link's head vanish",
        chus: "Pull, drop and blow up bombchus",
        bugs: "Release and catch bottle bugs",
        sticks: "Collect a Deku stick",
        nuts: "Collect a Deku nut",
    };

    // The moves available with these actors live in this room; holding a bombchu, Link can only drop it, walk or pick things up
    function movesFor(data, w, actors, room, kinds) {
        const out = [];
        const holding = actors.some((a) => a.name === "En_Bom_Chu" && a.held);
        if (kinds.rooms) {
            const rooms = new Set();
            for (const [front, back] of w.transitions) {
                if (front === room && back >= 0 && back !== room) rooms.add(back);
                if (back === room && front >= 0 && front !== room) rooms.add(front);
            }
            for (const next of rooms) out.push({ type: "room", params: { room: next } });
        }
        for (const a of actors) {
            const info = data.actors[data.actorIds[a.name]];
            if (kinds.enemies && !holding) {
                if (a.name === "En_Dekubaba") out.push({ type: "killDekuBaba", params: { which: a.tag } });
                else if (a.name === "En_Karebaba" && !a.dead) out.push({ type: "killWitheredBaba", params: { which: a.tag } });
                else if (info && info.category === Sim.CAT_ENEMY) out.push({ type: "killEnemy", params: { which: a.tag } });
            }
            if (kinds.chus && a.name === "En_Bom_Chu") out.push({ type: "chuExplodes", params: { which: a.tag } });
            if (kinds.pickups && a.name === "En_Item00" && !(a.params & 0x8000)) out.push({ type: "getItem", params: { which: a.tag } });
        }
        const has = (name) => actors.some((a) => a.name === name);
        if (kinds.pickups && actors.some((a) => a.name === "En_Item00" && (a.params & 0x8000))) out.push({ type: "itemGone", params: {} });
        if (kinds.chus) out.push(holding ? { type: "dropChu", params: {} } : { type: "pullChu", params: { angle: "0000" } });
        if (kinds.bugs && !holding) out.push(has("En_Insect") ? { type: "catchBugs", params: {} } : { type: "releaseBugs", params: {} });
        // A stick or nut can only be collected where one lies: a drop, or the stick a dead Withered Baba offers
        const lying = (drop) => actors.some((a) => a.name === "En_Item00" && !(a.params & 0x8000) && (a.params & 0xff) === drop);
        if (kinds.sticks && (lying(0x0d) || actors.some((a) => a.name === "En_Karebaba" && a.dead))) out.push({ type: "collectItem", params: { item: "stick" } });
        if (kinds.nuts && lying(0x0c)) out.push({ type: "collectItem", params: { item: "nut" } });
        return out;
    }

    // Steps a plan can start from: from the last change of the cutscene pointer up to the warp
    function startSteps(results, warpIndex) {
        const changes = Finder.pointerSteps(results.slice(0, warpIndex));
        const from = changes.length ? changes[changes.length - 1] : 0;
        const out = [];
        for (let i = from; i < warpIndex; i++) if (results[i] && !results[i].error) out.push(i);
        const firstEnter = out.find((i) => i > from && results[i].step.type === "enter");
        return { steps: out, suggested: firstEnter !== undefined ? firstEnter : out[out.length - 1] };
    }

    // Beam search over moves after step `start`, scoring each heap by how near first fit is to the target; hits are checked on the whole route
    function* plan(data, rules, flags, steps, options) {
        const { start, warp, candidate, target, angle, link, destination, kinds } = options;
        const beam = options.beam || 400;
        const maxMoves = options.maxMoves || 6;
        const limit = options.limit || 3;
        const spec = Finder.CANDIDATES.find((c) => c.label === candidate);
        const info = data.actors[data.actorIds[spec.actor]];
        const need = (info.instance + 15) & ~15;
        const base = steps.slice(0, start + 1);
        const travel = steps.findIndex((s, i) => i > start && TRAVEL.includes(s.type));
        const tail = steps.slice(travel, warp + 1);
        const place = [{ type: "linkAt", params: { x: link.pos[0], y: link.pos[1], z: link.pos[2], angle } }, ...PLACE[candidate](angle)];
        const rom = options.rom;
        let runs = 0;
        const node = (moves) => {
            runs++;
            const { world, results } = Route.runRoute(data, rules, flags, [...base, ...moves, ...place], rom);
            const n = base.length + moves.length;
            if (results.length < n + place.length || results.slice(base.length).some((r) => r.error)) return null;
            const before = results[n - 1];
            const blocks = before.heap.blocks;
            const head = target - NODE;
            const blockers = blocks.filter((b) => b.free && b.start < head && b.size >= need).length;
            const at = blocks.find((b) => b.start === head);
            const nearest = Math.min(...blocks.map((b) => Math.abs(b.start - head)));
            const liveActors = world.allActors().filter((a) => before.heap.actors.some((b) => b.tag === a.tag && b.instance === a.instance))
                .map((a) => ({ name: a.info.name, tag: a.tag, params: a.params, dead: !!a.dead, held: !!a.held && a.tag !== "planned" }));
            // Link can only leave the actor with his hands free
            const holding = liveActors.some((a) => a.held);
            const placed = !holding && world.live(spec.actor).some((a) => a.instance === target);
            return {
                moves, placed,
                score: blockers * 100000 + (at ? (at.free ? 0 : 1000) : 2000 + nearest / 16) + (holding ? 500 : 0),
                key: `${before.room}|${holding}|${blocks.map((b) => `${b.start.toString(16)}${b.free ? "f" : "u"}${b.size.toString(16)}`).join()}`,
                next: movesFor(data, world, liveActors, before.room, kinds),
            };
        };
        const verify = (moves) => {
            for (const finish of FINISH[candidate] || [[]]) {
                const route = [...base, ...moves, ...place, ...finish, ...tail];
                try {
                    const context = Finder.prepare(data, rules, flags, route, route.length - 1, rom);
                    if (context.baseline.destination && context.baseline.destination.id === destination) return { moves, placement: [...place, ...finish], tail, route };
                } catch (error) {
                    if (!(error instanceof Sim.SimError)) throw error;
                }
            }
            return null;
        };
        const plans = [];
        const seen = new Set();
        const first = node([]);
        if (!first) throw new Sim.SimError(`the ${candidate.toLowerCase()} can't be placed from this step`);
        seen.add(first.key);
        if (first.placed) {
            const found = verify([]);
            if (found) plans.push(found);
        }
        let frontier = [first];
        for (let depth = 1; depth <= maxMoves && plans.length < limit && frontier.length; depth++) {
            const children = [];
            let done = 0;
            for (const parent of frontier) {
                for (const move of parent.next) {
                    const child = node([...parent.moves, move]);
                    if (!child || seen.has(child.key)) continue;
                    seen.add(child.key);
                    if (child.placed && plans.length < limit) {
                        const found = verify(child.moves);
                        if (found) plans.push(found);
                    }
                    children.push(child);
                }
                yield { depth, maxMoves, done: ++done, total: frontier.length, heaps: seen.size, runs, found: plans.length };
            }
            children.sort((a, b) => a.score - b.score);
            frontier = children.slice(0, beam);
        }
        return { plans, runs, heaps: seen.size };
    }

    root.N64Planner = { MOVES, PLACE, TRAVEL, startSteps, plan };
})(typeof window !== "undefined" ? window : globalThis);
