# N64 Heap Simulator

A browser page that simulates Ocarina of Time's NTSC 1.2 actor heap (the Zelda arena), the cutscene pointer and what a wrong warp does with it. Set the game state (age, story flags, what has been collected), list the route's steps, and every step shows the heap, where the cutscene pointer points and, at a warp, what the cutscene parser reads and where it sends Link.

Use it at https://fantatanked.github.io/OcarinaOfTimeHeapSimulator/.

## Your ROM

Wrong warps usually end up reading scene or object data. The page reads that data from your own NTSC 1.2 ROM, which you load with **Load your ROM**. It is never uploaded. The page remembers it in your browser's own storage (IndexedDB) so it loads by itself next time; **Forget ROM** removes it. Without a ROM, the heap and pointer are still simulated, but reads from scene and object files are shown as unknown.

## Saving routes

**Save as** in the Route panel keeps the route and its game state under a name, in this browser. Pick a save from the list to load it back; the heap is rebuilt from the route, so it comes back exactly. Saves stay in this browser only. **Export** downloads the chosen save (or the current route, if none is chosen) as a `.json` file, which **Import file** (under Import / export) opens again; **Copy share link** puts a route in a link instead.
