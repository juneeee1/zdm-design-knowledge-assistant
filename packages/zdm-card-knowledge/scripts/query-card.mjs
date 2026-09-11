import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(fs.readFileSync(path.join(skillRoot, "references", "catalog.json"), "utf8"));
const [command = "help", ...args] = process.argv.slice(2);
const text = args.join(" ").trim().toLowerCase();
const cardById = new Map(catalog.cards.map((card) => [card.id, card]));
const pageById = new Map(catalog.pages.map((page) => [page.id, page]));
const pageFamilies = catalog.pageTaxonomy?.pageFamilies || [];
const usagesForCard = (id) => catalog.usages.filter((usage) => usage.cardId === id);
const usagesForPage = (id) => catalog.usages.filter((usage) => usage.pageId === id);

const familyIdForPage = (page) => {
  const value = [page.figmaPageName, page.name].join("-");
  if (/签到|我的勋章|个人主页|我的发布|收藏|设置|我的页面|(^|-)我的-/.test(value)) return "mine";
  if (/首页-关注|关注管理/.test(value)) return "following";
  if (/搜索/.test(value)) return "search";
  if (/国补|好价/.test(value)) return "deals";
  if (/兴趣/.test(value)) return "interest";
  if (/社区|长文详情|AIGC详情/.test(value)) return "community";
  if (/发布/.test(value)) return "editor";
  if (/首页|榜单/.test(value)) return "home";
  if (/商业化|商业/.test(value)) return "commercial";
  return "other";
};

const pageMatches = (query) => catalog.pages.filter((page) =>
  [page.id, page.name, page.figmaPageName].join(" ").toLowerCase().includes(query)
);

const cardView = (card) => ({
  id: card.id,
  name: card.canonicalName,
  category: card.category,
  designId: card.designId,
  engineeringId: card.engineeringId,
  platformPolicy: card.platformPolicy,
  baseCardId: card.baseCardId,
  lifecycle: card.lifecycle,
  annotations: card.annotationRecords,
  visualExamples: card.visualExamples,
  variants: card.variants,
  configurableProperties: card.variantPropertyDefinitions,
  similarCardIds: card.similarCardIds,
  differenceNotes: card.differenceNotes,
  openQuestions: card.openQuestions,
  governance: card.governance,
  figmaUrl: card.figmaUrl,
  version: card.version
});

let result;
if (command === "info") {
  const card = cardById.get(args[0]);
  result = card ? cardView(card) : { error: "card-not-found", id: args[0] };
} else if (command === "usages") {
  const id = args[0];
  result = {
    card: cardById.has(id) ? cardView(cardById.get(id)) : null,
    usages: usagesForCard(id).map((usage) => {
      const page = pageById.get(usage.pageId) || null;
      return { ...usage, page, pageFamilyId: page ? familyIdForPage(page) : null };
    })
  };
} else if (command === "page") {
  const family = pageFamilies.find((item) => [item.id, item.name].join(" ").toLowerCase().includes(text));
  if (family) {
    const rawFrames = catalog.pages.filter((page) => familyIdForPage(page) === family.id);
    const rawFrameIds = new Set(rawFrames.map((page) => page.id));
    const grouped = new Map();
    for (const usage of catalog.usages.filter((item) => rawFrameIds.has(item.pageId) && item.relationshipStatus !== "rejected")) {
      const row = grouped.get(usage.cardId) || { cardId: usage.cardId, frameIds: new Set(), evidenceLevels: new Set(), humanReviewed: false };
      row.frameIds.add(usage.pageId);
      row.evidenceLevels.add(usage.evidenceLevel);
      row.humanReviewed ||= usage.humanReview?.status === "approved";
      grouped.set(usage.cardId, row);
    }
    result = {
      page: family,
      rawFrameCount: rawFrames.length,
      rawFrameSample: rawFrames.slice(0, 20),
      cards: [...grouped.values()].map((item) => ({
        cardId: item.cardId,
        cardName: cardById.get(item.cardId)?.canonicalName,
        frameCount: item.frameIds.size,
        evidenceLevels: [...item.evidenceLevels],
        humanReviewed: item.humanReviewed
      }))
    };
  } else {
    const pages = pageMatches(text);
    result = pages.map((page) => ({
      kind: "raw-frame",
      ...page,
      pageFamilyId: familyIdForPage(page),
      cards: usagesForPage(page.id).map((usage) => ({
        cardId: usage.cardId,
        cardName: cardById.get(usage.cardId)?.canonicalName,
        evidenceLevel: usage.evidenceLevel,
        humanReview: usage.humanReview
      }))
    }));
  }
} else if (command === "compare") {
  result = args.slice(0, 2).map((id) => cardById.has(id) ? cardView(cardById.get(id)) : { error: "card-not-found", id });
} else if (command === "search") {
  result = catalog.cards.filter((card) => {
    const haystack = [card.id, card.canonicalName, card.category]
      .concat(card.aliases || [], card.baseCardIds || [], (card.annotationRecords || []).map((item) => item.text), (card.variants || []).map((item) => item.name), (card.variantPropertyDefinitions || []).map((item) => item.name))
      .join(" ").toLowerCase();
    return haystack.includes(text);
  }).map(cardView);
} else if (command === "health") {
  result = {
    knowledgeVersion: catalog.meta.knowledgeVersion,
    schemaVersion: catalog.meta.schemaVersion,
    counts: catalog.meta.counts,
    unresolvedCardQuestions: catalog.cards.reduce((sum, card) => sum + card.openQuestions.length, 0),
    extractedVariants: catalog.cards.reduce((sum, card) => sum + card.variants.length, 0)
  };
} else {
  result = { usage: ["info <cardId>", "usages <cardId>", "page <name-or-id>", "compare <cardId> <cardId>", "search <text>", "health"] };
}

console.log(JSON.stringify(result, null, 2));
