import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import { loadKnowledge, root, searchEntries } from "./knowledge.mjs";

export const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const data = loadKnowledge();
function render(body, file, omitTitle = false) {
  const tokens = marked.lexer(body);
  if (omitTitle && tokens[0]?.type === "heading" && tokens[0]?.depth === 1) tokens.shift();
  return sanitizeHtml(marked.parser(tokens), {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, "img"],
    allowedAttributes: { ...sanitizeHtml.defaults.allowedAttributes, img: ["src", "alt", "loading"], a: ["href", "target", "rel"] },
    transformTags: {
      a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, href: resolveLink(attribs.href, file), target: "_blank", rel: "noopener noreferrer" } }),
      img: (tagName, attribs) => ({ tagName, attribs: { ...attribs, src: resolveLink(attribs.src, file), loading: "lazy" } })
    }
  });
}
function resolveLink(href = "", file) {
  if (/^(https?:|#)/i.test(href)) return href;
  if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith("//")) return "";
  return "../" + path.posix.normalize(path.posix.join(path.posix.dirname(file), href));
}
const entries = searchEntries(data).map((e) => ({ ...e, html: e.kind === "knowledge" ? render(e.body, e.path, true) : "" }));
const metricsMd = `# 本版验收数据\n\n由 npm run build 自动生成，请勿手工修改。\n\n知识版本：${data.version}；卡片证据版本：${data.cardVersion}。\n\n| 指标 | 数量 | 说明 |\n| --- | --- | --- |\n| 精炼知识档案 | ${data.metrics.documents} | 六层主题，均保留来源与确认信息 |\n| 重点卡片评审档案 | ${data.metrics.sampleCards} | 包含在精炼档案中，不额外相加 |\n| 已人工确认知识档案 | ${data.metrics.confirmedDocuments} | 不是 Figma 可追溯数量 |\n| 卡片记录 | ${data.metrics.cards} | 原始快照，含页面侧待归档编号 |\n| 原始页面 Frame | ${data.metrics.frames} | 不是业务页面数量 |\n| 页面关系 | ${data.metrics.relations} | 设计证据，非线上调用 |\n| Figma 可追溯关系 | ${data.metrics.traceable} | 不等于人工确认 |\n| 推断关系 | ${data.metrics.inferred} | 需复核 |\n| 人工确认关系 | ${data.metrics.humanConfirmed} | 以 humanReview 为准 |\n| 本轮待确认事项 | ${data.metrics.issues} | 不是全库所有未知问题的数量 |\n\n完整性校验与检索测试结果见实际命令输出，本文件不声称测试已经通过。PC 像素规范、完整 Token、研发映射尚未接入。\n`;
const artifacts = new Map();
artifacts.set("docs/本版验收数据.md", metricsMd);
artifacts.set("docs/待确认清单.md", `# 待确认清单\n\n版本：${data.version}。由 governance/issues.json 生成，请勿重复维护。\n\n` + data.issues.map((i) => `## ${i.id} · ${i.title}\n\n优先级：${i.priority}；状态：${i.status}；责任角色：${i.owner}。\n\n待确认：${i.question}\n\n关闭条件：${i.resolution}\n\n试用处理：${i.interim}\n\n影响档案：${i.affects.join("、")}。\n`).join("\n"));
const report = fs.readFileSync(path.join(root, "docs/领导汇报.md"), "utf8") + "\n\n" + metricsMd;
const payload = {
  version: data.version, cardVersion: data.cardVersion, metrics: data.metrics, entries,
  issues: data.issues, sources: data.sources, cards: data.catalog.cards,
  pages: data.catalog.pages, usages: data.catalog.usages,
  report: render(report, "docs/领导汇报.md")
};
const css = fs.readFileSync(path.join(root, "ui/styles.css"), "utf8");
const js = fs.readFileSync(path.join(root, "ui/app.js"), "utf8");
const template = fs.readFileSync(path.join(root, "ui/template.html"), "utf8");
const json = JSON.stringify(payload).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
artifacts.set("site/index.html", template.replace("/* STYLES */", css).replace("/* DATA */", () => json).replace("/* APP */", () => js));
artifacts.set("site/knowledge-index.json", JSON.stringify({ version: data.version, cardVersion: data.cardVersion, entries: entries.map(({ html, ...entry }) => entry) }, null, 2) + "\n");
const check = process.argv.includes("--check");
let stale = false;
for (const [file, content] of artifacts) {
  if (check) {
    if (!fs.existsSync(path.join(root, file)) || fs.readFileSync(path.join(root, file), "utf8") !== content) {
      console.error(`生成文件已过期：${file}，请运行 npm run build`); stale = true;
    }
  } else {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  }
}
if (stale) process.exitCode = 1;
else console.log(JSON.stringify({ ok: true, mode: check ? "check" : "build", version: data.version, ...data.metrics }, null, 2));
