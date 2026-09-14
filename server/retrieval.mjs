import { loadKnowledge, searchEntries } from "../scripts/knowledge.mjs";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

export function createKnowledge() {
  const data = loadKnowledge();
  const entries = searchEntries(data);
  const cards = new Map(data.catalog.cards.map((c) => [c.id, c]));
  const dictionary = [
    ...new Set(
      entries.flatMap((e) => [
        e.name,
        e.section,
        ...(e.name?.match(/[\p{Script=Han}]{2,8}/gu) || []),
      ]),
    ),
  ].filter(Boolean);
  const common = [
    "视频",
    "价格",
    "商品",
    "好价",
    "搜索",
    "首页",
    "问答",
    "编辑",
    "文章",
    "优惠",
    "字体",
    "颜色",
    "间距",
    "圆角",
    "按钮",
    "导航",
    "标签",
    "动效",
    "状态",
    "评审",
  ];
  function query(text, limit = 8) {
    const q = text.trim().toLowerCase();
    if (!q) return [];
    const ids = q.match(/\b\d{5}\b/g) || [];
    const terms = [
      ...new Set([
        ...q.split(/\s+/u),
        ...dictionary.filter((t) => q.includes(t.toLowerCase())),
        ...common.filter((t) => q.includes(t)),
        ...ids,
      ]),
    ];
    return entries
      .filter(
        (e) =>
          !ids.length ||
          ids.includes(e.id) ||
          ids.includes(String(e.card_id)) ||
          ids.some((id) => e.body.includes(id)),
      )
      .map((e) => {
        const title = `${e.id} ${e.name} ${e.section}`.toLowerCase();
        const body = `${e.summary || ""} ${e.body}`.toLowerCase();
        const score =
          terms.reduce(
            (n, t) =>
              n +
              (title.includes(t)
                ? 10 + Math.min(t.length, 20)
                : body.includes(t)
                  ? 2
                  : 0),
            0,
          ) + (ids.includes(e.id) ? 1000 : 0);
        return { e, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || (a.e.kind === "knowledge" ? -1 : 1))
      .slice(0, limit)
      .map((x) => evidence(x.e));
  }
  function evidence(entry) {
    const card = entry.kind === "card" ? cards.get(entry.id) : null;
    const sourceRecords = (entry.source_ids || [])
      .map((id) => data.sources.find((s) => s.id === id))
      .filter(Boolean);
    const relations = card
      ? data.catalog.usages
          .filter(
            (u) => u.cardId === card.id && u.relationshipStatus !== "rejected",
          )
          .map((u) => ({
            page: data.catalog.pages.find((p) => p.id === u.pageId)?.name,
            evidence: u.evidenceLevel,
            humanReview: u.humanReview,
            node: u.evidenceNodeId,
          }))
      : [];
    const body = card
      ? entry.body +
        "\n\n属性定义（不代表可任意组合）：" +
        JSON.stringify(card.variantPropertyDefinitions) +
        "\n\n页面关联（Frame，不等于业务页面）：" +
        JSON.stringify(relations)
      : entry.body;
    const html =
      entry.kind === "knowledge"
        ? sanitizeHtml(marked.parse(entry.body), {
            allowedTags: sanitizeHtml.defaults.allowedTags,
            allowedAttributes: { a: ["href", "target", "rel"] },
            transformTags: {
              a: (_tag, attrs) => ({
                tagName: "a",
                attribs: /^https:\/\//.test(attrs.href || "")
                  ? {
                      href: attrs.href,
                      target: "_blank",
                      rel: "noopener noreferrer",
                    }
                  : {},
              }),
            },
          })
        : "";
    return {
      id: `${entry.kind}:${entry.id}`,
      recordId: entry.id,
      kind: entry.kind,
      title: entry.name,
      category: entry.section,
      status: entry.status,
      version: entry.version,
      body,
      html,
      sourceRecords,
      summary: entry.summary || "",
      path: entry.path,
      sourceUrl: card?.figmaUrl || null,
      previewUrl: card?.previewPath ? `/card-assets/${card.id}.png` : null,
    };
  }
  function card(id) {
    const c = cards.get(id);
    if (!c) return null;
    return {
      ...c,
      previewUrl: c.previewPath ? `/card-assets/${c.id}.png` : null,
      usages: data.catalog.usages
        .filter((u) => u.cardId === id)
        .map((u) => ({
          ...u,
          page: data.catalog.pages.find((p) => p.id === u.pageId),
        })),
      documents: entries.filter((e) => String(e.card_id) === id).map(evidence),
      cardVersion: data.cardVersion,
      knowledgeVersion: data.version,
    };
  }
  return { data, entries, query, card, evidence };
}

export function retrievalAnswer(question, sources, version) {
  const review = /评审|检查|验收/.test(question);
  return {
    mode: "retrieval",
    title: review
      ? "评审资料与待确认项"
      : sources.length
        ? "已找到相关资料"
        : "没有找到足够依据",
    summary: sources.length
      ? "以下为知识检索结果，尚未经过模型归纳。Figma 记录不等于已人工确认规范。"
      : "请补充卡片编号、页面名称或更具体的关键词。没有依据时不推测结论。",
    findings: sources.slice(0, 4).map((s) => ({
      text: `${s.title}：${
        s.summary ||
        s.body
          .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
          .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
          .replace(/#{1,6} /g, "")
          .slice(0, 180)
      }${s.summary ? "" : "…"}`,
      citations: [s.id],
    })),
    suggestions: review
      ? ["工作建议：核对端型、内容字段、空态和异常态，再提交设计及研发确认。"]
      : [],
    questions: ["未确认的用途、状态及研发映射需人工复核。"],
    sources,
    version,
  };
}

export function validateAnswer(value, sources) {
  const ids = new Set(sources.map((s) => s.id));
  if (
    !value ||
    typeof value.title !== "string" ||
    typeof value.summary !== "string" ||
    !Array.isArray(value.findings) ||
    !Array.isArray(value.suggestions) ||
    !Array.isArray(value.questions)
  )
    throw new Error("MODEL_OUTPUT_INVALID");
  if (
    value.title.length > 200 ||
    value.summary.length > 3000 ||
    value.findings.length > 12
  )
    throw new Error("MODEL_OUTPUT_INVALID");
  for (const f of value.findings) {
    if (
      typeof f.text !== "string" ||
      f.text.length > 4000 ||
      !Array.isArray(f.citations) ||
      !f.citations.length ||
      f.citations.some((id) => !ids.has(id))
    )
      throw new Error("MODEL_CITATION_INVALID");
  }
  for (const list of [value.suggestions, value.questions])
    if (
      list.length > 12 ||
      list.some((x) => typeof x !== "string" || x.length > 2000)
    )
      throw new Error("MODEL_OUTPUT_INVALID");
  return {
    title: value.title,
    summary: value.summary,
    findings: value.findings.map((f) => ({
      text: f.text,
      citations: f.citations,
    })),
    suggestions: value.suggestions,
    questions: value.questions,
  };
}
