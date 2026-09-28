// Wrong warp finder: what can be left at the stale cutscene pointer, and where the parser then sends Link
(function (root) {
    "use strict";

    const Sim = root.N64Sim;
    const Route = root.N64Route;
    const NODE = 0x30;
    const ROT_Y = 0x16; // Actor.home.rot.y (actorImage)
    const POS = 0x08;   // Actor.home.pos
    const ANGLE_READ = { angleRead: true };

    // Actors Link can leave in the heap, spawned as the route steps spawn them (angle is Link's facing)
    const CANDIDATES = [
        { label: "Bombchu", actor: "En_Bom_Chu", params: 0x0000, rot: (a) => [0, a, 0] },
        { label: "Bomb", actor: "En_Bom", params: 0x0000, rot: (a) => [0, a, 0] },
        { label: "Hookshot", actor: "Arms_Hook", params: 0x0000, rot: (a) => [0, a, 0] },
        { label: "Arrow", actor: "En_Arrow", params: 0x0002, rot: (a) => [0, a, 0] },
        { label: "Fire arrow", actor: "En_Arrow", params: 0x0003, rot: (a) => [0, a, 0] },
        { label: "Ice arrow", actor: "En_Arrow", params: 0x0004, rot: (a) => [0, a, 0] },
        { label: "Light arrow", actor: "En_Arrow", params: 0x0005, rot: (a) => [0, a, 0] },
        { label: "Slingshot seed", actor: "En_Arrow", params: 0x0009, rot: (a) => [0, a, 0] },
        { label: "Deku Nut", actor: "En_Arrow", params: 0x000a, rot: (a) => [4000, a, 0] },
        { label: "Boomerang", actor: "En_Boom", params: 0x0000, rot: (a) => [0, a, 0] },
        { label: "Bottle bug", actor: "En_Insect", params: 0x0002, rot: (a) => [0x4000, a, 0] },
        { label: "Bottle fish", actor: "En_Fish", params: 0x0000, rot: (a) => [0x4000, a, 0] },
        { label: "Blue fire", actor: "En_Ice_Hono", params: 0x0000, rot: (a) => [0x4000, a, 0] },
    ];

    // The new scene's RAM when the pointer is parsed: the heap up front, the rest filled per word on first read
    const RAM = 0x80000000;
    const RAM_SIZE = 0x800000;
    const UNREAD = 0;
    const KNOWN = 1;
    const UNKNOWN = 2;
    function snapshot(w) {
        const bytes = new Uint8Array(RAM_SIZE);
        const state = new Uint8Array(RAM_SIZE);
        const memory = w.memory;
        const heapStart = w.data.meta.zeldaStart;
        for (let address = heapStart; address < heapStart + w.arenaSize; address++) {
            const i = address - memory.base;
            const known = i >= 0 && i < memory.bytes.length && memory.known[i];
            bytes[address - RAM] = known ? memory.bytes[i] : 0;
            state[address - RAM] = known ? KNOWN : UNKNOWN;
        }
        for (const actor of w.allActors()) {
            const image = Sim.actorImage(actor);
            const at = actor.instance - RAM;
            for (let i = 0; i < image.bytes.length; i++) {
                bytes[at + i] = image.bytes[i];
                state[at + i] = image.known[i] ? KNOWN : UNKNOWN;
            }
        }
        const heapEnd = heapStart + w.arenaSize;
        const written = new Uint8Array(w.arenaSize);
        for (const block of w.arena.blocks) written.fill(1, block.start - heapStart, block.start - heapStart + NODE + (block.free ? 0 : block.size));
        const objectSpace = Object.assign(Object.create(Object.getPrototypeOf(w.objectSpace)), w.objectSpace,
            { spans: w.objectSpace.spans.map((span) => ({ ...span })) });
        const rom = w.rom;
        const fill = (aligned) => {
            const value = objectSpace.readWord(RAM + aligned, rom).value;
            if (value === null) {
                state.fill(UNKNOWN, aligned, aligned + 4);
                return;
            }
            bytes[aligned] = value >>> 24;
            bytes[aligned + 1] = (value >>> 16) & 0xff;
            bytes[aligned + 2] = (value >>> 8) & 0xff;
            bytes[aligned + 3] = value & 0xff;
            state.fill(KNOWN, aligned, aligned + 4);
        };
        // The word at address, or null where it is not known
        const word = (address) => {
            const at = address - RAM;
            if (at < 0 || at + 4 > RAM_SIZE) return null;
            if ((at & 3) && (address < heapStart || address >= heapEnd)) return objectSpace.readWord(address, rom).value;
            if (state[at] === UNREAD) fill(at & ~3);
            if (state[at + 3] === UNREAD) fill((at + 3) & ~3);
            if (state[at] !== KNOWN || state[at + 1] !== KNOWN || state[at + 2] !== KNOWN || state[at + 3] !== KNOWN) return null;
            return ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
        };
        const writtenAt = (address) => {
            const at = address - heapStart;
            return at >= 0 && at < written.length && written[at] === 1;
        };
        return { word, writtenAt };
    }

    // The parser's read with the candidate's bytes left at start where the new scene has not written; probe records what it reads
    function readerWith(view, start, image, probe) {
        const pool = Array.from({ length: 8 }, () => ({ value: null, source: "" }));
        let next = 0;
        const size = image.bytes.length;
        const bytes = image.bytes;
        const known = image.known;
        return (address, purpose) => {
            const result = pool[(next = (next + 1) & 7)];
            const at = address - start;
            if (at >= 0 && at + 4 <= size && !view.writtenAt(address) && !view.writtenAt(address + 3)) {
                if (probe) {
                    if (at <= ROT_Y + 1 && at + 4 > ROT_Y) probe.angle(purpose, address);
                    if (at < POS + 12 && at + 4 > POS) probe.position = true;
                    probe.reads.fill(1, at, at + 4);
                }
                result.value = known[at] && known[at + 1] && known[at + 2] && known[at + 3]
                    ? ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0 : null;
                return result;
            }
            result.value = view.word(address);
            return result;
        };
    }

    function outcomeKey(sim) {
        return sim.destination ? `dest:${sim.destination.id}` : `outcome:${sim.outcome}`;
    }

    // Consecutive angles with the same result, as ranges
    function ranges(angles) {
        const out = [];
        for (const a of angles) {
            const last = out[out.length - 1];
            if (last && a === last[1] + 1) last[1] = a;
            else out.push([a, a]);
        }
        return out;
    }

    // Runs the route to the chosen wrong warp and captures the new scene at the moment it parses the stale pointer
    function prepare(data, rules, flags, steps, warpIndex, rom) {
        const step = steps[warpIndex];
        if (!step || step.type !== "wrongWarp") throw new Sim.SimError("pick a Wrong warp step");
        // Earlier steps (the title screen, other warps) parse the pointer too; only the chosen warp's parse is searched
        let earlierParses = 0;
        const before = warpIndex > 0 ? Route.runRoute(data, rules, flags, steps.slice(0, warpIndex), rom, { onCutsceneParse: () => earlierParses++ }).results : [];
        const last = before[before.length - 1];
        const link = last && last.link ? last.link : { pos: [0, 0, 0], angle: 0 };
        const oldHeap = last && last.heap ? { start: last.heap.start, end: last.heap.end } : null;
        let context = null;
        let parsesSeen = 0;
        const onCutsceneParse = (w) => {
            if (parsesSeen++ < earlierParses) return;
            const pointer = w.cs.value;
            // A layer with its own cutscene just plays it: the pointer is not stale, so it is not a wrong warp
            const ownCutscene = /layer \d+ cutscene$/.test(w.cs.source || "");
            const inHeap = !!oldHeap && pointer >= oldHeap.start && pointer < oldHeap.end;
            context = { data, pointer, link, view: snapshot(w), scene: w.sceneData.enum, layer: w.layer, entrance: w.entranceName,
                ownCutscene, inHeap, baseline: Sim.simulateCutscene(data, pointer, (a) => w.readWord(a)) };
        };
        Route.runRoute(data, rules, flags, steps.slice(0, warpIndex + 1), rom, { onCutsceneParse });
        if (!context) throw new Sim.SimError("the warp did not parse the cutscene pointer (is the cutscene index 0xFFF0 or above?)");
        return context;
    }

    // Every candidate (every parts-th one from part) at every offset around the pointer; yields progress after each
    function* search(context, part = 0, parts = 1) {
        const { data, pointer, link, view } = context;
        const memo = new Map();
        const results = [];
        const work = [];
        for (const c of context.inHeap && !context.ownCutscene ? CANDIDATES.filter((_, i) => i % parts === part) : []) {
            const id = data.actorIds[c.actor];
            const info = data.actors[id];
            if (!info) continue;
            for (let offset = 0; offset < info.instance; offset += 0x10) work.push({ c, id, info, offset });
        }
        let parses = 0;
        // Searches done at each offset and the candidate bytes they read, reused for a candidate with the same bytes there
        const done = new Map();
        for (let n = 0; n < work.length; n++) {
            const { c, id, info, offset } = work[n];
            const size = info.instance;
            const start = pointer - offset;
            const make = (angle) => Sim.actorImage({ id, info, category: info.category, room: -1, flags: info.flags,
                params: c.params, home: { pos: link.pos.slice(), rot: c.rot(angle << 16 >> 16) } });
            const base = { candidate: c.label, offset, start };
            const image = make(0);
            if (!done.has(offset)) done.set(offset, []);
            const same = done.get(offset).find((d) => d.size === size && d.reads.every((read, i) => !read || (image.bytes[i] === d.image.bytes[i] && image.known[i] === d.image.known[i])));
            if (same) {
                for (const r of same.results) results.push({ ...r, ...base });
                yield { done: n + 1, total: work.length, parses };
                continue;
            }
            const reads = new Uint8Array(size);
            const noAngle = () => {};
            const parse = (angle, probe = { position: false, reads, angle: noAngle }) => {
                parses++;
                return Sim.simulateCutscene(data, pointer, readerWith(view, start, make(angle), probe), true, memo, start + size);
            };
            // Probe: stop at the first read of the angle and learn what the parser uses it for
            const probe = { position: false, role: null, reads, angle(purpose) { this.role = purpose; throw ANGLE_READ; } };
            let sim = null;
            try {
                sim = parse(link.angle, probe);
            } catch (error) {
                if (error !== ANGLE_READ) throw error;
            }
            base.dependsOnPosition = probe.position;
            const found = [];
            if (sim) {
                found.push({ ...base, sim, angles: null });
            } else {
                const byOutcome = new Map();
                const add = (result, angles) => {
                    const key = outcomeKey(result);
                    if (!byOutcome.has(key)) byOutcome.set(key, { sim: result, angles: [] });
                    const list = byOutcome.get(key).angles;
                    for (const angle of angles) list.push(angle);
                };
                const rotX = c.rot(0)[0] & 0xffff;
                if (probe.role === "command") {
                    // As a command id, only the ids the parser handles (and end of script) differ; any other angle is an unknown command
                    const special = new Set();
                    for (const command of data.handledCommands || data.meta.cutsceneCommands) if (((command >>> 16) & 0xffff) === rotX) special.add(command & 0xffff);
                    if (rotX === 0xffff) special.add(0xffff);
                    for (const angle of special) add(parse(angle), [angle]);
                    const rest = [];
                    for (let angle = 0; angle < 0x10000; angle++) if (!special.has(angle)) rest.push(angle);
                    if (rest.length) add(parse(rest[0]), rest);
                } else {
                    // As a count or data (or the header), every angle can differ
                    for (let angle = 0; angle < 0x10000; angle++) add(parse(angle), [angle]);
                }
                for (const { sim: result, angles } of byOutcome.values()) {
                    angles.sort((x, y) => x - y);
                    found.push({ ...base, sim: result, angles: ranges(angles), angleRole: probe.role });
                }
            }
            for (const r of found) results.push(r);
            done.get(offset).push({ size, image, reads, results: found });
            yield { done: n + 1, total: work.length, parses };
        }
        context.results = results;
        context.parses = parses;
    }

    // Everything that leaves gSaveContext.nextCutsceneIndex pending outside a cutscene script, and when (the decomp's checks)
    const INDEX_SOURCES = [
        { index: "FFF1", scene: "SCENE_DEKU_TREE_BOSS", what: "Gohma's blue warp, the first time", adult: false, notEvents: ["EVENTCHKINF_07"] }, // z_door_warp1.c
        { index: "FFF1", scene: "SCENE_DODONGOS_CAVERN_BOSS", what: "King Dodongo's blue warp, the first time", adult: false, notEvents: ["EVENTCHKINF_25"] },
        { index: "FFF0", scene: "SCENE_JABU_JABU_BOSS", what: "Ruto's blue warp after Barinade", adult: false, notQuests: ["QUEST_ZORA_SAPPHIRE"] },
        { index: "FFF3", scene: "SCENE_FIRE_TEMPLE_BOSS", what: "Volvagia's blue warp, the first time", adult: true, notEvents: ["EVENTCHKINF_49"] },
        { index: "FFF1", scene: "SCENE_SPIRIT_TEMPLE", what: "the Silver Gauntlets chest", adult: false }, // z_player.c
        { index: "FFF1", scene: "SCENE_LON_LON_RANCH", what: "playing Epona's Song for Malon", adult: false, events: ["EVENTCHKINF_TALON_RETURNED_FROM_CASTLE"], notQuests: ["QUEST_SONG_EPONA"] }, // z_en_ma1.c
        { index: "FFF1", scene: "SCENE_HYRULE_FIELD", what: "reaching the drawbridge as Zelda escapes", adult: false,
            quests: ["QUEST_KOKIRI_EMERALD", "QUEST_GORON_RUBY", "QUEST_ZORA_SAPPHIRE"], notEvents: ["EVENTCHKINF_ZELDA_FLED_CASTLE"] }, // z_bg_spot00_hanebasi.c
        { index: "FFF7", scene: "SCENE_CASTLE_COURTYARD_ZELDA", what: "the end of Zelda's courtyard talk", adult: false, notEvents: ["EVENTCHKINF_OBTAINED_ZELDAS_LETTER"] }, // z_en_zl4.c
        { index: "FFF2", scene: "SCENE_GANON_BOSS", what: "Ganon's defeat", adult: true }, // z_boss_ganon2.c
        { index: "FFF0", scene: "SCENE_LON_LON_RANCH", what: "starting Malon's obstacle course", adult: true, events: ["EVENTCHKINF_EPONA_OBTAINED"] }, // z_en_ma3.c
        { index: "FFF0", scene: "SCENE_LON_LON_RANCH", what: "Ingo's horse race", adult: true, notEvents: ["EVENTCHKINF_EPONA_OBTAINED"] }, // z_en_in.c
        { index: "FFF0", scene: "SCENE_GERUDOS_FORTRESS", what: "paying for horseback archery", adult: true,
            events: ["EVENTCHKINF_EPONA_OBTAINED"], quests: ["QUEST_GERUDOS_CARD"] }, // z_en_ge1.c
    ];

    // The index sources Link can use (in one scene, or anywhere) with the route's flags as they stand
    function indexSources(w, sceneEnum) {
        return INDEX_SOURCES.filter((s) => (!sceneEnum || s.scene === sceneEnum) && s.adult === !!w.flags.adult &&
            (s.events || []).every((f) => w.event(f)) && !(s.notEvents || []).some((f) => w.event(f)) &&
            (s.quests || []).every((q) => w.hasQuest(q)) && !(s.notQuests || []).some((q) => w.hasQuest(q)));
    }

    // Wrong warps from a step: dying (respawning at rules.gameOverEntrance) or voiding out while a source's index is pending
    function warpOptions(rules, entrance, sceneEnum, sources) {
        const options = [];
        for (const cutsceneIndex of [...new Set(sources.map((s) => s.index))]) {
            const source = sources.filter((s) => s.index === cutsceneIndex).map((s) => s.what).join(" or ");
            options.push({ entrance: rules.gameOverEntrance(entrance, sceneEnum), cutsceneIndex, gameOver: true, source });
            options.push({ entrance, cutsceneIndex, gameOver: false, source });
        }
        return options;
    }

    // Every wrong warp from step `index`, and the searches to run for them (warps loading the same scene the same way share one)
    function explorePlan(data, rules, flags, steps, index, rom) {
        const prefix = steps.slice(0, index + 1);
        const { world, results } = Route.runRoute(data, rules, flags, prefix, rom);
        const here = results[index];
        if (!here || !here.entrance || here.error) throw new Sim.SimError("this step has not entered an area");
        const sources = indexSources(world, null);
        // Sources in other areas are reached by going straight to the area's first entrance from this step
        const options = [];
        for (const source of sources) {
            if (source.scene === here.scene) {
                for (const warp of warpOptions(rules, here.entrance, here.scene, [source])) options.push({ warp, travel: null });
                continue;
            }
            const entrances = data.entrances.filter((e) => data.scenes[e.scene] && data.scenes[e.scene].enum === source.scene);
            const entrance = entrances.find((e) => /_0$/.test(e.name)) || entrances[0];
            if (entrance) for (const warp of warpOptions(rules, entrance.name, source.scene, [source])) options.push({ warp, travel: entrance.name });
        }
        const warps = [];
        const searches = [];
        const seen = new Map();
        for (const { warp, travel } of options) {
            const route = [...prefix, ...(travel ? [{ type: "enter", params: { entrance: travel } }] : []), { type: "wrongWarp", params: warp }];
            let context;
            try {
                context = prepare(data, rules, flags, route, route.length - 1, rom);
            } catch (error) {
                if (!(error instanceof Sim.SimError)) throw error;
                continue; // no such entrance for this cutscene index
            }
            context.view = null;
            context.travel = travel;
            const key = `${travel}|${context.entrance}|${context.layer}|${warp.gameOver}|${context.pointer}`;
            if (seen.has(key)) {
                context.sharedWith = seen.get(key);
            } else if (context.ownCutscene || !context.inHeap) {
                Object.assign(context, { results: [], parses: 0 }); // nothing Link leaves in the heap is read
            } else {
                seen.set(key, context);
                searches.push({ steps: route, warpIndex: route.length - 1, context });
            }
            warps.push({ warp, context });
        }
        return { step: index, entrance: here.entrance, scene: here.scene, pointer: here.pointer.value, warps, searches, sources };
    }

    // Puts the results of searches split into parts back in the order one search gives them
    function merge(context, parts) {
        const order = new Map(CANDIDATES.map((c, i) => [c.label, i]));
        context.results = parts.flatMap((p) => p.results).sort((x, y) => order.get(x.candidate) - order.get(y.candidate) || x.offset - y.offset);
        context.parses = parts.reduce((sum, p) => sum + p.parses, 0);
    }

    // Warps that shared a search take its results
    function finishPlan(plan) {
        for (const { context } of plan.warps) {
            if (context.sharedWith) Object.assign(context, { results: context.sharedWith.results, parses: 0 });
        }
        return plan;
    }

    // One part of a search, from scratch (a worker's job); the results are plain data a worker can post
    function runJob(data, rules, job, rom, onProgress) {
        const context = prepare(data, rules, job.flags, job.steps, job.warpIndex, rom);
        for (const progress of search(context, job.part, job.parts)) if (onProgress) onProgress(progress);
        const plain = ({ outcome, destination, detail }) => ({ outcome, destination, detail });
        return { results: context.results.map((r) => ({ ...r, sim: plain(r.sim) })), parses: context.parses };
    }

    // explorePlan and its searches one after another, where workers are not available; yields progress
    function* explore(data, rules, flags, steps, index, rom) {
        const plan = explorePlan(data, rules, flags, steps, index, rom);
        for (let n = 0; n < plan.searches.length; n++) {
            const { steps: route, warpIndex, context } = plan.searches[n];
            const full = prepare(data, rules, flags, route, warpIndex, rom);
            for (const progress of search(full)) yield { warp: n + 1, warps: plan.searches.length, ...progress };
            Object.assign(context, { results: full.results, parses: full.parses });
        }
        return finishPlan(plan);
    }

    // Everything an exploration found, grouped by destination; each entry says which warp and what to leave
    function exploreByDestination(explored) {
        const groups = new Map();
        const add = (key, destination, outcome, item) => {
            if (!groups.has(key)) groups.set(key, { key, destination, outcome, items: [] });
            groups.get(key).items.push(item);
        };
        for (const { warp, context } of explored.warps) {
            if (context.ownCutscene) continue;
            const b = context.baseline;
            if (b.outcome !== "unknown") add(outcomeKey(b), b.destination, b.outcome, { warp, context, leave: null });
            for (const r of context.results || []) {
                if (r.sim.outcome === "unknown") continue;
                add(outcomeKey(r.sim), r.sim.destination, r.sim.outcome, { warp, context, leave: r });
            }
        }
        return [...groups.values()].sort((a, b) => (b.destination ? 1 : 0) - (a.destination ? 1 : 0) || b.items.length - a.items.length);
    }

    // Steps worth exploring: each first step after the cutscene pointer changes
    function pointerSteps(results) {
        const steps = [];
        let last = null;
        results.forEach((r, i) => {
            if (!r.error && r.entrance && r.pointer && r.pointer.value !== last) {
                steps.push(i);
                last = r.pointer.value;
            }
        });
        return steps;
    }

    // The whole search at once (tests)
    function find(data, rules, flags, steps, warpIndex, rom) {
        const context = prepare(data, rules, flags, steps, warpIndex, rom);
        for (const progress of search(context)) void progress;
        return context;
    }

    // Groups results by where they send Link; unknown outcomes are left out
    function byDestination(found) {
        const groups = new Map();
        for (const r of found.results) {
            if (r.sim.outcome === "unknown") continue;
            const key = outcomeKey(r.sim);
            if (!groups.has(key)) groups.set(key, { key, destination: r.sim.destination, outcome: r.sim.outcome, detail: r.sim.detail, setups: [] });
            groups.get(key).setups.push(r);
        }
        return [...groups.values()].sort((a, b) => (b.destination ? 1 : 0) - (a.destination ? 1 : 0) || b.setups.length - a.setups.length);
    }

    root.N64Finder = { CANDIDATES, INDEX_SOURCES, prepare, search, find, byDestination, warpOptions, explorePlan, finishPlan, merge, runJob, explore,
        exploreByDestination, pointerSteps };
})(typeof window !== "undefined" ? window : globalThis);
