import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.resolve(root, "..", "卡片查找器");
const target = path.join(root, "source", "card-finder");

if (!fs.existsSync(path.join(source, "data", "cards.json"))) {
  throw new Error(`未找到卡片查找器：${source}`);
}

const copyFile = (from, to) => {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
};

for (const file of ["cards.json", "pages.json", "usages.json", "page-taxonomy.json", "knowledge-version.json", "scan-meta.json"]) {
  copyFile(path.join(source, "data", file), path.join(target, "data", file));
}

fs.cpSync(path.join(source, "knowledge", "cards"), path.join(target, "knowledge", "cards"), { recursive: true, force: true });
fs.cpSync(path.join(source, "knowledge", "review"), path.join(target, "knowledge", "review"), { recursive: true, force: true });
for (const file of ["index.md", "page-taxonomy.md", "commercial-library.md"]) {
  copyFile(path.join(source, "knowledge", file), path.join(target, "knowledge", file));
}
fs.cpSync(path.join(source, "assets", "cards"), path.join(target, "assets", "cards"), { recursive: true, force: true });
fs.cpSync(path.join(source, "skills", "zdm-card-knowledge"), path.join(root, "packages", "zdm-card-knowledge"), { recursive: true, force: true });

const cards = JSON.parse(fs.readFileSync(path.join(target, "data", "cards.json"), "utf8"));
const pages = JSON.parse(fs.readFileSync(path.join(target, "data", "pages.json"), "utf8"));
console.log(JSON.stringify({ ok: true, cards: cards.length, pages: pages.length, source }, null, 2));

