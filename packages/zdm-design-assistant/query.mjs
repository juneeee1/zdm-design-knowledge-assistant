import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(
  fs.readFileSync(path.join(root, "references/knowledge-index.json"), "utf8"),
);
const [command = "help", ...args] = process.argv.slice(2);
const q = args.join(" ").trim().toLowerCase();
let result;
if (command === "get") result = data.entries.filter((e) => e.id === args[0]);
else if (command === "search" && q)
  result = data.entries
    .filter((e) =>
      q
        .split(/\s+/)
        .every((t) => `${e.id} ${e.name} ${e.body}`.toLowerCase().includes(t)),
    )
    .slice(0, 12);
else {
  console.log("query.mjs search <关键词> | get <编号>");
  process.exit(0);
}
console.log(
  JSON.stringify(
    { version: data.version, cardVersion: data.cardVersion, results: result, sources: (data.sources || []).filter(s => result.some(e => e.source_ids?.includes(s.id))) },
    null,
    2,
  ),
);
