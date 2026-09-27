// Page logic: the flags panel, the route editor and the results view
(function () {
    "use strict";

    const data = N64Sim.prepare(window.N64_DATA);
    const rules = window.N64Rules;
    const Route = window.N64Route;
    const addr = N64Sim.addr;
    const hex = N64Sim.hex;
    const $ = (id) => document.getElementById(id);
    const el = (tag, props = {}, ...children) => {
        const node = document.createElement(tag);
        for (const [k, v] of Object.entries(props)) {
            if (k === "class") node.className = v;
            else if (k === "style") node.style.cssText = v;
            else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
            else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? "" : v);
        }
        for (const child of children.flat(Infinity)) if (child !== null && child !== undefined) node.append(child.nodeType ? child : String(child));
        return node;
    };

    const emptyState = () => ({ flags: { adult: false, night: false, japanese: false, events: [], infs: [], scenes: {} }, steps: [] });
    let state = emptyState();
    let selected = -1;
    let rom = null;
    let lastRun = null;

    // ---- storage and sharing ----
    // Undo history: a snapshot of the route and flags after every change
    const history = [];
    let historyIndex = -1;
    function record() {
        const snapshot = JSON.stringify(state);
        if (history[historyIndex] === snapshot) return;
        history.splice(historyIndex + 1);
        history.push(snapshot);
        if (history.length > 200) history.shift();
        historyIndex = history.length - 1;
        updateHistoryButtons();
    }
    function restore(delta) {
        const target = historyIndex + delta;
        if (target < 0 || target >= history.length) return;
        historyIndex = target;
        state = normalise(JSON.parse(history[historyIndex]));
        selected = Math.min(selected, state.steps.length - 1);
        updateHistoryButtons();
        save();
        renderFlags();
        run(true);
    }
    function updateHistoryButtons() {
        $("undo").disabled = historyIndex <= 0;
        $("redo").disabled = historyIndex >= history.length - 1;
    }

    function save() {
        try {
            localStorage.setItem("n64heap-state", JSON.stringify(state));
        } catch (e) { /* storage may be unavailable */ }
    }
    function load() {
        try {
            if (location.hash.length > 1) return JSON.parse(decodeURIComponent(escape(atob(location.hash.slice(1)))));
        } catch (e) { /* ignore a broken link */ }
        try {
            const saved = localStorage.getItem("n64heap-state");
            if (saved) return JSON.parse(saved);
        } catch (e) { /* storage may be unavailable */ }
        return null;
    }

    // ---- entrances and actors for the pickers ----
    const modelledScenes = new Set(Object.values(data.sceneData).map((s) => s.id));
    const entranceChoices = data.entrances
        .filter((e) => modelledScenes.has(e.scene) && !/_\d+_\d+$/.test(e.name))
        .map((e) => ({ value: e.name, label: `${e.name.replace("ENTR_", "")} (${data.scenes[e.scene].enum.replace("SCENE_", "")} spawn ${e.spawn})` }));
    const actorNames = data.actors.filter(Boolean).map((a) => a.name).sort();
    document.body.append(el("datalist", { id: "actorList" }, actorNames.map((n) => el("option", { value: n }))));

    // ---- flags panel ----
    const names = data.flagNames;
    const storyLabels = new Map(rules.FLAGS.map((f) => [f.id, f]));
    const usedFlags = new Set(rules.referencedFlags);
    // Every flag the lists offer, so the "other flags" boxes only hold names the lists don't have
    const listed = new Set([...rules.FLAGS.map((f) => f.id), ...Route.ENTRANCE_CUTSCENES.map((c) => c.flag), ...names.events.map((f) => f.id), ...names.infs.map((f) => f.id)]);
    const openSections = new Set(["story"]);
    let flagQuery = "";

    // EVENTCHKINF_MIDO_DENIED_DEKU_TREE_ACCESS -> "Mido denied deku tree access"; unnamed ones keep their number
    function prettyName(id) {
        const rest = id.replace(/^(EVENTCHKINF|INFTABLE|ITEMGETINF|QUEST|ITEM|EQUIP_INV)_/, "");
        const unused = /_UNUSED$/.test(rest);
        const core = rest.replace(/_UNUSED$/, "");
        if (/^[0-9A-F]{2}$/.test(core)) return `Flag ${core}${unused ? " (unused)" : ""}`;
        const words = core.toLowerCase().replace(/_/g, " ");
        return words.charAt(0).toUpperCase() + words.slice(1) + (unused ? " (unused)" : "");
    }
    function flagLabel(id) {
        const story = storyLabels.get(id);
        return story ? story.label : prettyName(id);
    }

    function flagRow(list, id, label, note, extra) {
        const f = state.flags;
        const box = el("input", { type: "checkbox", "data-list": list, "data-id": String(id) });
        box.checked = (f[list] || []).includes(id);
        box.addEventListener("change", () => {
            const values = new Set(f[list] || []);
            if (box.checked) values.add(id);
            else values.delete(id);
            f[list] = [...values];
            // the same flag can be listed twice (a story flag and its full list), so keep both boxes in step
            document.querySelectorAll(`#flagSections input[data-list="${list}"][data-id="${CSS.escape(String(id))}"]`).forEach((other) => { other.checked = box.checked; });
            updateCounts();
            changed(false);
        });
        const search = `${label} ${id} ${note || ""} ${extra || ""}`.toLowerCase();
        return el("label", { class: "check flag", title: String(id), "data-search": search }, box,
            el("span", {}, label, usedFlags.has(id) ? el("span", { class: "used", title: "An actor rule reads this flag" }, "used") : null,
                note ? el("div", { class: "hint" }, note) : null));
    }
    function section(key, title, children, level = 1) {
        const node = el("details", { class: `section level${level}`, "data-key": key, "data-title": title.toLowerCase() },
            el("summary", {}, el("span", {}, title), el("span", { class: "count" })), children);
        node.open = openSections.has(key);
        node.addEventListener("toggle", () => {
            if (flagQuery) return;
            if (node.open) openSections.add(key);
            else openSections.delete(key);
        });
        return node;
    }
    // A long flag list split into rows of 16, as the save file stores them
    function flagRows(key, list, flags) {
        const rows = new Map();
        for (const flag of flags) {
            const row = flag.value >> 4;
            if (!rows.has(row)) rows.set(row, []);
            rows.get(row).push(flagRow(list, flag.id, flagLabel(flag.id), flag.note, hex(flag.value, 2)));
        }
        return [...rows].map(([row, items]) => section(`${key}:${row}`, `${hex(row << 4, 2)}–${hex((row << 4) | 15, 2)}`, items, 2));
    }
    function numberRow(key, label, note, hexValue) {
        const f = state.flags;
        const input = el("input", { type: "text", inputmode: hexValue ? "text" : "numeric", value: hexValue ? hex(f[key] || 0, 4) : f[key] || 0 });
        input.addEventListener("change", () => {
            f[key] = hexValue ? parseInt(input.value, 16) || 0 : parseInt(input.value, 10) || 0;
            input.value = hexValue ? hex(f[key], 4) : f[key];
            changed(false);
        });
        return el("label", { class: "check flag number", "data-search": `${label} ${note}`.toLowerCase() }, el("span", {}, label, el("div", { class: "hint" }, note)), input);
    }

    // sEntranceCutsceneTable: until its flag is set, entering there sets the cutscene pointer to the scene's intro
    const AGES = ["adult", "child", "either age"];
    const entranceCutsceneFlags = Route.ENTRANCE_CUTSCENES.filter((c, i, all) => c.flag !== "EVENTCHKINF_EPONA_OBTAINED" && all.findIndex((o) => o.flag === c.flag) === i)
        .map((c) => {
            const words = c.script.replace(/^g/, "").replace(/Cs$/, "").replace(/^DMT/, "DeathMountainTrail").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
            const label = words.charAt(0) + words.slice(1).toLowerCase();
            return { flag: c.flag, label, note: `Plays on entering ${c.entrance.replace("ENTR_", "")} as ${AGES[c.age]}; until then that entrance sets the cutscene pointer to ${c.script}.` };
        });
    const SCENE_CATEGORIES = [["overworld", "Overworld"], ["dungeons", "Dungeons"], ["indoors", "Houses and indoors"], ["shops", "Shops"], ["misc", "Other areas"]];
    const sceneTitle = (scene) => data.scenes[scene.id].enum.replace("SCENE_", "").replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
    const questGroups = [["Medallions", /MEDALLION/], ["Songs", /SONG/], ["Stones and other", /./]];
    const equipGroups = [["Swords", /SWORD/], ["Shields", /SHIELD/], ["Tunics", /TUNIC/], ["Boots", /BOOTS/]];
    function grouped(prefix, list, ids, groups) {
        const left = [...ids];
        return groups.map(([title, test]) => {
            const mine = left.filter((id) => test.test(id));
            mine.forEach((id) => left.splice(left.indexOf(id), 1));
            return section(`${prefix}:${title}`, title, mine.map((id) => flagRow(list, id, flagLabel(id))), 2);
        });
    }

    function renderFlags() {
        const f = state.flags;
        document.querySelector(`input[name=age][value=${f.adult ? "adult" : "child"}]`).checked = true;
        document.querySelector(`input[name=time][value=${f.night ? "night" : "day"}]`).checked = true;
        $("japanese").checked = !!f.japanese;
        $("extraEvents").value = (f.events || []).filter((x) => !listed.has(x)).join(", ");
        $("extraInfs").value = (f.infs || []).filter((x) => !listed.has(x)).join(", ");
        const scroll = $("flagsPanel").scrollTop;

        const story = {};
        for (const flag of rules.FLAGS) (story[flag.group] = story[flag.group] || []).push(flagRow(flagList(flag.kind), flag.id, flag.label, flag.note));
        story["First-visit cutscenes watched"] = entranceCutsceneFlags.map((c) => flagRow("events", c.flag, c.label, c.note));
        const areas = SCENE_CATEGORIES.map(([category, title]) => {
            const scenes = Object.entries(data.sceneData).filter(([, scene]) => scene.category === category)
                .map(([name, scene]) => [name, scene, rules.sceneFlagList(data, name)]).filter(([, , items]) => items.length)
                .sort((a, b) => sceneTitle(a[1]).localeCompare(sceneTitle(b[1])));
            return section(`area:${category}`, title, scenes.map(([name, scene, items]) => {
                const flags = (f.scenes[name] = f.scenes[name] || {});
                const rows = items.map((item) => {
                    const list = (flags[item.kind] = flags[item.kind] || []);
                    const box = el("input", { type: "checkbox" });
                    box.checked = list.includes(item.flag);
                    box.addEventListener("change", () => {
                        const values = new Set(flags[item.kind]);
                        if (box.checked) values.add(item.flag);
                        else values.delete(item.flag);
                        flags[item.kind] = [...values];
                        updateCounts();
                        changed(false);
                    });
                    return el("label", { class: "check flag", "data-search": `${item.label} ${sceneTitle(scene)}`.toLowerCase() }, box, el("span", {}, item.label));
                });
                return section(`scene:${name}`, sceneTitle(scene), rows, 3);
            }), 2);
        });

        $("flagSections").replaceChildren(
            section("story", "Story", Object.entries(story).map(([group, rows]) => section(`story:${group}`, group, rows, 2))),
            section("areas", "Collected, opened and switched in each area", areas),
            section("quests", "Quest items and songs", grouped("quests", "quests", names.quests, questGroups)),
            section("items", "Inventory items", names.items.map((id) => flagRow("items", id, flagLabel(id)))),
            section("equips", "Equipment", grouped("equips", "equips", names.equips, equipGroups)),
            section("events", "Event flags (EVENTCHKINF)", flagRows("events", "events", names.events)),
            section("infs", "Info table flags (INFTABLE)", flagRows("infs", "infs", names.infs)),
            section("itemGetInfs", "Item get flags (ITEMGETINF)", flagRows("itemGetInfs", "itemGetInfs", names.itemGetInfs)),
            section("numbers", "Counts and save values", [
                numberRow("gsTokens", "Gold Skulltula tokens", "The cursed family in the Skulltula House"),
                numberRow("fishingGamesPlayed", "Fishing games played", "Low byte of the fishing high score; sets the pond's fish count"),
                numberRow("dogParams", "Dog following Link (params)", "Save dog params, in hex", true),
                numberRow("grottoReturnData", "Grotto return data", "The return respawn point's data (respawn return data), read by grotto torches"),
                flagRowBool("dogIsLost", "Richard the dog is still lost", "gSaveContext.dogIsLost"),
                horseRow(),
                flagRowBool("ridingEpona", "Link rides into the area on Epona", "The horse spawns under Link instead of where she was left", false),
            ]));
        updateCounts();
        applyFlagSearch();
        $("flagsPanel").scrollTop = scroll;
    }
    // Where adult Epona was left (save horseData); Play_Init spawns her there when Link comes back to that scene
    function horseRow() {
        const f = state.flags;
        const scenes = ["SCENE_HYRULE_FIELD", "SCENE_LAKE_HYLIA", "SCENE_GERUDO_VALLEY", "SCENE_GERUDOS_FORTRESS", "SCENE_LON_LON_RANCH"];
        const select = el("select", {}, scenes.map((id) => el("option", { value: id }, id.replace("SCENE_", "").replace(/_/g, " ").toLowerCase())));
        select.value = f.horseScene || scenes[0];
        const pos = el("input", { type: "text", value: (f.horsePos || [-1840, 72, 5497]).join(", "), title: "x, y, z", style: "width:130px" });
        const save = () => {
            f.horseScene = select.value;
            const xyz = pos.value.split(/[\s,]+/).map(Number).filter((v) => !Number.isNaN(v));
            if (xyz.length === 3) f.horsePos = xyz;
            pos.value = (f.horsePos || [-1840, 72, 5497]).join(", ");
            changed(false);
        };
        select.addEventListener("change", save);
        pos.addEventListener("change", save);
        return el("label", { class: "check flag number", "data-search": "epona horse left where scene position" }, el("span", {}, "Epona was left in", el("div", { class: "hint" }, "Scene and position x, y, z")), el("span", { class: "horse" }, select, pos));
    }
    function flagRowBool(key, label, note, defaultOn = true) {
        const box = el("input", { type: "checkbox" });
        box.checked = defaultOn ? state.flags[key] !== false : !!state.flags[key];
        box.addEventListener("change", () => { state.flags[key] = box.checked; changed(false); });
        return el("label", { class: "check flag", "data-search": `${label} ${note}`.toLowerCase() }, box, el("span", {}, label, el("div", { class: "hint" }, note)));
    }
    // How many boxes are ticked inside each section, shown next to its title
    function updateCounts() {
        for (const node of document.querySelectorAll("#flagSections details.section")) {
            const ticked = node.querySelectorAll("input[type=checkbox]:checked").length;
            node.querySelector(":scope > summary > .count").textContent = ticked ? String(ticked) : "";
        }
    }
    // Typing in the search box shows only the matching rows and opens the sections they're in
    function applyFlagSearch() {
        const words = flagQuery.toLowerCase().split(/\s+/).filter(Boolean);
        const sections = [...document.querySelectorAll("#flagSections details.section")];
        for (const row of document.querySelectorAll("#flagSections .flag")) {
            row.hidden = words.length > 0 && !words.every((w) => row.dataset.search.includes(w));
        }
        // deepest sections first, so a parent knows whether any child section still shows something
        for (const node of sections.reverse()) {
            if (!words.length) {
                node.hidden = false;
                node.open = openSections.has(node.dataset.key);
                continue;
            }
            const titleMatch = words.every((w) => node.dataset.title.includes(w));
            if (titleMatch) node.querySelectorAll(".flag, details.section").forEach((child) => { child.hidden = false; });
            const visible = titleMatch || node.querySelector(":scope .flag:not([hidden])");
            node.hidden = !visible;
            node.open = !!visible;
        }
    }
    $("flagSearch").addEventListener("input", (e) => {
        flagQuery = e.target.value.trim();
        applyFlagSearch();
    });
    function flagList(kind) {
        return { event: "events", inf: "infs", item: "items", quest: "quests", equip: "equips", itemGetInf: "itemGetInfs" }[kind || "event"];
    }
    function readTextFlags() {
        const f = state.flags;
        const parse = (text) => text.split(/[\s,]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);
        f.events = [...new Set([...(f.events || []).filter((x) => listed.has(x)), ...parse($("extraEvents").value)])];
        f.infs = [...new Set([...(f.infs || []).filter((x) => listed.has(x)), ...parse($("extraInfs").value)])];
    }

    // ---- route editor ----
    const stepTypes = Route.STEPS;
    for (const [type, def] of Object.entries(stepTypes)) $("addType").append(el("option", { value: type }, def.label));
    searchable($("addType"));

    // Turns a <select> into a type-to-search box; the hidden select keeps the value and fires the usual change event
    function searchable(select) {
        const input = el("input", { type: "text", class: "combo-input", spellcheck: "false", autocomplete: "off" });
        const list = el("div", { class: "combo-list" });
        const wrap = el("span", { class: "combo" }, input);
        if (select.parentNode) select.replaceWith(wrap);
        wrap.append(select);
        select.hidden = true;
        let shown = [];
        let active = -1;
        const sync = () => {
            const option = select.selectedOptions[0];
            const blank = !option || option.value === "";
            input.value = blank ? "" : option.text;
            input.placeholder = blank && option ? option.text : "Search…";
        };
        const onScroll = (e) => { if (!list.contains(e.target)) input.blur(); };
        const close = () => { list.remove(); active = -1; window.removeEventListener("scroll", onScroll, true); };
        const highlight = (index) => {
            active = Math.max(0, Math.min(index, shown.length - 1));
            [...list.children].forEach((row, i) => row.classList.toggle("active", i === active));
            if (list.children[active]) list.children[active].scrollIntoView({ block: "nearest" });
        };
        const pick = (option) => {
            select.value = option.value;
            close();
            select.dispatchEvent(new Event("change"));
            sync();
            input.blur();
        };
        const open = (query) => {
            const words = query.toLowerCase().split(/\s+/).filter(Boolean);
            shown = [...select.options].filter((o) => o.value !== "" && words.every((w) => `${o.text} ${o.value}`.toLowerCase().includes(w)));
            list.replaceChildren(...shown.slice(0, 400).map((o) => el("div", { class: `combo-row${o.value === select.value ? " current" : ""}`, onmousedown: (e) => { e.preventDefault(); pick(o); } }, o.text)));
            if (!shown.length) list.append(el("div", { class: "combo-empty" }, "No match"));
            const box = input.getBoundingClientRect();
            const below = window.innerHeight - box.bottom;
            list.style.left = `${box.left}px`;
            list.style.minWidth = `${box.width}px`;
            if (below < 200 && box.top > below) { list.style.top = ""; list.style.bottom = `${window.innerHeight - box.top + 2}px`; list.style.maxHeight = `${Math.min(320, box.top - 8)}px`; }
            else { list.style.bottom = ""; list.style.top = `${box.bottom + 2}px`; list.style.maxHeight = `${Math.min(320, below - 8)}px`; }
            document.body.append(list);
            window.addEventListener("scroll", onScroll, true);
            active = -1;
        };
        input.addEventListener("focus", () => { input.select(); open(""); });
        input.addEventListener("input", () => { open(input.value); if (shown.length) highlight(0); });
        input.addEventListener("blur", () => { close(); sync(); });
        input.addEventListener("keydown", (e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); if (!list.isConnected) open(""); highlight(active + 1); }
            else if (e.key === "ArrowUp") { e.preventDefault(); highlight(active - 1); }
            else if (e.key === "Enter") { e.preventDefault(); if (shown[Math.max(active, 0)]) pick(shown[Math.max(active, 0)]); }
            else if (e.key === "Escape") { input.blur(); }
        });
        select.addEventListener("change", sync);
        select.addEventListener("sync", sync);
        sync();
        return wrap;
    }

    function defaultParams(type) {
        const params = {};
        for (const p of stepTypes[type].params) {
            if (p.default !== undefined) params[p.key] = p.default;
            else if (p.type === "entrance") params[p.key] = entranceChoices[0].value;
            else if (p.type === "choice") params[p.key] = p.choices()[0];
            else if (p.type === "number") params[p.key] = 0;
            else params[p.key] = "";
        }
        return params;
    }

    function liveNames(index) {
        const result = lastRun && lastRun.results[index - 1];
        if (!result || !result.heap) return [];
        return result.heap.actors.filter((a) => a.name !== "Player").map((a) => ({ value: a.tag, label: `${a.name} [${a.tag}] ${addr(a.instance)}` }));
    }

    function field(step, p, index) {
        const value = step.params[p.key];
        const set = (v) => {
            step.params[p.key] = v;
            changed(false);
        };
        if (p.type === "entrance" || p.type === "choice") {
            const choices = p.type === "entrance" ? entranceChoices : p.choices().map((c) => ({ value: c, label: rules.ACTION_LABELS[c] || c }));
            const select = el("select", { onchange: (e) => set(e.target.value) }, choices.map((c) => el("option", { value: c.value }, c.label)));
            select.value = value;
            return searchable(select);
        }
        if (p.type === "bool") {
            const box = el("input", { type: "checkbox", onchange: (e) => set(e.target.checked) });
            box.checked = !!value;
            return box;
        }
        if (p.type === "live") {
            const id = `live${index}`;
            const input = el("input", { type: "text", list: id, value, onchange: (e) => set(e.target.value) });
            return el("span", {}, input, el("datalist", { id }, liveNames(index).map((c) => el("option", { value: c.value }, c.label))));
        }
        const attrs = { type: p.type === "number" ? "number" : "text", value, onchange: (e) => set(e.target.value) };
        if (p.type === "actor") attrs.list = "actorList";
        return el("input", attrs);
    }

    function renderSteps() {
        const list = $("steps");
        const scroll = list.scrollTop;
        list.replaceChildren();
        if (!state.steps.length) list.append(el("div", { class: "empty" }, "No steps yet. Start with “Power on” and a savewarp, or load an example."));
        state.steps.forEach((step, index) => {
            const def = stepTypes[step.type];
            const result = lastRun && lastRun.results[index];
            const move = (delta) => (e) => {
                e.stopPropagation();
                const target = index + delta;
                if (target < 0 || target >= state.steps.length) return;
                [state.steps[index], state.steps[target]] = [state.steps[target], state.steps[index]];
                selected = target;
                changed();
            };
            const card = el("div", { class: `step${index === selected ? " selected" : ""}${result && result.error ? " error" : ""}${step.disabled ? " disabled" : ""}`, onclick: () => { selected = index; renderSteps(); renderResult(); } },
                el("div", { class: "head" },
                    el("span", { class: "num" }, index + 1),
                    el("span", { class: "title", title: def ? def.help || "" : "" }, def ? def.label : step.type),
                    el("span", { class: "tools" },
                        el("button", { title: "Move up", onclick: move(-1) }, "↑"),
                        el("button", { title: "Move down", onclick: move(1) }, "↓"),
                        el("button", { title: step.disabled ? "Switch this step back on" : "Switch this step off (skip it) to see its effect", class: step.disabled ? "off" : "", onclick: (e) => { e.stopPropagation(); if (step.disabled) delete step.disabled; else step.disabled = true; changed(false); } }, step.disabled ? "Off" : "On"),
                        el("button", { title: "Duplicate", onclick: (e) => { e.stopPropagation(); state.steps.splice(index + 1, 0, JSON.parse(JSON.stringify(step))); selected = index + 1; changed(); } }, "⧉"),
                        el("button", { title: "Delete", onclick: (e) => { e.stopPropagation(); state.steps.splice(index, 1); selected = Math.min(selected, state.steps.length - 1); changed(); } }, "✕"))),
                step.note ? el("div", { class: "hint" }, step.note) : null,
                def && def.params.length ? el("div", { class: "fields", onclick: (e) => e.stopPropagation() }, def.params.map((p) => [el("label", {}, p.label), field(step, p, index)])) : null,
                result ? el("div", { class: "summary" }, stepSummary(result)) : null);
            list.append(card);
        });
        list.scrollTop = scroll;
    }

    function stepSummary(result) {
        if (result.error) return `✕ ${result.error}`;
        const parts = [];
        if (result.report && result.report.skipped) parts.push("switched off, skipped");
        if (result.heap) parts.push(`free ${hex(result.heap.free)}, largest ${hex(result.heap.largest)}`);
        const c = result.report && result.report.cutscene;
        if (c) parts.push(outcomeText(c).title);
        if (result.failed.length) parts.push(`${result.failed.length} spawn(s) failed`);
        return parts.join(" · ");
    }

    // ---- results ----
    function outcomeText(c) {
        if (c.outcome === "runs" && c.destination) return { cls: "good", title: `Warps to ${c.destination.name} (frame ${c.destination.frame})`, body: `The parser runs ${c.detail} from ${addr(c.address)}.` };
        if (c.outcome === "runs") return { cls: "warn", title: "Runs a cutscene with no destination", body: `${c.detail}; Link is stuck in the cutscene or it ends without warping.` };
        if (c.outcome === "hang") return { cls: "bad", title: "The game hangs in the parser", body: c.detail };
        if (c.outcome === "ends") return { cls: "warn", title: "The cutscene ends at once", body: c.detail };
        if (c.outcome === "empty") return { cls: "warn", title: "Nothing happens", body: c.detail };
        return { cls: "warn", title: "Outcome unknown", body: c.detail };
    }

    function renderResult() {
        const body = $("resultBody");
        body.replaceChildren();
        const result = lastRun && lastRun.results[selected];
        if (!result) {
            body.append(el("div", { class: "empty" }, state.steps.length ? "Select a step." : "Add a step to start."));
            return;
        }
        if (result.error) body.append(el("div", { class: "banner bad" }, el("strong", {}, "This step cannot run"), result.error));
        if (result.report && result.report.skipped) body.append(el("div", { class: "banner warn" }, el("strong", {}, "This step is switched off"), "The route runs as if it weren't there, so this is the heap after the step before it."));
        const c = result.report && result.report.cutscene;
        if (c) {
            const o = outcomeText(c);
            body.append(el("div", { class: `banner ${o.cls}` }, el("strong", {}, o.title), o.body,
                result.report.stale === false ? el("div", { class: "hint" }, "The destination layer has its own cutscene, so this is not a wrong warp.") : null));
        }
        if (result.heap) {
            body.append(el("dl", { class: "kv" },
                el("dt", {}, "Area"), el("dd", {}, `${result.scene}${result.report && result.report.entrance ? ` via ${result.report.entrance} (layer ${result.report.layer})` : ""}, room ${result.room}`),
                el("dt", {}, "Heap"), el("dd", {}, `${addr(result.heap.start)}–${addr(result.heap.end)}, free ${hex(result.heap.free)}, largest free block ${hex(result.heap.largest)}`),
                el("dt", {}, "Cutscene pointer"), el("dd", {}, `${addr(result.pointer.value)} (${result.pointer.source})`),
                el("dt", {}, "It points at"), el("dd", {}, result.pointer.at || "—")));
            body.append(el("h3", {}, "Heap map"), el("canvas", { id: "heapmap" }), legend());
            drawHeap(result);
        }
        if (c) {
            body.append(el("h3", {}, "What the cutscene parser reads"));
            const rows = [];
            if (c.header) rows.push(el("tr", {}, el("td", { class: "mono" }, addr(c.address)), el("td", {}, `header: ${hex(c.header.entries)} entries, ${hex(c.header.frames)} frames`), el("td", {}, c.header.source)));
            for (const s of c.steps) rows.push(el("tr", {}, el("td", { class: "mono" }, addr(s.at)), el("td", {}, s.text), el("td", {}, s.source)));
            if (c.outcome === "unknown") rows.push(el("tr", {}, el("td", {}, ""), el("td", { colspan: 2 }, `Stops: ${c.detail}`)));
            body.append(el("div", { class: "tablewrap" }, el("table", {}, el("tr", {}, el("th", {}, "Address"), el("th", {}, "Parser"), el("th", {}, "Memory there")), rows)));
        }
        if (result.failed.length) body.append(el("h3", {}, "Spawns that did not fit"), el("div", { class: "log" }, result.failed.join("\n")));
        if (result.log.length) body.append(el("h3", {}, "Events"), el("div", { class: "log" }, result.log.join("\n")));
        if (result.heap) {
            body.append(el("h3", {}, "Heap blocks"));
            const rows = result.heap.blocks.map((b) => el("tr", {},
                el("td", { class: "mono" }, addr(b.start + 0x30)), el("td", { class: "mono" }, hex(b.size)), el("td", {}, b.free ? "free" : b.tag)));
            body.append(el("div", { class: "tablewrap" }, el("table", {}, el("tr", {}, el("th", {}, "Address"), el("th", {}, "Size"), el("th", {}, "Contents")), rows)));
        }
    }

    const COLORS = [["free", "--free"], ["actor", "--actor"], ["code", "--code"], ["Link", "--player"], ["effect code", "--effect"], ["other", "--other"], ["pointer", "--pointer"]];
    function legend() {
        return el("div", { class: "legend" }, COLORS.map(([label, v]) => el("span", { style: `--c: var(${v})` }, label)));
    }
    function blockColor(b, css) {
        if (b.free) return css("--free");
        if (b.tag.startsWith("code ") || b.tag.startsWith("absolute")) return css("--code");
        if (b.tag.startsWith("effect")) return css("--effect");
        if (b.tag.startsWith("Player") || b.tag.startsWith("En_Elf")) return css("--player");
        if (b.tag.includes("[")) return css("--actor");
        return css("--other");
    }
    function drawHeap(result) {
        const canvas = $("heapmap");
        const ratio = window.devicePixelRatio || 1;
        const width = canvas.clientWidth || 600;
        canvas.width = width * ratio;
        canvas.height = 64 * ratio;
        const ctx = canvas.getContext("2d");
        ctx.scale(ratio, ratio);
        const styles = getComputedStyle(document.documentElement);
        const css = (v) => styles.getPropertyValue(v).trim();
        const { start, end, blocks } = result.heap;
        const x = (a) => ((a - start) / (end - start)) * width;
        for (const b of blocks) {
            ctx.fillStyle = blockColor(b, css);
            const left = x(b.start);
            ctx.fillRect(left, 0, Math.max(1, x(b.start + 0x30 + b.size) - left - 0.5), 64);
        }
        const p = result.pointer.value;
        if (p >= start && p < end) {
            ctx.fillStyle = css("--pointer");
            ctx.fillRect(x(p) - 1, 0, 3, 64);
        }
        const tip = $("tooltip");
        canvas.onmousemove = (e) => {
            const a = start + ((e.offsetX / width) * (end - start));
            const b = blocks.find((k) => a >= k.start && a < k.start + 0x30 + k.size);
            if (!b) return;
            tip.style.display = "block";
            tip.style.left = `${e.clientX + 12}px`;
            tip.style.top = `${e.clientY + 12}px`;
            tip.textContent = `${addr(b.start + 0x30)} +${hex(b.size)}  ${b.free ? "free" : b.tag}`;
        };
        canvas.onmouseleave = () => { tip.style.display = "none"; };
    }

    // ---- running ----
    let timer = 0;
    function changed(rerenderFlags = true) {
        readTextFlags();
        record();
        save();
        clearTimeout(timer);
        timer = setTimeout(() => run(rerenderFlags), 60);
    }
    function run(rerenderFlags) {
        readTextFlags();
        try {
            lastRun = Route.runRoute(data, rules, JSON.parse(JSON.stringify(state.flags)), state.steps, rom);
        } catch (e) {
            lastRun = null;
            console.error(e);
            $("resultBody").replaceChildren(el("div", { class: "banner bad" }, el("strong", {}, "The simulator failed"), String(e && e.message || e)));
        }
        if (selected < 0 || selected >= state.steps.length) selected = state.steps.length - 1;
        if (rerenderFlags) renderFlags();
        renderSteps();
        if (lastRun) renderResult();
    }

    // ---- wiring ----
    document.querySelectorAll("input[name=age]").forEach((r) => r.addEventListener("change", () => { state.flags.adult = r.value === "adult" && r.checked; changed(); }));
    document.querySelectorAll("input[name=time]").forEach((r) => r.addEventListener("change", () => { state.flags.night = r.value === "night" && r.checked; changed(); }));
    $("japanese").addEventListener("change", (e) => { state.flags.japanese = e.target.checked; changed(); });
    $("extraEvents").addEventListener("change", () => changed());
    $("extraInfs").addEventListener("change", () => changed());
    $("addStep").addEventListener("click", () => {
        const type = $("addType").value;
        state.steps.push({ type, params: defaultParams(type) });
        selected = state.steps.length - 1;
        changed(false);
        setTimeout(() => { $("steps").scrollTop = $("steps").scrollHeight; }, 100);
    });
    $("exportRoute").addEventListener("click", () => { $("routeJson").value = JSON.stringify(state, null, 1); });
    // The flags panel is redrawn first, so the "other flags" boxes hold the new route's flags when changed() reads them
    function importRoute(text) {
        try {
            state = normalise(JSON.parse(text));
            selected = state.steps.length - 1;
            renderFlags();
            changed();
        } catch (e) {
            alert(`That is not a route export: ${e.message}`);
        }
    }
    $("importRoute").addEventListener("click", () => importRoute($("routeJson").value));
    $("importFile").addEventListener("click", () => $("importFileInput").click());
    $("importFileInput").addEventListener("change", async (e) => {
        const file = e.target.files[0];
        e.target.value = "";
        if (!file) return;
        if (state.steps.length && !confirm(`Replace the current route with ${file.name}? (Undo brings it back)`)) return;
        importRoute(await file.text());
    });
    $("share").addEventListener("click", async () => {
        const link = `${location.href.split("#")[0]}#${btoa(unescape(encodeURIComponent(JSON.stringify(state))))}`;
        try {
            await navigator.clipboard.writeText(link);
            $("share").textContent = "Link copied";
        } catch (e) {
            prompt("Copy this link", link);
        }
        setTimeout(() => { $("share").textContent = "Copy share link"; }, 1500);
    });
    $("reset").addEventListener("click", () => {
        state = normalise(emptyState());
        selected = -1;
        renderFlags();
        changed();
    });
    for (const [key, example] of Object.entries(rules.EXAMPLES)) $("example").append(el("option", { value: key }, example.label));
    searchable($("example"));

    // Named saves of the route and game state, kept in this browser; the heap is rebuilt from them when one is loaded
    const SAVES_KEY = "n64heap-saves";
    function readSaves() {
        try {
            return JSON.parse(localStorage.getItem(SAVES_KEY)) || {};
        } catch (e) {
            return {};
        }
    }
    function writeSaves(saves) {
        try {
            localStorage.setItem(SAVES_KEY, JSON.stringify(saves));
            return true;
        } catch (e) {
            alert(`The route could not be saved: ${e.message}`);
            return false;
        }
    }
    function renderSaves(selectedName) {
        const saves = readSaves();
        const names = Object.keys(saves).sort((a, b) => a.localeCompare(b));
        $("saves").replaceChildren(el("option", { value: "" }, names.length ? "Saved routes…" : "No saved routes yet"),
            ...names.map((name) => el("option", { value: name }, `${name} (${saves[name].steps.length} steps, ${new Date(saves[name].savedAt).toLocaleDateString()})`)));
        $("saves").value = selectedName && saves[selectedName] ? selectedName : "";
        $("saves").dispatchEvent(new Event("sync"));
        $("deleteSave").disabled = !$("saves").value;
    }
    $("saveAs").addEventListener("click", () => {
        const saves = readSaves();
        const name = (prompt("Name this route", $("saves").value || "") || "").trim();
        if (!name) return;
        if (saves[name] && !confirm(`Replace the saved route "${name}"?`)) return;
        readTextFlags();
        saves[name] = { savedAt: Date.now(), flags: JSON.parse(JSON.stringify(state.flags)), steps: JSON.parse(JSON.stringify(state.steps)) };
        if (writeSaves(saves)) renderSaves(name);
    });
    $("saves").addEventListener("change", () => {
        const name = $("saves").value;
        $("deleteSave").disabled = !name;
        const save = readSaves()[name];
        if (!save) return;
        if (state.steps.length && !confirm(`Replace the current route with "${name}"? (Undo brings it back)`)) {
            $("saves").value = "";
            $("saves").dispatchEvent(new Event("sync"));
            return;
        }
        state = normalise({ flags: save.flags, steps: save.steps });
        selected = state.steps.length - 1;
        renderFlags();
        changed();
    });
    $("deleteSave").addEventListener("click", () => {
        const name = $("saves").value;
        const saves = readSaves();
        if (!saves[name] || !confirm(`Delete the saved route "${name}"?`)) return;
        delete saves[name];
        if (writeSaves(saves)) renderSaves("");
    });
    // Downloads the chosen save, or the current route, in the same format the import box reads
    $("exportFile").addEventListener("click", () => {
        const name = $("saves").value;
        const save = readSaves()[name];
        readTextFlags();
        const route = save ? { flags: save.flags, steps: save.steps } : { flags: state.flags, steps: state.steps };
        const file = `${(name || "n64-heap-route").replace(/[^\w\- ]+/g, "_").trim() || "n64-heap-route"}.json`;
        const link = el("a", { href: URL.createObjectURL(new Blob([JSON.stringify(route, null, 1)], { type: "application/json" })), download: file });
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    });
    searchable($("saves"));
    renderSaves("");
    $("example").addEventListener("change", (e) => {
        const example = rules.EXAMPLES[e.target.value];
        if (!example) return;
        if (state.steps.length && !confirm("Replace the current route and flags with the example?")) {
            e.target.value = "";
            return;
        }
        state = normalise(JSON.parse(JSON.stringify(example.state)));
        selected = state.steps.length - 1;
        e.target.value = "";
        renderFlags();
        changed();
    });
    // The ROM is kept in this browser's IndexedDB so it loads by itself next time; it never leaves the machine
    function romStore(mode, action) {
        return new Promise((resolve, reject) => {
            const open = indexedDB.open("n64heap", 1);
            open.onupgradeneeded = () => open.result.createObjectStore("rom");
            open.onerror = () => reject(open.error);
            open.onsuccess = () => {
                const tx = open.result.transaction("rom", mode);
                const request = action(tx.objectStore("rom"));
                tx.oncomplete = () => resolve(request && request.result);
                tx.onerror = () => reject(tx.error);
            };
        });
    }
    function useRom(bytes, name, cached) {
        const status = $("romStatus");
        try {
            rom = new N64Rom(bytes, data);
            status.textContent = `ROM loaded: ${name}${cached ? " (remembered in this browser)" : ""}`;
            status.className = "status ok";
            $("romForget").hidden = false;
            return true;
        } catch (err) {
            rom = null;
            status.textContent = err.message;
            status.className = "status bad";
            return false;
        } finally {
            changed(false);
        }
    }
    $("romButton").addEventListener("click", () => $("romFile").click());
    $("romFile").addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (!useRom(bytes, file.name, false)) return;
        try {
            await romStore("readwrite", (store) => store.put({ name: file.name, bytes }, "rom"));
            $("romStatus").textContent = `ROM loaded: ${file.name} (remembered in this browser)`;
        } catch (err) { /* storage may be unavailable; the ROM still works for this tab */ }
    });
    $("romForget").addEventListener("click", async () => {
        try {
            await romStore("readwrite", (store) => store.delete("rom"));
        } catch (err) { /* nothing stored */ }
        rom = null;
        $("romForget").hidden = true;
        $("romStatus").textContent = "ROM forgotten: reads of scene and object data stay unknown";
        $("romStatus").className = "status";
        changed(false);
    });
    romStore("readonly", (store) => store.get("rom"))
        .then((saved) => { if (saved && saved.bytes) useRom(new Uint8Array(saved.bytes), saved.name, true); })
        .catch(() => { /* storage may be unavailable */ });

    function normalise(s) {
        s = s || {};
        s.flags = Object.assign({ adult: false, night: false, japanese: false, events: [], infs: [], scenes: {} }, s.flags || {});
        s.steps = (s.steps || []).filter((step) => stepTypes[step.type]).map((step) => ({ ...step, params: Object.assign(defaultParams(step.type), step.params || {}) }));
        return s;
    }

    $("undo").addEventListener("click", () => restore(-1));
    $("redo").addEventListener("click", () => restore(1));
    document.addEventListener("keydown", (e) => {
        if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
        const tag = document.activeElement && document.activeElement.tagName;
        if ((tag === "INPUT" && document.activeElement.type === "text") || tag === "TEXTAREA") return;
        const key = e.key.toLowerCase();
        if (key === "z" && !e.shiftKey) restore(-1);
        else if (key === "y" || (key === "z" && e.shiftKey)) restore(1);
        else return;
        e.preventDefault();
    });

    state = normalise(load() || state);
    // Fill the "other flags" boxes before run() reads them back into the state
    renderFlags();
    run(true);
    record();
})();
