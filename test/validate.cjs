// Validates the catalogue and that every export for every pre-made stack (and the full catalogue) is valid.
global.window = {}; global.TextEncoder = require("util").TextEncoder;
require("../public/data.js"); require("../public/app.js");
const S = window.STACKOS_SERVERS, ids = new Set(S.map(s => s.id)); let bad = 0;
if (ids.size !== S.length) { console.error("duplicate ids"); bad++; }
for (const s of S) if (!s.remote && !s.local) { console.error("no install method", s.id); bad++; }
for (const st of [...window.STACKOS_STACKS, { id: "ALL", ids: [...ids] }]) {
  const list = st.ids.map(i => S.find(s => s.id === i)); if (list.some(x => !x)) { console.error("bad stack ref", st.id); bad++; continue; }
  const f = window.StackOSExport.buildFiles(list, st.name);
  for (const k in f) for (const x of f[k]) if (x.path.endsWith(".json")) try { JSON.parse(x.content); } catch (e) { console.error(st.id, x.path, e.message); bad++; }
}
console.log(S.length + " servers, " + window.STACKOS_STACKS.length + " stacks, " + (bad ? bad + " problems" : "all exports valid"));
process.exit(bad ? 1 : 0);
