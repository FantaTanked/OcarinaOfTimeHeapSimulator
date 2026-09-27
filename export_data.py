#!/usr/bin/env python3
"""Export the NTSC 1.2 data the web simulator needs to data.js.

Only numbers are exported: sizes, addresses, actor lists and table entries
taken from the decomp and the extracted ROM. No ROM bytes are written; the
page reads scene and icon data from the user's own ROM at runtime.

Usage (from this folder, with ../oot-decomp checked out and extracted):
    python export_data.py
"""

from __future__ import annotations

import json
import re
import struct
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import oot_actor_heap_sim as sim  # noqa: E402
import n64heap_gen as gen  # noqa: E402

# Scenes the simulator models: the LACS bombchu route, and the graveyard as an engine check
# Every scene in the scene table; a scene whose data can't be read is reported and left out
SCENES = None


def profile_flags(data: sim.TargetData, actor_id: int) -> int:
    info = data.actor(actor_id)
    at = data.actor_table_vram - sim.CODE_VRAM + actor_id * 0x20
    vs, ve, rs, _re, _loaded, profile, _name, _alloc = struct.unpack_from(">IIIIIIIH", data.code, at)
    if rs == 0:
        blob, offset = data.code, profile - sim.CODE_VRAM
    else:
        blob, offset = (data.baserom / f"ovl_{info.name}").read_bytes(), profile - rs
    return sim.be_u32(blob, offset + 4)


def export_actors(data: sim.TargetData) -> list:
    actors = []
    for actor_id in range(max(data.source_names) + 1):
        if actor_id not in data.source_names:
            actors.append(None)
            continue
        try:
            info = data.actor(actor_id)
        except (sim.ModelError, OSError, struct.error):
            actors.append(None)
            continue
        actors.append({
            "name": info.name,
            "instance": info.instance_size,
            "overlay": 0 if info.internal else info.overlay_size,
            "alloc": info.alloc_type,
            "category": info.category,
            "object": info.object_id,
            "flags": profile_flags(data, actor_id),
        })
    return actors


def export_effects(data: sim.TargetData) -> list:
    effects = []
    table = data.source_text("include/tables/effect_ss_table.h")
    for match in re.finditer(r"/\*\s*(0x[0-9A-Fa-f]+)\s*\*/\s*DEFINE_EFFECT_SS(_UNSET)?\((\w+)", table):
        if match.group(2):
            effects.append({"name": match.group(3), "overlay": 0})
            continue
        record = data.overlay_record(match.group(3))
        effects.append({"name": match.group(3), "overlay": record[3] - record[2]})
    return effects


def object_table(data: sim.TargetData, files: dict) -> list:
    objects = {}
    for match in re.finditer(r"/\*\s*(0x[0-9A-Fa-f]+)\s*\*/\s*DEFINE_OBJECT\w*\(\s*(\w+)\s*,\s*(\w+)",
                             data.source_text("include/tables/object_table.h")):
        objects[int(match.group(1), 16)] = (match.group(2), match.group(3))
    result = []
    for object_id in range(max(objects) + 1):
        name, enum = objects.get(object_id, ("", ""))
        vrom, size, _ = files.get(name, (0, 0, 0))
        result.append({"name": name, "enum": enum, "vrom": vrom, "size": size})
    return result


def scene_table(data: sim.TargetData, files: dict, effect_top: int) -> list:
    table = data.source_text("include/tables/scene_table.h")
    scenes = []
    for scene_id_text, name, enum in re.findall(
            r"/\*\s*(0x[0-9A-Fa-f]+)\s*\*/\s*DEFINE_SCENE\(\s*(\w+)\s*,\s*\w+\s*,\s*(\w+)", table):
        vrom, size, _ = files.get(name, (0, 0, 0))
        scenes.append({
            "id": int(scene_id_text, 16), "file": name, "enum": enum, "vrom": vrom, "size": size,
            "base": (effect_top - size) & ~15 if size else 0, "dungeon": enum in gen.DUNGEON_SCENES,
        })
    return scenes


def entrance_table(data: sim.TargetData, scene_ids: dict) -> list:
    entries = []
    for match in re.finditer(r"/\*\s*(0x[0-9A-Fa-f]+)\s*\*/\s*DEFINE_ENTRANCE\(\s*(\w+)\s*,\s*(\w+)\s*,\s*(\d+)",
                             data.source_text("include/tables/entrance_table.h")):
        entries.append({"index": int(match.group(1), 16), "name": match.group(2),
                        "scene": scene_ids.get(match.group(3), -1), "spawn": int(match.group(4))})
    return entries


def enum_values(text: str, prefix: str) -> dict:
    """Values of a decomp enum whose members carry /* 0xNNNN */ comments."""
    values = {}
    for value, name in re.findall(r"/\*\s*(0x[0-9A-Fa-f]+)\s*\*/\s*(" + prefix + r"\w+)", text):
        number = int(value, 16)
        values[str(number - 0x10000 if number == 0xFFFF else number)] = name[len(prefix):]
    return values


