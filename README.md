# N64 Heap Simulator

A browser page that simulates Ocarina of Time's NTSC 1.2 actor heap (the Zelda arena), the cutscene pointer and what a wrong warp does with it. Set the game state (age, story flags, what has been collected), list the route's steps, and every step shows the heap, where the cutscene pointer points and, at a warp, what the cutscene parser reads and where it sends Link.

Use it at https://fantatanked.github.io/OcarinaOfTimeHeapSimulator/, or open `index.html` in a browser. Nothing needs installing or a server.

## Your ROM

Wrong warps usually end up reading scene or object data. The page reads that data from your own NTSC 1.2 ROM, which you load with **Load your ROM**. It is never uploaded. The page remembers it in your browser's own storage (IndexedDB) so it loads by itself next time; **Forget ROM** removes it. Without a ROM, the heap and pointer are still simulated, but reads from scene and object files are shown as unknown.

## Saving routes

**Save as** in the Route panel keeps the route and its game state under a name, in this browser. Pick a save from the list to load it back; the heap is rebuilt from the route, so it comes back exactly. Saves stay in this browser only. **Export** downloads the chosen save (or the current route, if none is chosen) as a `.json` file, which **Import file** (under Import / export) opens again; **Copy share link** puts a route in a link instead.

## Files

| File | What it is |
| --- | --- |
| `index.html`, `app.js` | The page |
| `engine.js` | The allocator (`__osMalloc`), actor spawning and deletion, rooms, the object space and the cutscene parser |
| `rules.js` | What each actor's Init does to the heap, game flags, player actions and the examples |
| `route.js` | Route steps and entrance loading, including wrong warps |
| `rom.js` | Reads files from the ROM (byte order, dmadata, Yaz0) |
| `data.js` | Numbers from the decompilation: actor and object sizes, scene layouts, entrances. No ROM data |
| `export_data.py` | Regenerates `data.js` |
| `tests/` | Node checks against console-verified results |

## Tests

```
node tests/graveyard.test.js
N64_ROM=path/to/baserom.z64 node tests/rom.test.js
N64_ROM=path/to/baserom.z64 node tests/route.test.js
```

The graveyard test must give the Royal Family's Tomb unload on the same room load as the Python model and console. The route tests check the Kokiri Forest and Deku Tree heap against logs from a real run.

## How accurate it is

These results are checked against logs from a real run and against console:

- **Graveyard:** the Royal Family's Tomb grave is gone on the same room load as in the Python model and on console.
- **Scene loads:** the Deku Tree area, the Deku Tree and Gohma's lair match the logged free space exactly, at the moment it was logged: once the first room's actors have spawned and before the actors waiting on the room's objects run Init (Gohma's skeleton tables come just after).
- **LACS setup:** the Kokiri Forest part matches the logged heap at every room change, exactly, with both N64 and Ship object timing. It leaves the pointer at 801FAAA0, the console value.
- **LACS warp:** in the Deku Tree the angle chu lands on 801FAAA0. Its bytes survive to Dodongo's Cavern, where the parser skips into the Hyrule Field flashback and reaches the light arrows cutscene, as on console.

Getting the Kokiri Forest part exact needed three things from the decomp that matter for any route:
- **On-screen actors at a room change.** When a room changes, actors of the old room that are on screen are only killed, and freed on a later frame. If their object is gone, they stay allocated. A room step's "on screen" field lists them by name or by room entry (`#2` is entry 2). In the LACS route, the camera looks down the Baba corridor, so the two Babas by the loading plane are on screen.
- **Object loading.** A room's objects all start loading on the same frame and arrive together a frame later. Actors waiting on them then act in one pass, in list order.
- **The exact collectibles.** The collected "bridge rupee" is the blue rupee with flag 0x11.

Every scene in the game is available. Actor Init behaviour was audited from the decompilation for every actor placed in a scene, including the skeleton, curve and skin tables Init allocates. Cutscenes can be played frame by frame: each cue channel holds the cue for that frame as in `Cutscene_ProcessScript`, and the actors that read cues act on them. Ocarina songs spawn their effect and the actors listening react. Some things the page can't know are approximated:
- Camera-dependent spawns (grass rings, trees).
- Collision checks (no floor under an actor).
- Exact frame timings, including animation lengths some cutscene reactions wait for.
- While Link plays the ocarina, the game freezes most actors; the page keeps updating them.

## Regenerating the data

`export_data.py` needs the decompilation checked out and extracted next to this folder (`../oot-decomp`), plus `oot_actor_heap_sim.py` and `n64heap_gen.py` from the parent folder:

```
python export_data.py
```

It exports every scene in the retail game. The debug test scenes aren't in the NTSC 1.2 ROM, so they are left out. An actor with no Init rule in `rules.js` still spawns with its real sizes, but none of its Init behaviour.
