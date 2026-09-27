// Loads the browser scripts into Node for the tests
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const dir = path.join(__dirname, "..");
globalThis.window = globalThis;
for (const file of ["data.js", "engine.js", "rules.js", "route.js", "rom.js"]) {
    const full = path.join(dir, file);
    if (fs.existsSync(full)) vm.runInThisContext(fs.readFileSync(full, "utf8"), { filename: full });
}
N64Sim.prepare(N64_DATA);
module.exports = { data: N64_DATA, Sim: N64Sim, rules: N64Rules };