def room_actors(scene: sim.TargetData, number: int) -> list:
    blob = scene.room(number)
    for code, count, pointer in scene.base_header_commands(blob):
        if code == 0x01:
            at = sim.seg_offset(pointer)
            return [list(struct.unpack_from(">hhhhhhhH", blob, at + i * 0x10)) for i in range(count)]
    return []


def spawn_list(scene: sim.TargetData) -> list:
    blob = scene.scene()
    commands = scene.base_header_commands(blob)
    entrances = next((p for c, _, p in commands if c == 0x06), None)
    players = next(((n, p) for c, n, p in commands if c == 0x00), None)
    if entrances is None or players is None:
        return []
    at = sim.seg_offset(entrances)
    result = []
    for spawn in range(players[0]):
        if at + 2 * spawn + 1 >= len(blob):
            break
        player = blob[at + 2 * spawn]
        entry = struct.unpack_from(">hhhhhhhH", blob, sim.seg_offset(players[1]) + player * 0x10)
        result.append({"player": player, "room": blob[at + 2 * spawn + 1], "pos": list(entry[1:4]), "rotY": entry[5]})
    return result


def export_scene(decomp: Path, extracted: Path, name: str, base: sim.Geometry) -> dict:
    scene = sim.TargetData(decomp, extracted, name, 0)
    layers = {}
    for layer in sorted(set(scene.scene_layers()) | {0, 1, 2, 3}):
        scene.layer = layer
        geometry = sim.build_geometry(scene, sim.Trace())
        if geometry.zelda_start != base.zelda_start:
            raise sim.ModelError(f"{name} layer {layer}: arena start differs")
        commands = scene.base_header_commands(scene.scene())
        keep = next((p & 0xFFFF for c, _, p in commands if c == 0x07), 0)
        cutscene = next((sim.seg_offset(p) for c, _, p in commands if c == 0x17), None)
        rooms = []
        for number in range(scene.room_count()):
            rooms.append({
                "size": len(scene.room(number)),
                "actors": room_actors(scene, number),
                "objects": scene.room_object_list(number),
            })
        layers[str(layer)] = {
            "arenaSize": geometry.zelda_size,
            "objectSpaceSize": scene.object_space_kb() * 1024,
            "keep": keep,
            "rooms": rooms,
            "transitions": [list(t) for t in scene.transition_entries()],
            "spawns": spawn_list(scene),
            "cutsceneOffset": cutscene,
        }
    return {"id": scene.scene_id, "enum": scene.scene_enum, "file": f"{name}_scene", "layers": layers}


def flag_defines(text: str, prefix: str) -> list:
    """Every named flag in save.h, with its value and the decomp's comment."""
    flags = []
    for name, value, note in re.findall(rf"#define ({prefix}_\w+) (0x[0-9A-Fa-f]+)[ \t]*(?://\s*(.*))?", text):
        if "_INDEX" in name or "_MASK" in name:
            continue
        flags.append({"id": name, "value": int(value, 16), "note": (note or "").strip()})
    return flags


def enum_names(text: str, enum: str, prefix: str) -> list:
    """Member names of a C enum, in order."""
    body = re.search(rf"typedef enum {enum} \{{(.*?)\}}", text, re.S).group(1)
    return [n for n in re.findall(rf"\b({prefix}\w*)", body) if not n.endswith(("_MAX", "_COUNT"))]


def scene_categories(extracted: Path) -> dict:
    """Which folder (overworld, dungeons, indoors, shops, misc) each scene's assets are in."""
    root = extracted / "assets/scenes"
    return {scene.name: folder.name for folder in root.iterdir() if folder.is_dir() for scene in folder.iterdir()}


def cue_channels(z_demo: str, commands: dict) -> dict:
    """Which csCtx cue channel each actor cue command writes, read from Cutscene_ProcessScript's switch."""
    body = z_demo[z_demo.index("void Cutscene_ProcessScript("):]
    body = body[:body.index("\n}\n")]
    channels, pending = {}, []
    for line in body.splitlines():
        case = re.search(r"case (CS_CMD_\w+):", line)
        if case:
            pending.append(case.group(1))
            continue
        target = re.search(r"csCtx->(?:actorCues\[(\d)\]|(playerCue)) = ", line)
        if target and pending:
            channel = "player" if target.group(2) else int(target.group(1))
            for name in pending:
                if name in commands:
                    channels[str(commands[name])] = channel
        if "break;" in line:
            pending = []
    return channels


def export_scenes(decomp: Path, extracted: Path, base: sim.Geometry, names: list) -> dict:
    result = {}
    for name in names:
        try:
            result[name] = export_scene(decomp, extracted, name, base)
        except Exception as error:  # noqa: BLE001
            print(f"skipped {name}: {error}")
    categories = scene_categories(extracted)
    for name, scene in result.items():
        scene["category"] = categories.get(name, "misc")
    return result


