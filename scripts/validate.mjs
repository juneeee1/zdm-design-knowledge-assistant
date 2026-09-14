import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { marked } from "marked";
import { loadKnowledge, markdownFiles } from "./knowledge.mjs";

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
const knowledge = loadKnowledge();
const sourceIds = new Set(knowledge.sources.map((s) => s.id));
const issueIds = new Set(knowledge.issues.map((i) => i.id));
const documentIds = new Set();
const statuses = new Set(["草稿", "待确认", "已确认", "有争议", "已废弃"]);
const evidenceTypes = new Set(["figma-traceable", "observed-web", "proposal", "project-policy", "unknown", "inferred", "human-reviewed"]);
if (sourceIds.size !== knowledge.sources.length) errors.push("来源 ID 重复");
if (issueIds.size !== knowledge.issues.length) errors.push("问题 ID 重复");
for (const doc of knowledge.documents) {
  if (documentIds.has(doc.id)) errors.push(`知识 ID 重复：${doc.id}`);
  documentIds.add(doc.id);
  for (const field of ["id", "name", "owner", "last_updated", "summary"]) if (!doc[field]) errors.push(`${doc.path} 缺少 ${field}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(doc.last_updated)) errors.push(`${doc.path} 日期格式无效`);
  if (!statuses.has(doc.status)) errors.push(`${doc.path} 状态无效`);
  if (!evidenceTypes.has(doc.evidence)) errors.push(`${doc.path} 证据类型无效`);
  if (!Array.isArray(doc.reviewed_by)) errors.push(`${doc.path} 缺少确认人数组`);
  if (doc.status === "已确认" && (!doc.reviewed_by?.length || !doc.body.includes("确认记录"))) errors.push(`${doc.path} 已确认但无确认记录`);
  if (!Array.isArray(doc.source_ids) || !doc.source_ids.length) errors.push(`${doc.path} 缺少来源`);
  for (const id of doc.source_ids || []) if (!sourceIds.has(id)) errors.push(`${doc.path} 来源不存在：${id}`);
  for (const id of doc.questions || []) if (!issueIds.has(id)) errors.push(`${doc.path} 问题不存在：${id}`);
  if (doc.card_id && !ids.has(doc.card_id)) errors.push(`${doc.path} 卡片编号不存在`);
}
for (const issue of knowledge.issues) {
  for (const field of ["id", "title", "owner", "status", "question", "resolution", "interim"]) if (!issue[field]) errors.push(`问题 ${issue.id} 缺少 ${field}`);
  if (!["P0", "P1", "P2"].includes(issue.priority)) errors.push(`问题优先级无效：${issue.id}`);
  for (const id of issue.affects || []) if (!documentIds.has(id)) errors.push(`问题 ${issue.id} 引用了不存在的档案 ${id}`);
}
for (const source of knowledge.sources) if (source.snapshot && !fs.existsSync(path.join(root, source.snapshot))) errors.push(`来源快照缺失：${source.id}`);
for (const file of [...markdownFiles("knowledge"), "docs/领导汇报.md", "docs/试用指南.md", "governance/初版使用边界.md", "README.md"]) {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  marked.walkTokens(marked.lexer(text), (token) => {
    if (!["link", "image"].includes(token.type)) return;
    const href = token.href;
    if (/^(https?:|mailto:|#)/.test(href)) return;
    const local = decodeURIComponent(href.split("#")[0]);
    if (local && !fs.existsSync(path.resolve(root, path.dirname(file), local))) errors.push(`${file} 链接不存在：${href}`);
  });
}
if (JSON.stringify(cards) !== JSON.stringify(knowledge.catalog.cards)) errors.push("卡片 Skill 快照与源数据不同步");
if (JSON.stringify(usages) !== JSON.stringify(knowledge.catalog.usages)) errors.push("关系 Skill 快照与源数据不同步");
for (const usage of usages) {
  if (!ids.has(usage.cardId) || !pages.some((p) => p.id === usage.pageId)) errors.push(`关系引用缺失：${usage.id}`);
}
if (!errors.length) {
  try { execFileSync(process.execPath, [path.join(root, "scripts/build.mjs"), "--check"], { stdio: "pipe" }); }
  catch (error) { errors.push(error.stderr?.toString().trim() || "构建一致性检查失败"); }
}
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
  humanConfirmedRelations: knowledge.metrics.humanConfirmed,
  knowledgeVersion: knowledge.version,
  documents: knowledge.metrics.documents,
  sampleCards: knowledge.metrics.sampleCards,
  openIssues: knowledge.metrics.issues,
  generatedArtifactsCurrent: true
}, null, 2));
