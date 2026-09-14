import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { root, loadKnowledge, searchEntries } from "./knowledge.mjs";
const data = loadKnowledge();
const packageRoot = path.join(root, "packages/zdm-design-assistant");
const staging = path.join(root, "release/package");
if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true });
fs.mkdirSync(path.join(staging, "payload/references"), { recursive: true });
fs.mkdirSync(path.join(staging, "payload/scripts"), { recursive: true });
fs.cpSync(path.join(packageRoot, "bin"), path.join(staging, "bin"), {
  recursive: true,
});
fs.copyFileSync(
  path.join(packageRoot, "package.json"),
  path.join(staging, "package.json"),
);
fs.copyFileSync(
  path.join(packageRoot, "SKILL.md"),
  path.join(staging, "payload/SKILL.md"),
);
fs.copyFileSync(
  path.join(packageRoot, "query.mjs"),
  path.join(staging, "payload/scripts/query.mjs"),
);
fs.copyFileSync(
  path.join(root, "packages/zdm-card-knowledge/scripts/query-card.mjs"),
  path.join(staging, "payload/scripts/query-card.mjs"),
);
fs.copyFileSync(
  path.join(root, "packages/zdm-card-knowledge/references/catalog.json"),
  path.join(staging, "payload/references/catalog.json"),
);
fs.cpSync(
  path.join(root, "source/card-finder/assets/cards"),
  path.join(staging, "payload/assets/cards"),
  { recursive: true },
);
fs.writeFileSync(
  path.join(staging, "payload/references/knowledge-index.json"),
  JSON.stringify(
    {
      version: data.version,
      cardVersion: data.cardVersion,
      entries: searchEntries(data),
      sources: data.sources,
    },
    null,
    2,
  ),
);
const inventory = {};
function scan(dir, prefix = "") {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name),
      rel = path.posix.join(prefix, e.name);
    if (e.isDirectory()) scan(full, rel);
    else
      inventory[rel] = crypto
        .createHash("sha256")
        .update(fs.readFileSync(full))
        .digest("hex");
  }
}
scan(path.join(staging, "payload"));
const version = JSON.parse(
  fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"),
).version;
fs.writeFileSync(
  path.join(staging, "payload/.zdm-install.json"),
  JSON.stringify(
    {
      name: "zdm-design-assistant",
      version,
      knowledgeVersion: data.version,
      cardVersion: data.cardVersion,
      files: inventory,
    },
    null,
    2,
  ),
);
const result = JSON.parse(
  execFileSync(
    "npm",
    ["pack", "--json", "--pack-destination", path.join(root, "release")],
    { cwd: staging, encoding: "utf8" },
  ),
)[0];
fs.copyFileSync(
  path.join(root, "release", result.filename),
  path.join(root, "release/zdm-design-assistant.tgz"),
);
console.log(
  JSON.stringify(
    {
      file: result.filename,
      version,
      files: Object.keys(inventory).length,
      bytes: result.size,
      knowledgeVersion: data.version,
    },
    null,
    2,
  ),
);