def main() -> int:
    decomp = sim.DEFAULT_DECOMP
    extracted = decomp / "extracted/ntsc-1.2"
    data = sim.TargetData(decomp, extracted)
    trace = sim.Trace()
    geometry = sim.build_geometry(data, trace)
    files = gen.rom_files(data)
    rows = {label: (address, size) for label, size, address, _ in geometry.tha.rows}
    effect_top = rows["EffectSs_InitInfo table"][0]

    scenes = scene_table(data, files, effect_top)
    scene_ids = {s["enum"]: s["id"] for s in scenes}
    scripts = []
    for actor_id, offset, words, note in gen.actor_cutscenes(data):
        scripts.append({"actor": actor_id, "offset": offset, "words": list(words), "note": note})
    scene_scripts, _notes = gen.scene_cutscenes(data, geometry)
    for scene_id, address, words, label, name in scene_scripts:
        scripts.append({"scene": scene_id, "address": address, "words": list(words), "name": name})

    # Item icons greyed out for the current age, as the pause screen draws them
    pause_lines, _archive = gen.pause_tables(data, geometry)
    item_icons = []
    for line in pause_lines:
        match = re.match(r"\s*\{ (kNoIcon|0x[0-9a-f]+), AgeReq::(\w+) \},", line)
        if match:
            offset = None if match.group(1) == "kNoIcon" else int(match.group(1), 16)
            item_icons.append({"offset": offset, "age": match.group(2)})
    handled = []
    for line in pause_lines:
        if line.startswith("    0x") and "," in line and "{" not in line:
            handled += [int(v, 16) for v in line.replace(",", " ").split()]

    out = {
        "meta": {
            "zeldaStart": geometry.zelda_start,
            "csScriptAddress": sim.cs_script_address(data, geometry),
            "arenaNodeSize": sim.ARENA_NODE_SIZE,
            "absoluteSpaceSize": sim.ACTOROVL_ABSOLUTE_SPACE_SIZE,
            "giObjectSegmentSize": 0x1000 * 2 + 8,
            "actorBaseSize": gen.actor_base_size(data),
            "actorOverlayTable": data.actor_table_vram,
            "dmadataStart": 0x7960,
            "kaleidoArea": rows["KaleidoManager_Init area"],
            "messageArea": rows["Message_Init textboxSegment"],
            "effectArea": rows["EffectSs_InitInfo table"],
            "pause": {
                "renderTextureSize": 0x3800, "keepBufferSize": 0x5000, "jointTableSize": 24 * 6,
                "coverageSize": 64 * 112, "itemIconSize": 32 * 32 * 4, "itemNameTexSize": 0x400,
                "mapNameTex1Size": 0x400, "mapNameTex2Size": 0xA00, "worldMapAreaCount": 22,
            },
            "pauseFiles": {name: {"vrom": files[name][0], "size": files[name][1]} for name in gen.PAUSE_FILES},
            "cutsceneCommands": handled,
        },
        "actors": export_actors(data),
        "effects": export_effects(data),
        "objects": object_table(data, files),
        "scenes": scenes,
        "entrances": entrance_table(data, scene_ids),
        "scripts": scripts,
        "itemIcons": item_icons,
        "csCommands": enum_values(data.source_text("include/cutscene.h"), "CS_CMD_"),
        "csDestinationNames": enum_values(data.source_text("include/cutscene.h"), "CS_DEST_"),
        "csCueChannels": cue_channels(data.source_text("src/code/z_demo.c"),
                                      {f"CS_CMD_{name}": int(value) for value, name in
                                       enum_values(data.source_text("include/cutscene.h"), "CS_CMD_").items()}),
        "flagNames": {
            "events": flag_defines(data.source_text("include/save.h"), "EVENTCHKINF"),
            "infs": flag_defines(data.source_text("include/save.h"), "INFTABLE"),
            "itemGetInfs": flag_defines(data.source_text("include/save.h"), "ITEMGETINF"),
            "quests": [n for n in enum_names(data.source_text("include/item.h"), "QuestItem", "QUEST_") if "HEART_PIECE" not in n],
            "items": enum_names(data.source_text("include/item.h"), "ItemID", "ITEM_")[:0x38],
            "equips": [n for t in ("Sword", "Shield", "Tunic", "Boots") for n in enum_names(data.source_text("include/item.h"), f"EquipInv{t}", "EQUIP_INV_")],
        },
        "sceneData": export_scenes(decomp, extracted, geometry, SCENES or [s["file"].removesuffix("_scene") for s in scenes]),
    }
    text = json.dumps(out, separators=(",", ":"))
    (HERE / "data.js").write_text("// Generated by export_data.py: NTSC 1.2 numbers only, no ROM data\n"
                                  "window.N64_DATA = " + text + ";\n")
    print(f"data.js: {len(text) // 1024} KB, {len(out['sceneData'])} scenes, {len(scripts)} scripts")
    return 0


if __name__ == "__main__":
    sys.exit(main())
