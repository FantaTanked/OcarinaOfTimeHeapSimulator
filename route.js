// Route steps: each step changes the simulated game the way the player action does, then records the heap
(function (root) {
    "use strict";

    const Sim = root.N64Sim;
    const CS_INDEX_0 = 0xfff0;
    const SCENE_LAYER_CUTSCENE_FIRST = 4;

    // sEntranceCutsceneTable (z_demo.c:120); age 0 adult, 1 child, 2 both
    const ENTRANCE_CUTSCENES = [
        { entrance: "ENTR_HYRULE_FIELD_3", age: 2, flag: "EVENTCHKINF_A0", script: "gHyruleFieldIntroCs" },
        { entrance: "ENTR_DEATH_MOUNTAIN_TRAIL_0", age: 2, flag: "EVENTCHKINF_A1", script: "gDMTIntroCs" },
        { entrance: "ENTR_KAKARIKO_VILLAGE_0", age: 2, flag: "EVENTCHKINF_A3", script: "gKakarikoVillageIntroCs" },
        { entrance: "ENTR_ZORAS_DOMAIN_0", age: 2, flag: "EVENTCHKINF_A4", script: "gZorasDomainIntroCs" },
        { entrance: "ENTR_HYRULE_CASTLE_0", age: 1, flag: "EVENTCHKINF_A5", script: "gHyruleCastleIntroCs" },
        { entrance: "ENTR_GORON_CITY_0", age: 2, flag: "EVENTCHKINF_A6", script: "gGoronCityIntroCs" },
        { entrance: "ENTR_TEMPLE_OF_TIME_0", age: 2, flag: "EVENTCHKINF_A7", script: "gTempleOfTimeIntroCs" },
        { entrance: "ENTR_DEKU_TREE_0", age: 2, flag: "EVENTCHKINF_A8", script: "gDekuTreeIntroCs" },
        { entrance: "ENTR_HYRULE_FIELD_11", age: 0, flag: "EVENTCHKINF_EPONA_OBTAINED", script: "gHyruleFieldSouthEponaJumpCs" },
        { entrance: "ENTR_HYRULE_FIELD_13", age: 0, flag: "EVENTCHKINF_EPONA_OBTAINED", script: "gHyruleFieldEastEponaJumpCs" },
        { entrance: "ENTR_HYRULE_FIELD_12", age: 0, flag: "EVENTCHKINF_EPONA_OBTAINED", script: "gHyruleFieldWestEponaJumpCs" },
        { entrance: "ENTR_HYRULE_FIELD_15", age: 0, flag: "EVENTCHKINF_EPONA_OBTAINED", script: "gHyruleFieldGateEponaJumpCs" },
        { entrance: "ENTR_HYRULE_FIELD_16", age: 1, flag: "EVENTCHKINF_A9", script: "gHyruleFieldGetOoTCs" },
        { entrance: "ENTR_LAKE_HYLIA_0", age: 2, flag: "EVENTCHKINF_B1", script: "gLakeHyliaIntroCs" },
        { entrance: "ENTR_GERUDO_VALLEY_0", age: 2, flag: "EVENTCHKINF_B2", script: "gGerudoValleyIntroCs" },
        { entrance: "ENTR_GERUDOS_FORTRESS_0", age: 2, flag: "EVENTCHKINF_B3", script: "gGerudoFortressIntroCs" },
        { entrance: "ENTR_LON_LON_RANCH_0", age: 2, flag: "EVENTCHKINF_B4", script: "gLonLonRanchIntroCs" },
        { entrance: "ENTR_JABU_JABU_0", age: 2, flag: "EVENTCHKINF_B5", script: "gJabuIntroCs" },
        { entrance: "ENTR_GRAVEYARD_0", age: 2, flag: "EVENTCHKINF_B6", script: "gGraveyardIntroCs" },
        { entrance: "ENTR_ZORAS_FOUNTAIN_2", age: 2, flag: "EVENTCHKINF_B7", script: "gZorasFountainIntroCs" },
        { entrance: "ENTR_DESERT_COLOSSUS_0", age: 2, flag: "EVENTCHKINF_B8", script: "gDesertColossusIntroCs" },
        { entrance: "ENTR_DEATH_MOUNTAIN_CRATER_0", age: 2, flag: "EVENTCHKINF_B9", script: "gDeathMountainCraterIntroCs" },
        { entrance: "ENTR_HYRULE_CASTLE_0", age: 0, flag: "EVENTCHKINF_BA", script: "gGanonsCastleIntroCs" },
        { entrance: "ENTR_ROYAL_FAMILYS_TOMB_1", age: 2, flag: "EVENTCHKINF_5A", script: "gSunSongGraveSunSongTeachPart2Cs" },
        { entrance: "ENTR_INSIDE_GANONS_CASTLE_2", age: 2, flag: "EVENTCHKINF_BB", script: "gForestBarrierCs" },
        { entrance: "ENTR_INSIDE_GANONS_CASTLE_3", age: 2, flag: "EVENTCHKINF_BC", script: "gWaterBarrierCs" },
        { entrance: "ENTR_INSIDE_GANONS_CASTLE_4", age: 2, flag: "EVENTCHKINF_BD", script: "gShadowBarrierCs" },
        { entrance: "ENTR_INSIDE_GANONS_CASTLE_5", age: 2, flag: "EVENTCHKINF_BE", script: "gFireBarrierCs" },
        { entrance: "ENTR_INSIDE_GANONS_CASTLE_6", age: 2, flag: "EVENTCHKINF_BF", script: "gLightBarrierCs" },
        { entrance: "ENTR_INSIDE_GANONS_CASTLE_7", age: 2, flag: "EVENTCHKINF_AD", script: "gSpiritBarrierCs" },
        { entrance: "ENTR_SPIRIT_TEMPLE_BOSS_0", age: 0, flag: "EVENTCHKINF_C0", script: "gSpiritBossNabooruKnuckleIntroCs" },
        { entrance: "ENTR_GERUDOS_FORTRESS_17", age: 0, flag: "EVENTCHKINF_GERUDO_CAUGHT_TOWER_FALL", script: "gGerudoFortressFirstCaptureCs" },
        { entrance: "ENTR_DEATH_MOUNTAIN_CRATER_1", age: 2, flag: "EVENTCHKINF_B9", script: "gDeathMountainCraterIntroCs" },
        { entrance: "ENTR_KOKIRI_FOREST_12", age: 2, flag: "EVENTCHKINF_C6", script: "gKokiriForestDekuSproutPart3Cs" },
    ];

    function entranceByName(data, name) {
        return data.entrances.find((e) => e.name === name);
    }

    // The game state a route starts from, built from the flags panel
    function makeFlags(input) {
        const set = (list) => new Set(list || []);
        const scenes = {};
        for (const [scene, flags] of Object.entries(input.scenes || {})) {
            scenes[scene] = { switches: set(flags.switches), chests: set(flags.chests), collectibles: set(flags.collectibles), clears: set(flags.clears) };
        }
        return {
            adult: !!input.adult, night: !!input.night, japanese: !!input.japanese, shipObjectTiming: !!input.shipObjectTiming,
            noUpdateCulling: !!input.noUpdateCulling,
            events: set(input.events), infs: set(input.infs), itemGetInfs: set(input.itemGetInfs),
            items: set(input.items), quests: set(input.quests), equips: set(input.equips), scenes,
            gsTokens: Number(input.gsTokens) || 0, fishingGamesPlayed: Number(input.fishingGamesPlayed) || 0,
            horseScene: input.horseScene || "SCENE_HYRULE_FIELD", horsePos: input.horsePos || [-1840, 72, 5497], horseAngle: input.horseAngle !== undefined ? input.horseAngle : -0x6ad9,
            ridingEpona: !!input.ridingEpona,
            dogParams: Number(input.dogParams) || 0, dogIsLost: input.dogIsLost !== false, grottoReturnData: Number(input.grottoReturnData) || 0,
        };
    }

    // Flag queries the rules use; scene flags are per scene, temporary switch flags reset on scene load
    Object.assign(Sim.World.prototype, {
        sceneFlags() {
            const scenes = this.flags.scenes;
            if (!scenes[this.sceneName]) scenes[this.sceneName] = { switches: new Set(), chests: new Set(), collectibles: new Set(), clears: new Set() };
            return scenes[this.sceneName];
        },
        switchSet(flag) {
            return this.sceneFlags().switches.has(flag) || (this.tempSwitches || new Set()).has(flag);
        },
        // Flags_SetSwitch / Flags_UnsetSwitch from an actor: 0x20 and up are temporary and go with the scene
        setSwitch(flag) {
            (flag >= 0x20 ? (this.tempSwitches = this.tempSwitches || new Set()) : this.sceneFlags().switches).add(flag);
        },
        unsetSwitch(flag) {
            this.sceneFlags().switches.delete(flag);
            if (this.tempSwitches) this.tempSwitches.delete(flag);
        },
        chestOpened(flag) {
            return this.sceneFlags().chests.has(flag);
        },
        collected(flag) {
            return this.sceneFlags().collectibles.has(flag);
        },
        event(name) {
            return this.flags.events.has(name);
        },
        inf(name) {
            return this.flags.infs.has(name);
        },
        itemGetInf(name) {
            return this.flags.itemGetInfs.has(name);
        },
        hasItem(name) {
            return this.flags.items.has(name);
        },
        hasQuest(name) {
            return this.flags.quests.has(name);
        },
        hasEquip(name) {
            return this.flags.equips.has(name);
        },
        // Link's distance to an actor's home, from the spawn point or the last position a step gave
        near(actor, distance) {
            if (!this.linkPos || !actor.home) return false;
            const dx = actor.home.pos[0] - this.linkPos[0];
            const dy = actor.home.pos[1] - this.linkPos[1];
            const dz = actor.home.pos[2] - this.linkPos[2];
            return Math.sqrt(dx * dx + dy * dy + dz * dz) < distance;
        },
    });

    // Loads an entrance the way Play_Init does, then reports what the cutscene pointer does on the first frame
    // Cutscene_HandleConditionalTriggers (z_demo.c:2436): story cutscenes that replace the entrance and cutscene index
    function conditionalTrigger(w, entranceName, csIndex) {
        const scene = (name) => { const e = entranceByName(w.data, name); return e && w.data.scenes[e.scene] ? w.data.scenes[e.scene].enum : null; };
        const once = (flag) => !w.event(flag) && (w.flags.events.add(flag), true);
        if (entranceName === "ENTR_DESERT_COLOSSUS_1" && once("EVENTCHKINF_AC")) return ["ENTR_DESERT_COLOSSUS_0", CS_INDEX_0];
        if (entranceName === "ENTR_KAKARIKO_VILLAGE_0" && w.flags.adult && ["EVENTCHKINF_48", "EVENTCHKINF_49", "EVENTCHKINF_4A"].every((f) => w.event(f)) &&
            once("EVENTCHKINF_AA")) return [entranceName, CS_INDEX_0];
        if (entranceName === "ENTR_LOST_WOODS_9" && once("EVENTCHKINF_C1")) {
            w.flags.items.add("ITEM_OCARINA_FAIRY");
            return ["ENTR_LOST_WOODS_0", CS_INDEX_0];
        }
        if (w.hasQuest("QUEST_MEDALLION_SPIRIT") && w.hasQuest("QUEST_MEDALLION_SHADOW") && w.flags.adult && scene(entranceName) === "SCENE_TEMPLE_OF_TIME" &&
            once("EVENTCHKINF_C4")) return ["ENTR_TEMPLE_OF_TIME_0", CS_INDEX_0 + 8];
        if (scene(entranceName) === "SCENE_GANON_BOSS" && once("EVENTCHKINF_GERUDO_CAUGHT_TOWER_FALL")) return ["ENTR_GANON_BOSS_0", CS_INDEX_0];
        return [entranceName, csIndex];
    }

    function enterEntrance(w, entranceName, options = {}) {
        const data = w.data;
        let csIndex = options.cutsceneIndex || 0;
        let baseName = entranceName;
        // gSaveContext.respawnFlag: > 0 restores a respawn point (void plane, Farore's Wind, grotto exit) and skips the story triggers
        const respawnFlag = options.respawnFlag !== undefined ? options.respawnFlag : options.respawn ? 1 : 0;
        if (csIndex < CS_INDEX_0 && respawnFlag <= 0) {
            [baseName, csIndex] = conditionalTrigger(w, entranceName, csIndex);
            if (baseName !== entranceName || csIndex !== (options.cutsceneIndex || 0)) w.note(`story cutscene: ${entranceName} becomes ${baseName}, cutscene index ${Sim.hex(csIndex, 4)}`);
        }
        const base = entranceByName(data, baseName);
        if (!base) throw new Sim.SimError(`unknown entrance ${baseName}`);
        let layer = (w.flags.adult ? 2 : 0) + (w.flags.night ? 1 : 0);
        if (csIndex >= CS_INDEX_0) layer = SCENE_LAYER_CUTSCENE_FIRST + (csIndex & 0xf);
        // z_play.c:425-436 Hyrule Field as child and Kokiri Forest as adult pick their layer from story progress
        const baseScene = data.scenes[base.scene];
        if (csIndex < CS_INDEX_0 && baseScene && baseScene.enum === "SCENE_HYRULE_FIELD" && !w.flags.adult) {
            layer = ["QUEST_KOKIRI_EMERALD", "QUEST_GORON_RUBY", "QUEST_ZORA_SAPPHIRE"].every((q) => w.hasQuest(q)) ? 1 : 0;
        } else if (csIndex < CS_INDEX_0 && baseScene && baseScene.enum === "SCENE_KOKIRI_FOREST" && w.flags.adult) {
            layer = w.event("EVENTCHKINF_48") ? 3 : 2;
        }
        const entry = data.entrances.find((e) => e.index === base.index + layer);
        if (!entry || entry.scene < 0) throw new Sim.SimError(`entrance ${Sim.hex(base.index + layer, 3)} is not in the table`);
        const sceneName = Object.keys(data.sceneData).find((n) => data.sceneData[n].id === entry.scene);
        if (!sceneName) {
            const scene = data.scenes[entry.scene];
            throw new Sim.SimError(`${entry.name} leads to ${scene ? scene.enum : Sim.hex(entry.scene)}, which is not modelled yet`);
        }
        const sceneLayers = data.sceneData[sceneName].layers;
        const loadedLayer = sceneLayers[String(layer)] ? layer : layer === 3 && sceneLayers["2"] ? 2 : 0;
        // Player_Init restores the respawn point's temporary switch flags before the room's actors look at them
        w.tempSwitches = new Set(options.temp || []);
        w.tempClears = new Set();
        w.entranceName = entry.name;
        w.entranceBase = baseName;
        w.cutsceneIndex = csIndex;
        w.respawnFlag = respawnFlag;
        w.playerFirstUpdate = options.playerFirstUpdate || null;
        // Link stands at the spawn point before the room's actors look for him
        const spawnLayer = data.sceneData[sceneName].layers[String(loadedLayer)] || data.sceneData[sceneName].layers["0"];
        const spawn = spawnLayer.spawns[entry.spawn] || spawnLayer.spawns[0];
        w.linkPos = options.pos ? options.pos.slice() : spawn.pos ? spawn.pos.slice() : null;
        w.linkAngle = options.pos ? options.angle || 0 : spawn.rotY || 0;
        if (options.room !== undefined && options.room >= 0 && !spawnLayer.rooms[options.room]) throw new Sim.SimError(`room ${options.room} is not in ${sceneName}`);
        w.beginScene(sceneName, loadedLayer, entry.spawn, options.room);
        const report = { entrance: entry.name, index: entry.index, scene: data.sceneData[sceneName].enum, layer, loadedLayer };
        const offset = w.layerData.cutsceneOffset;
        const trigger = ENTRANCE_CUTSCENES.find((t) => t.entrance === baseName &&
            (t.age === 2 || t.age === (w.flags.adult ? 0 : 1)) && (!w.event(t.flag) || t.flag === "EVENTCHKINF_EPONA_OBTAINED") && csIndex < CS_INDEX_0 && respawnFlag <= 0);
        if (offset !== null && offset !== undefined && layer === loadedLayer && layer >= SCENE_LAYER_CUTSCENE_FIRST) {
            // The layer header's cutscene command sets the script before the first frame
            w.cs = { value: w.scene.base + offset, source: `${w.scene.file} layer ${layer} cutscene` };
            w.note(`cutscene pointer = ${Sim.addr(w.cs.value)}: ${w.cs.source}`);
        } else if (trigger) {
            w.flags.events.add(trigger.flag);
            w.setScenePointer(trigger.script, "entrance cutscene");
        }
        if (csIndex >= CS_INDEX_0) {
            // Cutscene_UpdateScripted runs after the first Actor_UpdateAll and parses whatever the pointer holds
            report.cutscene = w.simulateCutscene();
            report.stale = !(offset !== null && offset !== undefined && layer === loadedLayer);
        }
        w.finishScene();
        return report;
    }

    // Step catalogue: label, parameters for the editor, and what it does
    const STEPS = {
        boot: {
            label: "Power on / title screen",
            help: "The title screen loads Hyrule Field with cutscene layer 7; its script is the first pointer value.",
            params: [],
            run(w) {
                const report = enterEntrance(w, "ENTR_HYRULE_FIELD_0", { cutsceneIndex: 0xfff3 });
                delete report.cutscene;
                return report;
            },
        },
        enter: {
            label: "Enter an area",
            help: "Load an entrance normally (age and time pick the layer).",
            params: [{ key: "entrance", type: "entrance", label: "Entrance" }],
            run(w, p) {
                return enterEntrance(w, p.entrance);
            },
        },
        savewarp: {
            label: "Savewarp / reset and load the file",
            help: "Loads the file's save entrance: the dungeon entrance inside a dungeon, otherwise Link's house as child.",
            params: [{ key: "entrance", type: "entrance", label: "Save entrance", default: "ENTR_LINKS_HOUSE_0" }],
            run(w, p) {
                return enterEntrance(w, p.entrance);
            },
        },
        room: {
            label: "Go to another room",
            help: "Cross a loading plane or door into another room of the same scene.",
            params: [
                { key: "room", type: "number", label: "Room" },
                { key: "leaveEarly", type: "bool", label: "Leave again before its objects finish loading", default: false },
                { key: "onScreen", type: "text", label: "Old-room actors on screen (names, comma separated)", default: "" },
            ],
            run(w, p) {
                const onScreen = String(p.onScreen || "").split(/[\s,]+/).filter(Boolean);
                w.crossTo(Number(p.room), null, !!p.leaveEarly, onScreen);
                return { room: Number(p.room) };
            },
        },
        action: {
            label: "Player action",
            help: "An action that loads persistent code or effects for the rest of the scene.",
            params: [{ key: "action", type: "choice", label: "Action", choices: () => Object.keys(root.N64Rules.ACTIONS) }],
            run(w, p) {
                root.N64Rules.ACTIONS[p.action](w);
                return { action: p.action };
            },
        },
        spawn: {
            label: "Spawn an actor",
            help: "Any other actor appearing (a drop, a projectile). It stays until removed.",
            params: [
                { key: "actor", type: "actor", label: "Actor" },
                { key: "params", type: "hex", label: "Params", default: "0000" },
                { key: "tag", type: "text", label: "Name it", default: "" },
                { key: "x", type: "number", label: "Home X", default: 0 },
                { key: "y", type: "number", label: "Home Y", default: 0 },
                { key: "z", type: "number", label: "Home Z", default: 0 },
                { key: "angle", type: "hex", label: "Home angle", default: "0000" },
            ],
            run(w, p) {
                const home = { pos: [Number(p.x), Number(p.y), Number(p.z)], rot: [0, parseInt(p.angle, 16) << 16 >> 16, 0] };
                const actor = w.spawn(p.actor, parseInt(p.params, 16), p.tag || p.actor, { home, parent: w.player });
                w.updateAll();
                return { spawned: actor ? `${p.actor} at ${Sim.addr(actor.instance)}` : `${p.actor} did not spawn` };
            },
        },
        remove: {
            label: "Remove an actor",
            help: "An actor dies, is collected or despawns (picked by name or by its address).",
            params: [{ key: "which", type: "live", label: "Actor" }],
            run(w, p) {
                const actor = findLive(w, p.which);
                w.kill(actor, "removed by the route");
                w.updateAll();
                return { removed: `${actor.info.name} [${actor.tag}] at ${Sim.addr(actor.instance)}` };
            },
        },
        frame: {
            label: "Frames pass",
            help: "z_actor.c Actor_UpdateAll: time passes with nothing else happening, so killed actors are freed and timers run.",
            params: [{ key: "count", type: "number", label: "How many frames", default: 1 }],
            run(w, p) {
                const count = Math.max(1, Math.min(1000, Number(p.count) || 1));
                for (let i = 0; i < count; i++) w.updateAll();
                return { frames: count };
            },
        },
        spawner: {
            label: "Force a spawner on or off",
            help: "Obj_Mure / Obj_Mure2 / Obj_Mure3: load or unload a grass ring, rock ring or rupee circle now, whatever the camera says.",
            params: [
                { key: "which", type: "live", label: "Spawner (Obj_Mure, Obj_Mure2, Obj_Mure3)" },
                { key: "mode", type: "choice", label: "Do", choices: () => ["load now", "unload now", "keep loaded", "keep unloaded", "back to the camera"], default: "load now" },
            ],
            run(w, p) {
                const actor = findLive(w, p.which);
                const rule = actor.proximityRule;
                if (!rule) throw new Sim.SimError(`${actor.info.name} [${actor.tag}] is not a spawner`);
                if (actor.initPending) throw new Sim.SimError(`${actor.tag} is still waiting for its object`);
                // Forcing overrides the camera, including a spawner that has not updated yet because it was culled
                if (actor.afterUpdates && p.mode !== "back to the camera") actor.afterUpdates = null;
                const forced = { "load now": "on", "unload now": "off", "keep loaded": "on", "keep unloaded": "off", "back to the camera": undefined }[p.mode];
                rule.forced = forced;
                if (forced) w.checkProximity(actor);
                // "now" is a one-off: later moves go back to the camera
                if (p.mode === "load now" || p.mode === "unload now") rule.forced = undefined;
                w.updateAll();
                return { spawner: `${actor.info.name} [${actor.tag}]`, children: rule.children.length };
            },
        },
        playCutscene: {
            label: "Let the cutscene play",
            help: "z_demo.c Cutscene_ProcessScript: each frame an actor cue channel holds the cue with startFrame < frame <= endFrame, and actors that read cues act on them (CUES in rules.js); the destination command fires on its start frame.",
            params: [{ key: "frames", type: "number", label: "Frames to play (0 = to the destination or the end)", default: 0 }],
            run(w, p) {
                const sim = w.simulateCutscene();
                if (sim.outcome === "unknown" || !sim.header) throw new Sim.SimError(`the cutscene can't be read: ${sim.detail}`);
                if (sim.header.frames < 0) return { frames: 0, detail: sim.detail };
                const cues = sim.cues.filter((c) => !c.unknown);
                const asked = Number(p.frames) > 0 ? Number(p.frames) : Infinity;
                const last = Math.min(asked, sim.destination ? sim.destination.frame : sim.header.frames, 20000);
                const cuesAt = (frame) => {
                    const active = {};
                    // Later entries overwrite earlier ones, as the script is read in order
                    for (const c of cues) if (frame > c.start && frame <= c.end) active[c.channel] = c;
                    return active;
                };
                // Play_Update: actors update with the cues the previous frame's script pass set, then curFrame++ and the script runs
                w.csCues = {};
                for (let frame = 1; frame <= last; frame++) {
                    w.updateAll();
                    w.csFrame = frame;
                    w.csCues = cuesAt(frame);
                }
                w.updateAll();
                w.csCues = null;
                const report = { frames: last, cues: cues.length };
                if (sim.destination && last === sim.destination.frame) report.destination = `${sim.destination.name} on frame ${last}: enter it next`;
                if (sim.cues.length !== cues.length) report.unreadCues = sim.cues.length - cues.length;
                return report;
            },
        },
        pause: {
            label: "Pause and unpause",
            help: "The pause screen loads icons and textures over the object space, then the objects reload.",
            params: [{ key: "area", type: "number", label: "World map area (-1 in dungeons)", default: -1 }],
            run(w, p) {
                w.objectSpace.pauseOpened(w.flags.adult, w.flags.japanese, Number(p.area));
                w.objectSpace.pauseClosed();
                return { paused: true };
            },
        },
        pointer: {
            label: "Set the cutscene pointer by hand",
            help: "For testing: a pointer value you already know.",
            params: [{ key: "address", type: "hex", label: "Address", default: "801FAAA0" }],
            run(w, p) {
                w.cs = { value: parseInt(p.address, 16) >>> 0, source: "set by hand" };
                return { pointer: Sim.addr(w.cs.value) };
            },
        },
        wrongWarp: {
            label: "Wrong warp",
            help: "A cutscene index is set but the destination has no cutscene for it, so the stale pointer is parsed.",
            params: [
                { key: "entrance", type: "entrance", label: "Entrance loaded", default: "ENTR_DEKU_TREE_0" },
                { key: "cutsceneIndex", type: "hex", label: "Cutscene index", default: "FFF1" },
                { key: "gameOver", type: "bool", label: "Died on the warp frame (game over screen first)", default: true },
            ],
            run(w, p) {
                if (p.gameOver) w.objectSpace.gameOverOpened(w.flags.japanese);
                return enterEntrance(w, p.entrance, { cutsceneIndex: parseInt(p.cutsceneIndex, 16), respawn: !!p.gameOver });
            },
        },
    };

    function findLive(w, which) {
        const all = w.allActors();
        const byAddress = /^[0-9a-f]{8}$/i.test(which) ? all.find((a) => a.instance === parseInt(which, 16)) : null;
        const actor = byAddress || all.find((a) => a.tag === which) || all.find((a) => a.info.name === which);
        if (!actor) throw new Sim.SimError(`no live actor matches ${which}`);
        return actor;
    }

    // Runs a whole route and snapshots the game after every step
    function runRoute(data, rules, flagInput, steps, rom) {
        Sim.prepare(data);
        const w = new Sim.World(data, rules, makeFlags(flagInput), rom);
        const results = [];
        for (const step of steps) {
            const def = STEPS[step.type] || (rules.STEPS && rules.STEPS[step.type]);
            const logStart = w.log.length;
            const failStart = w.failedSpawns.length;
            let report = null;
            let error = null;
            try {
                if (step.disabled) {
                    // a step switched off in the editor is left out, so the heap after it is the heap before it
                    report = { skipped: true };
                } else {
                    if (!def) throw new Sim.SimError(`unknown step ${step.type}`);
                    if (!w.arena && !["boot", "enter", "savewarp", "wrongWarp"].includes(step.type)) throw new Sim.SimError("the route has to enter an area first");
                    const params = {};
                    for (const p of def.params) if (p.default !== undefined) params[p.key] = p.default;
                    report = def.run(w, Object.assign(params, step.params || {})) || {};
                }
            } catch (e) {
                if (!(e instanceof Sim.SimError)) throw e;
                error = e.message;
            }
            results.push({
                step, report, error,
                log: w.log.slice(logStart),
                failed: w.failedSpawns.slice(failStart),
                scene: w.sceneData ? w.sceneData.enum : null,
                room: w.curRoom,
                heap: w.arena ? snapshotHeap(w) : null,
                pointer: { value: w.cs.value, source: w.cs.source, at: w.cs.value ? w.describe(w.cs.value) : "" },
            });
            if (error) break;
        }
        return { world: w, results };
    }

    function snapshotHeap(w) {
        return {
            start: w.arena.start, end: w.arena.end, free: w.arena.totalFree(), largest: w.arena.largestFree(),
            blocks: w.arena.blocks.map((b) => ({ start: b.start, size: b.size, free: b.free, tag: b.tag })),
            actors: w.allActors().map((a) => ({ name: a.info.name, tag: a.tag, instance: a.instance, size: a.info.instance, room: a.room })),
        };
    }

    Object.assign(STEPS, root.N64Rules.STEPS);

    root.N64Route = { STEPS, runRoute, makeFlags, enterEntrance, ENTRANCE_CUTSCENES };
})(typeof window !== "undefined" ? window : globalThis);
