import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const required = ["README.md", "AGENTS.md", "llms.txt", "design.md", "knowledge/README.md"];
const errors = required.filter((file) => !fs.existsSync(path.join(root, file))).map((file) => `缺少入口文件：${file}`);
const cards = readJson("source/card-finder/data/cards.json");
const pages = readJson("source/card-finder/data/pages.json");
const usages = readJson("source/card-finder/data/usages.json");
const taxonomy = readJson("source/card-finder/data/page-taxonomy.json");
const ids = new Set(cards.map((card) => card.id));
if (ids.size !== cards.length) errors.push("卡片编号存在重复");
for (const card of cards) {
  const doc = path.join(root, "source/card-finder/knowledge/cards", `${card.id}.md`);
  const image = path.join(root, "source/card-finder/assets/cards", `${card.id}.png`);
  if (!fs.existsSync(doc)) errors.push(`缺少卡片档案：${card.id}`);
  if (!fs.existsSync(image)) errors.push(`缺少卡片预览：${card.id}`);
}
if ((taxonomy.pageFamilies || []).length !== 7) errors.push("一级页面分类不是 7 个");
if (errors.length) {
  console.error(JSON.stringify({ ok: false, errors: errors.slice(0, 50), errorCount: errors.length }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({
  ok: true,
  cards: cards.length,
  pages: pages.length,
  usages: usages.length,
  pageFamilies: taxonomy.pageFamilies.map((item) => item.name),
  humanConfirmedRelations: usages.filter((item) => item.evidenceLevel === "human-reviewed").length
}, null, 2));

