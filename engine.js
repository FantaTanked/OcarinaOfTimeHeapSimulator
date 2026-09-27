// N64 heap simulator engine: the NTSC 1.2 Zelda arena, actor engine, object space and cutscene parser
// Ported from the verified Python model (oot_actor_heap_sim.py) and the Ship module (N64HeapCore, N64ObjectSpace)
(function (root) {
    "use strict";

    const NODE = 0x30;
    const CAT_ENEMY = 5;
    const NUM_CATEGORIES = 12;
    const ALLOC_ABSOLUTE = 1;
    const ALLOC_PERSISTENT = 2;
    const CS_CMD_DESTINATION = 0x3e8;
    const CS_CMD_TRANSITION = 0x2d;

    const hex = (value, digits = 0) => "0x" + (value >>> 0).toString(16).toUpperCase().padStart(digits, "0");
    const addr = (value) => (value >>> 0).toString(16).toUpperCase().padStart(8, "0");
    const align16 = (value) => ((value + 15) & ~15) >>> 0;

    class SimError extends Error {}

    // __osMalloc / __osMallocR / __osFree for PLATFORM_N64 (src/libc64/__osMalloc_n64.c)
    class Arena {
        constructor(start, size) {
            const first = align16(start);
            size = (size - (first - start)) & ~15;
            this.start = first;
            this.end = first + size;
            this.blocks = [{ start: first, size: size - NODE, free: true, tag: "" }];
        }
        alloc(requested, tag, reverse = false) {
            const size = align16(requested);
            const blockSize = size + NODE;
            const count = this.blocks.length;
            for (let n = 0; n < count; n++) {
                const i = reverse ? count - 1 - n : n;
                const block = this.blocks[i];
                if (!block.free || block.size < size) continue;
                let node = block.start;
                if (blockSize < block.size) {
                    if (reverse) {
                        node = block.start + block.size - size;
                        block.size -= blockSize;
                        this.blocks.splice(i + 1, 0, { start: node, size, free: false, tag });
                    } else {
                        this.blocks.splice(i + 1, 0, { start: node + blockSize, size: block.size - blockSize, free: true, tag: "" });
                        block.size = size;
                        block.free = false;
                        block.tag = tag;
                    }
                } else {
                    block.free = false;
                    block.tag = tag;
                }
                return node + NODE;
            }
            return 0;
        }
        free(address) {
            const node = address - NODE;
            const i = this.blocks.findIndex((b) => b.start === node);
            if (i < 0 || this.blocks[i].free) throw new SimError(`free of unknown address ${addr(address)}`);
            const block = this.blocks[i];
            block.free = true;
            block.tag = "";
            if (i + 1 < this.blocks.length && this.blocks[i + 1].free) {
                block.size += NODE + this.blocks[i + 1].size;
                this.blocks.splice(i + 1, 1);
            }
            if (i > 0 && this.blocks[i - 1].free) {
                this.blocks[i - 1].size += NODE + block.size;
                this.blocks.splice(i, 1);
            }
        }
        locate(address) {
            for (const block of this.blocks) {
                if (address >= block.start && address < block.start + NODE + block.size) {
                    return { payload: block.start + NODE, size: block.size, free: block.free, header: address < block.start + NODE, tag: block.tag };
                }
            }
            return null;
        }
        largestFree() {
            return this.blocks.reduce((m, b) => (b.free && b.size > m ? b.size : m), 0);
        }
        totalFree() {
            return this.blocks.reduce((m, b) => (b.free ? m + b.size : m), 0);
        }
    }

    // The last bytes written to each Zelda arena address; the N64 never clears freed memory
    class Memory {
        constructor(base, size) {
            this.base = base;
            this.bytes = new Uint8Array(size);
            this.known = new Uint8Array(size);
            this.owner = new Int32Array(size).fill(-1);
            this.origin = new Uint32Array(size);
            this.labels = [];
        }
        range(address, size) {
            const start = Math.max(0, address - this.base);
            return [start, Math.min(this.bytes.length, Math.max(start, address + size - this.base))];
        }
        forget(address, size) {
            const [start, end] = this.range(address, size);
            this.known.fill(0, start, end);
            this.owner.fill(-1, start, end);
        }
        write(address, image, label) {
            const owner = this.labels.push(label) - 1;
            const [start, end] = this.range(address, image.bytes.length);
            for (let at = start; at < end; at++) {
                const i = at - (address - this.base);
                this.bytes[at] = image.bytes[i];
                this.known[at] = image.known[i];
                this.owner[at] = owner;
                this.origin[at] = address;
            }
        }
        readWord(address) {
            const at = address - this.base;
            if (at < 0 || at + 4 > this.bytes.length) return null;
            let word = 0;
            for (let i = 0; i < 4; i++) {
                if (!this.known[at + i]) return null;
                word = ((word << 8) | this.bytes[at + i]) >>> 0;
            }
            return word;
        }
        source(address) {
            const at = address - this.base;
            if (at < 0 || at >= this.bytes.length || this.owner[at] < 0) return null;
            return { label: this.labels[this.owner[at]], origin: this.origin[at] };
        }
    }

    // Big-endian image of an actor's base fields; Actor_Spawn zeroes the instance, other fields are unknown
    function actorImage(actor) {
        const size = actor.info.instance;
        const bytes = new Uint8Array(size);
        const known = new Uint8Array(size);
        const view = new DataView(bytes.buffer);
        const mark = (offset, length) => known.fill(1, offset, Math.min(size, offset + length));
        view.setInt16(0x00, actor.id);
        view.setUint8(0x02, actor.category);
        view.setInt8(0x03, actor.room);
        view.setUint32(0x04, actor.flags >>> 0);
        mark(0x00, 8);
        if (actor.home) {
            for (let i = 0; i < 3; i++) view.setFloat32(0x08 + i * 4, actor.home.pos[i]);
            for (let i = 0; i < 3; i++) view.setInt16(0x14 + i * 2, actor.home.rot[i]);
            mark(0x08, 0x14);
        }
        view.setUint16(0x1c, actor.params & 0xffff);
        mark(0x1c, 2);
        return { bytes, known };
    }

    // KaleidoScope_GrayOutTextureRGBA32
    function greyOut(rgba) {
        if ((rgba & 0xffffff00) === 0) return rgba;
        const r = (rgba >>> 24) & 0xff;
        const g = (rgba >>> 16) & 0xff;
        const b = (rgba >>> 8) & 0xff;
        const grey = Math.floor((r + g * 2 + b) / 7) & 0xff;
        return ((grey << 24) | (grey << 16) | (grey << 8) | (rgba & 0xff)) >>> 0;
    }

    // What occupies the memory above the Zelda arena: scene file, objects, pause and game over data
    class ObjectSpace {
        constructor(data) {
            this.data = data;
            this.spans = [];
            this.spaceStart = 0;
            this.slotIds = [];
            this.slotAddresses = [];
            this.dungeon = false;
        }
        paint(start, size, kind, vrom, base, label) {
            if (size <= 0) return;
            const end = start + size;
            const next = [];
            for (const span of this.spans) {
                if (span.end <= start || span.start >= end) {
                    next.push(span);
                    continue;
                }
                if (span.start < start) next.push({ ...span, end: start });
                if (span.end > end) next.push({ ...span, start: end });
            }
            next.push({ start, end, kind, vrom, base, label });
            next.sort((a, b) => a.start - b.start);
            this.spans = next;
        }
        paintFile(address, file, label) {
            this.paint(address, file.size, "file", file.vrom, address, label);
        }
        paintRuntime(address, size, label) {
            this.paint(address, size, "runtime", 0, 0, label);
        }
        sceneInit(scene, layout) {
            const meta = this.data.meta;
            this.dungeon = scene.dungeon;
            this.slotIds = [];
            this.slotAddresses = [];
            this.paintRuntime(meta.kaleidoArea[0], meta.kaleidoArea[1], "kaleido/player overlay area");
            this.paintRuntime(meta.messageArea[0], meta.messageArea[1], "message textbox area");
            this.paintRuntime(meta.effectArea[0], meta.effectArea[1], "EffectSs table");
            this.spaceStart = scene.base - layout.objectSpaceSize;
            this.paintFile(scene.base, scene, `${scene.file} (scene ${hex(scene.id, 2)})`);
        }
        paintObject(slot) {
            const object = this.data.objects[this.slotIds[slot]];
            if (!object || !object.size) return;
            this.paintFile(this.slotAddresses[slot], object, `${object.name} (object slot ${slot})`);
        }
        // Objects are packed one after another from the start of the object space
        syncObjects(ids) {
            let first = 0;
            while (first < this.slotIds.length && first < ids.length && this.slotIds[first] === ids[first]) first++;
            this.slotIds.length = ids.length;
            this.slotAddresses.length = ids.length;
            for (let i = first; i < ids.length; i++) {
                this.slotIds[i] = ids[i];
                const previous = i ? this.data.objects[this.slotIds[i - 1]] : null;
                this.slotAddresses[i] = i ? align16(this.slotAddresses[i - 1] + (previous ? previous.size : 0)) : this.spaceStart;
                this.paintObject(i);
            }
        }
        pauseClosed() {
            for (let i = 0; i < this.slotIds.length; i++) this.paintObject(i);
        }
        paintIconFiles(address, areaIcons, areaLabel, japanese) {
            const files = this.data.meta.pauseFiles;
            const icons24 = align16(address + files.icon_item_static.size);
            this.paintFile(icons24, files.icon_item_24_static, "icon_item_24_static");
            const area = align16(icons24 + files.icon_item_24_static.size);
            this.paintFile(area, areaIcons, areaLabel);
            const language = align16(area + areaIcons.size);
            const languageFile = japanese ? files.icon_item_jpn_static : files.icon_item_nes_static;
            this.paintFile(language, languageFile, japanese ? "icon_item_jpn_static" : "icon_item_nes_static");
            return align16(language + languageFile.size);
        }
        pauseOpened(adult, japanese, worldMapArea) {
            const pause = this.data.meta.pause;
            const files = this.data.meta.pauseFiles;
            const segment = ((this.spaceStart + 0x30) & ~0x3f) >>> 0;
            const link = this.data.objects[this.data.linkObjects[adult ? 0 : 1]];
            const keepAddress = segment + pause.renderTextureSize;
            const linkAddress = keepAddress + pause.keepBufferSize;
            this.paintRuntime(segment, pause.renderTextureSize, "pause player render texture");
            this.paintFile(keepAddress, { vrom: this.data.objects[1].vrom, size: Math.min(pause.keepBufferSize, this.data.objects[1].size) }, "pause gameplay_keep copy");
            this.paintFile(linkAddress, link, "pause link object");
            this.paintRuntime(align16(linkAddress + link.size), pause.jointTableSize, "pause joint table");
            const icons = align16(linkAddress + link.size + pause.jointTableSize);
            this.paintFile(icons, files.icon_item_static, "icon_item_static");
            const age = adult ? "Adult" : "Child";
            for (const icon of this.data.itemIcons) {
                if (icon.offset !== null && icon.age !== "None" && icon.age !== age) {
                    this.paint(icons + icon.offset, pause.itemIconSize, "grey", files.icon_item_static.vrom + icon.offset, icons + icon.offset, "icon_item_static (greyed icon)");
                }
            }
            const names = this.paintIconFiles(icons, this.dungeon ? files.icon_item_dungeon_static : files.icon_item_field_static,
                this.dungeon ? "icon_item_dungeon_static" : "icon_item_field_static", japanese);
            const nameSize = Math.max(pause.mapNameTex1Size, pause.itemNameTexSize);
            this.paintRuntime(names, nameSize, "pause item name texture");
            if (worldMapArea >= 0 && worldMapArea < pause.worldMapAreaCount) {
                const offset = (worldMapArea + pause.worldMapAreaCount * (japanese ? 0 : 1)) * pause.mapNameTex2Size + 24 * pause.mapNameTex1Size;
                this.paintFile(names + nameSize, { vrom: files.map_name_static.vrom + offset, size: pause.mapNameTex2Size }, "map_name_static");
            }
            this.paintRuntime(align16(names + nameSize + pause.mapNameTex2Size), pause.coverageSize, "pause player coverage");
        }
        gameOverOpened(japanese) {
            const files = this.data.meta.pauseFiles;
            const icons = ((this.spaceStart + 0x30) & ~0x3f) >>> 0;
            this.paintFile(icons, files.icon_item_static, "icon_item_static");
            this.paintIconFiles(icons, files.icon_item_gameover_static, "icon_item_gameover_static", japanese);
        }
        find(address) {
            let low = 0;
            let high = this.spans.length - 1;
            while (low <= high) {
                const middle = (low + high) >> 1;
                const span = this.spans[middle];
                if (address < span.start) high = middle - 1;
                else if (address >= span.end) low = middle + 1;
                else return span;
            }
            return null;
        }
        readWord(address, rom) {
            const span = this.find(address);
            if (!span) return { value: null, source: "memory the simulator does not model" };
            if (address + 4 > span.end) return { value: null, source: `${span.label} (word crosses its end)` };
            if (span.kind === "runtime") return { value: null, source: `${span.label} (runtime data)` };
            const source = `${span.label} +${hex(address - span.base)}`;
            if (!rom) return { value: null, source: `${source} (load your ROM to read it)` };
            const word = rom.readWord(span.vrom + (address - span.base));
            if (word === null) return { value: null, source: `${source} (not readable from the ROM)` };
            return { value: span.kind === "grey" ? greyOut(word) : word, source };
        }
    }

    // Actor_Spawn always gets a position: without one given, a spawned actor starts where its spawner (or Link) is
    function defaultHome(parent, linkPos) {
        const pos = parent && parent.home ? parent.home.pos : linkPos;
        return pos ? { pos: pos.slice(), rot: parent && parent.home ? parent.home.rot.slice() : [0, 0, 0] } : null;
    }

    class World {
        constructor(data, rules, flags, rom) {
            this.data = data;
            this.rules = rules;
            this.flags = flags || {};
            this.rom = rom || null;
            this.memory = new Memory(data.meta.zeldaStart, 0x80000);
            this.objectSpace = new ObjectSpace(data);
            this.arena = null;
            this.arenaSize = 0;
            this.cs = { value: 0, source: "never set since power on" };
            this.log = [];
            this.uid = 0;
            this.failedSpawns = [];
            this.state = {};
        }
        note(text) {
            this.log.push(text);
        }
        actorId(name) {
            const id = this.data.actorIds[name];
            if (id === undefined) throw new SimError(`unknown actor ${name}`);
            return id;
        }

        // ---- scenes and rooms ----
        // Play_Init: arena, persistent objects, Player, then the spawn room; frame one runs Actor_UpdateAll then the cutscene
        beginScene(sceneName, layer, spawnIndex, respawnRoom) {
            this.spawnIndex = spawnIndex;
            const sceneData = this.data.sceneData[sceneName];
            if (!sceneData) throw new SimError(`scene ${sceneName} is not modelled`);
            const layerData = sceneData.layers[String(layer)] || sceneData.layers["0"];
            this.scene = this.data.scenes[sceneData.id];
            this.sceneData = sceneData;
            this.layerData = layerData;
            this.sceneName = sceneName;
            this.layer = layer;
            const base = this.data.meta.zeldaStart;
            if (layerData.arenaSize < this.arenaSize) this.memory.forget(base + layerData.arenaSize, this.arenaSize - layerData.arenaSize);
            this.memory.forget(base, NODE);
            this.arenaSize = layerData.arenaSize;
            this.arena = new Arena(base, layerData.arenaSize);
            this.lists = Array.from({ length: NUM_CATEGORIES }, () => []);
            this.overlays = new Map();
            this.absoluteSpace = 0;
            this.effects = new Map();
            this.curRoom = -1;
            this.prevRoom = -1;
            this.transitions = layerData.transitions.map((t) => t.slice());
            this.pendingEntries = [];
            this.clearedRooms = new Set();
            this.player = null;
            this.slots = [];
            this.sceneState = {};
            this.objectSpace.sceneInit(this.scene, layerData);
            this.loadPersistentObject(1);
            if (layerData.keep) this.loadPersistentObject(layerData.keep);
            this.loadPersistentObject(this.data.linkObjects[this.flags.adult ? 0 : 1]);
            this.objectSpace.syncObjects(this.slots.map((s) => s.id));
            const spawn = layerData.spawns[spawnIndex] || layerData.spawns[0];
            // z_room.c:673 a respawn loads the respawn point's room instead of the spawn's
            const room = respawnRoom !== undefined && respawnRoom >= 0 ? respawnRoom : spawn.room;
            this.note(`load ${sceneData.enum} layer ${layer}, spawn ${spawnIndex} in room ${room}`);
            this.requestRoom(room);
            this.spawn("Player", 0x0fff, "player");
            // Play_Init: Actor_InitPlayerHorse runs once the room's objects are listed and before the room's actors
            this.processRoom(() => this.rules.onPlayInit && this.rules.onPlayInit(this));
            this.rules.onSceneStart(this);
            this.updateAll();
        }
        finishScene() {
            this.finishObjectLoads();
            this.updateAll();
            this.updateAll();
            this.rules.onSceneSettled(this);
        }
        loadScene(sceneName, layer, spawnIndex) {
            this.beginScene(sceneName, layer, spawnIndex);
            this.finishScene();
        }
        loadPersistentObject(id) {
            this.slots.push({ id, loaded: true });
            this.persistentSlots = this.slots.length;
        }
        objectSlot(id) {
            return this.slots.findIndex((s) => s.id === id);
        }
        objectLoaded(slot) {
            return slot >= 0 && slot < this.slots.length && this.slots[slot].loaded;
        }
        // Scene_CommandObjectList (z_scene.c)
        sceneObjectList(objects) {
            let i = this.persistentSlots;
            let k = 0;
            while (i < this.slots.length) {
                if (k >= objects.length || this.slots[i].id !== objects[k]) {
                    this.slots.length = i;
                    for (const actor of this.actors()) {
                        if (!this.objectLoaded(actor.slot)) this.kill(actor, "Actor_KillAllWithMissingObject");
                    }
                    continue;
                }
                i++;
                k++;
            }
            for (const id of objects.slice(k)) this.slots.push({ id, loaded: false });
        }
        // Object_UpdateEntries: on N64 the object DMAs finish in slot order, and actors waiting on each one act as it
        // arrives; Ship's Object_UpdateBank marks every pending object loaded at once (z_scene.c, SOH [Port])
        finishObjectLoads() {
            for (const slot of this.slots) slot.loaded = true;
            this.objectSpace.syncObjects(this.slots.map((s) => s.id));
            this.updateAll();
        }
        objectsLoaded(ids) {
            return ids.every((id) => this.objectLoaded(this.objectSlot(id)));
        }
        requestRoom(room) {
            this.prevRoom = this.curRoom;
            this.curRoom = room;
        }
        processRoom(beforeActors) {
            const room = this.layerData.rooms[this.curRoom];
            this.sceneObjectList(room.objects);
            if (beforeActors) beforeActors();
            this.pendingEntries = room.actors.map((entry, index) => ({ entry, index }));
            this.spawnTransitionActors();
        }
        // Actor_SpawnTransitionActors (z_actor.c)
        spawnTransitionActors() {
            this.transitions.forEach((entry, index) => {
                const [front, back, actorId, params] = entry;
                if (actorId < 0) return;
                const near = (r) => r >= 0 && (r === this.curRoom || r === this.prevRoom);
                if (near(front) || near(back)) {
                    this.spawn(actorId & 0x1fff, (index << 10) + params, `transition ${index} (${front}|${back})`, { transition: index });
                    entry[2] = -actorId;
                }
            });
        }
        // Actor_UpdateAll: entry spawns, pending inits, deletion of killed actors
        updateAll() {
            const entries = this.pendingEntries;
            this.pendingEntries = [];
            for (const { entry, index } of entries) {
                const [id, x, y, z, rx, ry, rz, params] = entry;
                const tag = `room${this.curRoom} entry${index} p${params.toString(16).padStart(4, "0")}`;
                this.spawn(id, params, tag, { home: { pos: [x, y, z], rot: [rx, ry, rz] }, entry: index });
            }
            for (const actor of this.actors()) {
                if (actor === this.player && this.playerFirstUpdate) {
                    const run = this.playerFirstUpdate;
                    this.playerFirstUpdate = null;
                    run(this);
                }
                if (this.csCues && this.rules.cue && !actor.killed && !actor.initPending) this.rules.cue(this, actor);
                if (actor.afterUpdates && !actor.killed && !actor.initPending && --actor.updatesLeft <= 0) {
                    const run = actor.afterUpdates;
                    actor.afterUpdates = null;
                    run();
                }
                if (actor.firstUpdate && !actor.killed && this.objectsLoaded(actor.waitObjects)) {
                    const run = actor.firstUpdate;
                    actor.firstUpdate = null;
                    run();
                }
                if (actor.initPending) {
                    if (this.objectLoaded(actor.slot)) this.runInit(actor);
                } else if (!this.objectLoaded(actor.slot)) {
                    this.kill(actor, "object not loaded");
                } else if (actor.killed) {
                    this.delete(actor, actor.killReason);
                }
            }
        }
        // Room_FinishRoomChange -> func_80031B14
        // Off-screen actors are deleted at once; on-screen ones are killed and freed by a later Actor_UpdateAll, or
        // stay allocated while their object is missing
        finishRoomChange(onScreen) {
            this.prevRoom = -1;
            for (const actor of this.actors()) {
                if (actor.room < 0 || actor.room === this.curRoom) continue;
                if (onScreen && (onScreen.includes(actor.info.name) || onScreen.includes(`#${actor.entry}`))) {
                    this.kill(actor, `room change (actor room ${actor.room}, on screen)`);
                    this.destroy(actor);
                } else {
                    this.delete(actor, `room change (actor room ${actor.room})`);
                }
            }
            this.spawnTransitionActors();
        }
        settle() {
            if (this.flags.shipObjectTiming) {
                this.finishObjectLoads();
                this.updateAll();
                this.updateAll();
                return;
            }
            this.updateAll();
            this.finishObjectLoads();
            this.updateAll();
            this.updateAll();
        }
        // A loading plane: the new room loads while the old room's actors live, then the old room is dropped
        crossTo(room, beforeFinish, leaveEarly, onScreen) {
            const from = this.curRoom;
            const plane = this.live("En_Holl").find((a) => {
                const entry = a.transition !== undefined && this.transitions[a.transition];
                return entry && [entry[0], entry[1]].includes(from) && [entry[0], entry[1]].includes(room);
            });
            this.requestRoom(room);
            if (plane) plane.room = room;
            this.processRoom();
            this.updateAll();
            if (beforeFinish) beforeFinish(this);
            this.finishRoomChange(onScreen);
            if (leaveEarly) this.updateAll();
            else this.settle();
        }

        // ---- actors ----
        *actors() {
            for (const list of this.lists) for (const actor of list.slice()) yield actor;
        }
        allActors() {
            return [...this.actors()];
        }
        live(name) {
            return this.allActors().filter((a) => a.info.name === name);
        }
        // Actor_Spawn (z_actor.c), including its NULL returns
        spawn(key, params, tag, options = {}) {
            const id = typeof key === "number" ? key : this.actorId(key);
            const info = this.data.actors[id];
            if (!info) throw new SimError(`unknown actor id ${hex(id)}`);
            let overlay = null;
            if (info.overlay) {
                overlay = this.overlays.get(id);
                if (!overlay) {
                    let address;
                    if (info.alloc & ALLOC_ABSOLUTE) {
                        if (!this.absoluteSpace) this.absoluteSpace = this.allocate(this.data.meta.absoluteSpaceSize, "absolute overlay space", true);
                        address = this.absoluteSpace;
                    } else {
                        address = this.allocate(info.overlay, `code ${info.name}`, (info.alloc & ALLOC_PERSISTENT) !== 0);
                    }
                    if (!address) {
                        this.failedSpawns.push(`${info.name} [${tag}] code`);
                        return null;
                    }
                    overlay = { address, count: 0 };
                    this.overlays.set(id, overlay);
                }
            }
            const slot = this.objectSlot(info.object);
            if (slot < 0 || (info.category === CAT_ENEMY && this.clearedRooms.has(this.curRoom))) {
                if (overlay) this.freeOverlay(id);
                return null;
            }
            const instance = this.allocate(info.instance, `${info.name} [${tag}]`, false);
            if (!instance) {
                this.failedSpawns.push(`${info.name} [${tag}] instance`);
                if (overlay) this.freeOverlay(id);
                return null;
            }
            if (overlay) overlay.count++;
            const actor = {
                uid: ++this.uid, id, info, params, tag, instance, room: this.curRoom, category: info.category,
                flags: info.flags, slot, transition: options.transition, entry: options.entry,
                home: options.home || defaultHome(options.parent, this.linkPos), initPending: false, killed: false, destroyed: false,
            };
            this.lists[actor.category].unshift(actor);
            if (options.parent && actor.room >= 0) actor.room = options.parent.room;
            if (this.objectLoaded(slot)) this.runInit(actor);
            else actor.initPending = true;
            return actor;
        }
        runInit(actor) {
            actor.initPending = false;
            if (actor.info.name === "Player") {
                actor.room = -1;
                this.allocate(this.data.meta.giObjectSegmentSize, "Player giObjectSegment", false);
                this.player = actor;
                this.spawn("En_Elf", 0, "Navi");
                return;
            }
            if (actor.info.name === "En_Elf" && actor.params === 0) {
                actor.room = -1;
                return;
            }
            this.rules.init(this, actor);
        }
        // Proximity spawners (Obj_Mure, Obj_Mure2, Obj_Mure3) spawn their group when Link comes in range and remove it
        // when he leaves; re-checked whenever Link moves, in the game's update order
        proximity(actor, spawnDistance, removeDistance, make) {
            actor.proximityRule = { spawnDistance, removeDistance, make, children: [] };
            // FLAGS 0: the first Update only runs after a draw pass has seen it, so the second Update is frame 3
            this.afterUpdates(actor, 3, () => this.checkProximity(actor));
        }
        // Math3D_Dist1DSq(projectedPos.x, projectedPos.z): the actor through the game's 60 degree, 4:3 perspective
        // (z_view.c), with the camera behind Link along his facing; falls back to Link's distance without a facing
        projectedDistance(actor) {
            const pos = actor.home ? actor.home.pos : null;
            if (!pos || !this.linkPos) return Infinity;
            if (this.linkAngle === undefined || this.linkAngle === null) return Math.hypot(pos[0] - this.linkPos[0], pos[1] - this.linkPos[1], pos[2] - this.linkPos[2]);
            const yaw = (this.linkAngle / 0x8000) * Math.PI;
            const fx = Math.sin(yaw), fz = Math.cos(yaw);
            const back = this.cameraDistance || 250;
            const eye = [this.linkPos[0] - fx * back, this.linkPos[1] + (this.cameraHeight || 60), this.linkPos[2] - fz * back];
            const at = [this.linkPos[0], this.linkPos[1] + 40, this.linkPos[2]];
            let f = [at[0] - eye[0], at[1] - eye[1], at[2] - eye[2]];
            const fl = Math.hypot(...f); f = f.map((v) => v / fl);
            let r = [f[2], 0, -f[0]]; const rl = Math.hypot(...r) || 1; r = r.map((v) => v / rl);
            const d = [pos[0] - eye[0], pos[1] - eye[1], pos[2] - eye[2]];
            const xView = d[0] * r[0] + d[1] * r[1] + d[2] * r[2];
            const depth = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
            const near = 10, far = 12800, cot = 1 / Math.tan(Math.PI / 6);
            const xClip = xView * cot / (4 / 3);
            const zClip = depth * (near + far) / (far - near) - (2 * near * far) / (far - near);
            return Math.hypot(xClip, zClip);
        }
        checkProximity(actor) {
            const rule = actor.proximityRule;
            if (!rule || actor.killed) return;
            rule.children = rule.children.filter((c) => this.lists[c.category].includes(c) && !c.killed);
            // a spawner forced from the route ignores the camera: loaded is always in range, unloaded never
            const distance = rule.forced === "on" ? 0 : rule.forced === "off" ? Infinity : this.projectedDistance(actor);
            if (!rule.children.length && distance < rule.spawnDistance) {
                rule.children = make(rule).filter(Boolean);
            } else if (rule.children.length && distance >= rule.removeDistance) {
                for (const child of rule.children) this.kill(child, "spawner out of range");
                rule.children = [];
            }
            function make(r) { return r.make(); }
        }
        updateProximity() {
            for (const actor of this.actors()) if (actor.proximityRule && !actor.initPending && !actor.afterUpdates) this.checkProximity(actor);
            this.updateAll();
        }
        // Work an actor does on its nth Update after Init
        afterUpdates(actor, count, fn) {
            actor.updatesLeft = count;
            actor.afterUpdates = fn;
        }
        // Work an actor does in its first Update once the objects it waits for have loaded
        whenObjectsLoaded(actor, objects, fn) {
            actor.waitObjects = objects.map((name) => this.data.objectIds[name]);
            actor.firstUpdate = fn;
        }
        kill(actor, why) {
            if (!actor.killed) {
                actor.killed = true;
                actor.killReason = why;
            }
        }
        destroy(actor) {
            if (actor.destroyed) return;
            actor.destroyed = true;
            if (actor.transition !== undefined) {
                if (actor.info.name === "Door_Shutter" && actor.room < 0) return;
                const entry = this.transitions[actor.transition];
                entry[2] = -entry[2];
            }
        }
        // Actor_Delete: the instance keeps its bytes until something is allocated over them
        delete(actor, why) {
            this.destroy(actor);
            // Destroy frees the blocks the actor allocated for itself (skeleton tables, skins) before the instance goes
            for (const block of actor.arenaAllocs || []) if (block) this.arena.free(block);
            const list = this.lists[actor.category];
            list.splice(list.indexOf(actor), 1);
            this.memory.write(actor.instance, actorImage(actor), `${actor.info.name} [${actor.tag}]`);
            this.arena.free(actor.instance);
            if (actor.info.overlay) {
                this.overlays.get(actor.id).count--;
                this.freeOverlay(actor.id);
            }
            if (this.rules.onDelete) this.rules.onDelete(this, actor, why);
        }
        // Actor_FreeOverlay
        freeOverlay(id) {
            const info = this.data.actors[id];
            const overlay = this.overlays.get(id);
            if (!overlay || overlay.count !== 0 || info.alloc & ALLOC_PERSISTENT) return;
            if (!(info.alloc & ALLOC_ABSOLUTE)) this.arena.free(overlay.address);
            this.overlays.delete(id);
        }
        changeCategory(actor, category) {
            const list = this.lists[actor.category];
            list.splice(list.indexOf(actor), 1);
            actor.category = category;
            this.lists[category].unshift(actor);
        }
        // An actor that spawns and is gone within a few frames, such as a held item being put away
        spawnAndRemove(name, params, why, options = {}) {
            const actor = this.spawn(name, params, options.tag || name, { parent: this.player, ...options });
            if (actor) this.kill(actor, why);
            this.updateAll();
            return actor;
        }

        // ---- other allocations ----
        allocate(size, tag, reverse) {
            const address = this.arena.alloc(size, tag, reverse);
            if (address) this.memory.forget(address - NODE, NODE + align16(size) + NODE);
            return address;
        }
        // A block the actor frees again in its Destroy
        allocateFor(actor, size, tag, reverse) {
            const address = this.allocate(size, tag, reverse);
            if (address) (actor.arenaAllocs = actor.arenaAllocs || []).push(address);
            return address;
        }
        // EffectSs_Spawn: the first spawn of a type loads its code from the top of the arena for the rest of the scene
        effect(name) {
            if (this.effects.has(name)) return;
            const effect = this.data.effects[this.data.effectIds[name]];
            if (!effect) throw new SimError(`unknown effect ${name}`);
            if (!effect.overlay) return;
            const address = this.allocate(effect.overlay, `effect code ${name}`, true);
            if (address) this.effects.set(name, address);
        }

        // ---- cutscene pointer ----
        setScenePointer(name, why) {
            const script = this.data.scripts.find((s) => s.name && (s.name === name || s.name.endsWith(`/${name}`)));
            if (!script) throw new SimError(`unknown scene cutscene ${name}`);
            this.cs = { value: script.address, source: `${script.name}${why ? ` (${why})` : ""}` };
            this.note(`cutscene pointer = ${addr(script.address)}: ${this.cs.source}`);
        }
        setActorPointer(actorName, offset, why) {
            const overlay = this.overlays.get(this.actorId(actorName));
            if (!overlay) throw new SimError(`${actorName}'s code is not loaded`);
            const value = overlay.address + offset;
            this.cs = { value, source: `${actorName} code at ${addr(overlay.address)} + ${hex(offset)}${why ? ` (${why})` : ""}` };
            this.note(`cutscene pointer = ${addr(value)}: ${this.cs.source}`);
        }

        // ---- reading N64 memory ----
        findActorAt(address) {
            return this.allActors().find((a) => address >= a.instance && address < a.instance + a.info.instance) || null;
        }
        describe(address) {
            if (!this.arena) return "outside the actor heap";
            const block = this.arena.locate(address);
            if (!block) return "outside the actor heap";
            if (block.header) return `heap block header before ${addr(block.payload)}`;
            if (block.free) {
                const source = this.memory.source(address);
                if (source) return `free memory, left by ${source.label} at ${addr(source.origin)} +${hex(address - source.origin)}`;
                return `free memory at ${addr(block.payload)} +${hex(address - block.payload)}`;
            }
            return `${block.tag} at ${addr(block.payload)} +${hex(address - block.payload)}`;
        }
        readWord(address) {
            const base = this.data.meta.zeldaStart;
            if (address >= base && address < base + this.arenaSize) {
                const actor = this.findActorAt(address);
                if (actor) {
                    const image = actorImage(actor);
                    const offset = address - actor.instance;
                    const source = `${actor.info.name} [${actor.tag}] (live) at ${addr(actor.instance)} +${hex(offset)}`;
                    if (offset + 4 > image.bytes.length || !image.known.subarray(offset, offset + 4).every((k) => k)) return { value: null, source };
                    return { value: new DataView(image.bytes.buffer).getUint32(offset), source };
                }
                const value = this.memory.readWord(address);
                const source = this.describe(address);
                return { value, source: value === null ? `${source} (contents not tracked)` : source };
            }
            return this.objectSpace.readWord(address, this.rom);
        }
        // csCtx.actorCues / playerCue while a cutscene plays: the cue on that channel for the current frame, or null
        cue(channel) {
            return this.csCues ? this.csCues[channel] || null : null;
        }
        simulateCutscene() {
            return simulateCutscene(this.data, this.cs.value, (a) => this.readWord(a));
        }
    }

    // Cutscene_ProcessScript's walk (z_demo.c); the same bytes are parsed every frame, so the first frame decides the outcome
    function simulateCutscene(data, address, read) {
        const handled = new Set(data.meta.cutsceneCommands);
        const steps = [];
        const cues = [];
        const result = { address, outcome: "unknown", header: null, steps, destination: null, detail: "", cues };
        const first = read(address);
        const second = read(address + 4);
        result.source = first.source;
        if (first.value === null || second.value === null) {
            result.detail = `reads ${addr(first.value === null ? address : address + 4)}: ${first.value === null ? first.source : second.source}`;
            return result;
        }
        const entries = first.value | 0;
        const frames = second.value | 0;
        result.header = { entries, frames, source: first.source };
        if (frames < 0) {
            result.outcome = "ends";
            result.detail = "the frame count is negative, so the cutscene ends at once";
            return result;
        }
        // The parser's loop counters are s16, so a count above 0x7FFF only stops at CS_CMD_END_OF_SCRIPT
        const S16_MAX = 0x7fff;
        const MAX_COMMANDS = 0x10000;
        const limit = entries <= S16_MAX ? entries : MAX_COMMANDS;
        let script = address + 8;
        let commands = 0;
        let i = 0;
        const word = (at) => {
            const w = read(at);
            if (w.value === null) throw { unmodelled: w.source, at };
            return w.value;
        };
        try {
            for (; i < limit; i++) {
                const at = script;
                const w = read(script);
                if (w.value === null) throw { unmodelled: w.source, at };
                const command = w.value | 0;
                script += 4;
                if (command === -1) {
                    steps.push({ at, text: "END_OF_SCRIPT", source: w.source });
                    break;
                }
                const channel = data.csCueChannels[String(command)];
                if (channel !== undefined) {
                    // CsCmdActorCue (cutscene.h): id, startFrame, endFrame, rot, startPos, endPos in 0x30 bytes
                    const count = Math.max(0, word(script) | 0);
                    for (let j = 0; j < count; j++) {
                        const words = [];
                        for (let k = 0; k < 12; k++) words.push(read(script + 4 + j * 0x30 + k * 4).value);
                        if (words.some((v) => v === null)) {
                            cues.push({ channel, command, unknown: true });
                            continue;
                        }
                        const pos = (k) => [words[k] | 0, words[k + 1] | 0, words[k + 2] | 0];
                        cues.push({ channel, command, id: words[0] >>> 16, start: words[0] & 0xffff, end: words[1] >>> 16,
                            rot: [words[1] & 0xffff, words[2] >>> 16, words[2] & 0xffff], startPos: pos(3), endPos: pos(6) });
                    }
                }
                if (handled.has(command)) {
                    const size = commandSize(command, script, word);
                    let text = data.csCommandNames[command] || `command ${hex(command)}`;
                    if (command === CS_CMD_DESTINATION || command === CS_CMD_TRANSITION) {
                        const value = word(script + 4);
                        const end = word(script + 8) >>> 16;
                        const id = value >>> 16;
                        const start = value & 0xffff;
                        if (command === CS_CMD_DESTINATION) {
                            const name = data.csDestinations[id] || hex(id);
                            text = `DESTINATION ${name} (frames ${start}-${end})`;
                            if (!result.destination) result.destination = { id, name, frame: start, end };
                        } else {
                            text = `TRANSITION ${hex(id)} (frames ${start}-${end})`;
                        }
                    }
                    steps.push({ at, text, source: w.source, handled: true });
                    script += size;
                    commands++;
                    continue;
                }
                const countWord = read(script);
                if (countWord.value === null) throw { unmodelled: countWord.source, at: script };
                const count = countWord.value | 0;
                script += 4;
                if (count > S16_MAX) {
                    steps.push({ at, text: `unknown command ${hex(command)} with ${hex(count)} entries`, source: w.source });
                    result.outcome = "hang";
                    result.detail = `unknown command ${hex(command)} has ${hex(count)} entries; the s16 counter never reaches it`;
                    return result;
                }
                const skip = Math.max(count, 0) * 0x30;
                steps.push({ at, text: `unknown command ${hex(command)}: skip ${hex(Math.max(count, 0))} x 0x30 to ${addr(script + skip)}`, source: w.source });
                script += skip;
            }
        } catch (error) {
            if (error && error.unmodelled !== undefined) {
                result.outcome = "unknown";
                result.detail = `reads ${addr(error.at)}: ${error.unmodelled}`;
                return result;
            }
            throw error;
        }
        if (i === MAX_COMMANDS) {
            result.outcome = "hang";
            result.detail = "the command loop never reaches its entry count";
            return result;
        }
        result.outcome = commands ? "runs" : "empty";
        result.detail = commands ? `${commands} commands` : "no commands the game acts on";
        return result;
    }

    // Bytes a handled command's data occupies, following CopyCommand in N64ObjectSpace.cpp
    function commandSize(command, script, word) {
        switch (command) {
            case 0x01: case 0x02: case 0x05: case 0x06: case 0x07: case 0x08: {
                let size = 8;
                for (let point = 0; point < 0x1000; point++) {
                    const flag = (word(script + size) >>> 24) << 24 >> 24;
                    size += 0x10;
                    if (flag === -1) return size;
                }
                throw { unmodelled: "a camera command without an end point", at: script };
            }
            case CS_CMD_TRANSITION:
            case CS_CMD_DESTINATION:
                return 12;
            case 0x09: case 0x8c: case 0x13:
                return 4 + 0xc * Math.max(0, word(script) | 0);
            default:
                return 4 + 0x30 * Math.max(0, word(script) | 0);
        }
    }

    // Lookup tables derived from the exported data
    function prepare(data) {
        if (data.actorIds) return data;
        data.actorIds = {};
        data.actors.forEach((a, id) => { if (a) data.actorIds[a.name] = id; });
        data.effectIds = {};
        data.effects.forEach((e, id) => { data.effectIds[e.name] = id; });
        data.objectIds = {};
        data.objects.forEach((o, id) => { if (o.enum) data.objectIds[o.enum] = id; });
        data.linkObjects = [data.objectIds.OBJECT_LINK_BOY, data.objectIds.OBJECT_LINK_CHILD];
        data.csCommandNames = {};
        for (const [k, v] of Object.entries(data.csCommands)) data.csCommandNames[Number(k)] = v;
        data.csDestinations = {};
        for (const [k, v] of Object.entries(data.csDestinationNames)) data.csDestinations[Number(k)] = v;
        return data;
    }

    root.N64Sim = { Arena, Memory, ObjectSpace, World, simulateCutscene, prepare, hex, addr, SimError, CAT_ENEMY };
})(typeof window !== "undefined" ? window : globalThis);
