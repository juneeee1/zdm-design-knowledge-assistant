import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
export const version = () => readJson("governance/sources.json").version;
export function markdownFiles(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const file = path.posix.join(dir, entry.name);
    return entry.isDirectory() ? markdownFiles(file) : file.endsWith(".md") ? [file] : [];
  }).sort();
}
export function readDocument(file) {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  if (!text.startsWith("---\n")) return null;
  const end = text.indexOf("\n---\n", 4);
  if (end < 0) throw new Error(`Frontmatter 未闭合：${file}`);
  const meta = YAML.parse(text.slice(4, end));
  return { ...meta, path: file, section: file.split("/")[1], body: text.slice(end + 5).trim() };
}
export function loadKnowledge() {
  const documents = markdownFiles("knowledge").map(readDocument).filter(Boolean);
  const catalog = readJson("packages/zdm-card-knowledge/references/catalog.json");
  const sources = readJson("governance/sources.json");
  const issues = readJson("governance/issues.json").issues;
  const confirmed = catalog.usages.filter((u) => u.humanReview?.status === "approved" && u.relationshipStatus !== "rejected");
  return {
    version: sources.version, cardVersion: catalog.meta.knowledgeVersion,
    documents, catalog, sources: sources.sources, issues,
    metrics: {
      documents: documents.length, confirmedDocuments: documents.filter((d) => d.status === "已确认").length,
      sampleCards: documents.filter((d) => d.card_id).length, cards: catalog.cards.length,
      frames: catalog.pages.length, relations: catalog.usages.length,
      traceable: catalog.usages.filter((u) => u.evidenceLevel === "figma-traceable" && u.relationshipStatus !== "rejected").length,
      inferred: catalog.usages.filter((u) => u.evidenceLevel === "inferred" && u.relationshipStatus !== "rejected").length,
      humanConfirmed: confirmed.length, issues: issues.filter((i) => i.status !== "已解决").length
    }
  };
}
export function searchEntries(data) {
  return [
    ...data.documents.map((d) => ({ ...d, kind: "knowledge", version: data.version })),
    ...data.catalog.cards.map((c) => ({
      id: c.id, name: c.canonicalName, kind: "card", section: c.category,
      status: c.governance?.reviewStatus === "approved" ? "已确认" : "待确认",
      evidence: c.sourceKind === "figma-authoritative-heading" ? "figma-traceable" : "unknown",
      path: `source/card-finder/knowledge/cards/${c.id}.md`, version: data.cardVersion,
      summary: c.category, body: [c.id, c.canonicalName, ...(c.aliases || []),
        ...(c.annotationRecords || []).map((a) => a.text), ...(c.openQuestions || []),
        ...(c.variants || []).map((v) => v.name)].join("\n")
    }))
  ];
}
export function search(entries, query) {
  const terms = query.trim().toLowerCase().split(/\s+/u).filter(Boolean);
  return entries.filter((entry) => {
    const text = [entry.id, entry.name, entry.summary, entry.body].join(" ").toLowerCase();
    return terms.every((term) => text.includes(term));
  }).sort((a, b) => Number(b.id === query.trim()) - Number(a.id === query.trim()));
}
