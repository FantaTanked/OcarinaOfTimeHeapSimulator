// Runs parts of finder searches off the page's thread: the page sends the ROM once, then one job at a time
self.window = self;
importScripts("data.js", "engine.js", "rules.js", "route.js", "rom.js", "finder.js");

const data = N64Sim.prepare(self.N64_DATA);
let rom = null;

self.onmessage = (event) => {
    const message = event.data;
    if (message.rom) {
        rom = new N64Rom(message.rom, data);
        return;
    }
    let last = 0;
    try {
        const result = N64Finder.runJob(data, self.N64Rules, message.job, rom, (progress) => {
            const now = Date.now();
            if (now - last < 200) return;
            last = now;
            self.postMessage({ id: message.id, progress });
        });
        self.postMessage({ id: message.id, result });
    } catch (error) {
        self.postMessage({ id: message.id, error: error.message });
    }
};
