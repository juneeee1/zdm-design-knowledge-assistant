import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";
import { root } from "../scripts/knowledge.mjs";

// Exercise our UI logic in an isolated DOM; no browser navigation or resource loading.
function portal() {
  const html = fs.readFileSync(path.join(root, "site/index.html"), "utf8");
  const dom = new JSDOM(html, { url: "https://knowledge.test/", runScripts: "outside-only" });
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  dom.window.eval(fs.readFileSync(path.join(root, "ui/app.js"), "utf8"));
  const doc = dom.window.document;
  const change = (id, value, event = "change") => { doc.getElementById(id).value = value; doc.getElementById(id).dispatchEvent(new dom.window.Event(event, { bubbles: true })); };
  return { dom, doc, change };
}
test("DOM: 搜索、空状态与重置", () => {
  const { dom, doc, change } = portal();
  try {
    assert.match(doc.getElementById("result-count").textContent, /287/);
    change("search", "字号", "input");
    assert.match(doc.getElementById("result-list").textContent, /字号与行高/);
    change("search", "不存在的987654321", "input");
    assert.match(doc.getElementById("detail").textContent, /没有资料/);
    doc.getElementById("reset").click();
    change("status", "已确认");
    assert.match(doc.getElementById("result-count").textContent, /0 条/);
    assert.doesNotMatch(doc.getElementById("detail").textContent, /F01/);
    doc.getElementById("reset").click();
    assert.match(doc.getElementById("detail").textContent, /D01/);
  } finally { dom.window.close(); }
});
test("DOM: 卡片对比、原始关系和图片路径", () => {
  const { dom, doc, change } = portal();
  try {
    change("scope", "card"); change("search", "2004", "input");
    for (const id of ["20040", "20041"]) doc.querySelector(`[data-compare="${id}"]`).click();
    assert.equal(doc.getElementById("compare").disabled, false);
    doc.getElementById("compare").click();
    assert.match(doc.getElementById("detail").textContent, /暂无正式差异结论/);
    assert.equal(doc.querySelectorAll(".compare-grid>section").length, 2);
    doc.querySelector('#detail [data-entry="20040"]').click();
    assert.match(doc.getElementById("detail").textContent, /未确认/);
    assert.match(doc.getElementById("detail").textContent, /页面关系/);
    for (const img of doc.querySelectorAll("#detail img")) assert.ok(fs.existsSync(path.resolve(root, "site", img.getAttribute("src"))));
  } finally { dom.window.close(); }
});
test("DOM: 问题筛选、来源跳转、汇报与深链接", () => {
  const { dom, doc, change } = portal();
  try {
    doc.querySelector('[data-view="issues"]').click(); change("priority", "P0");
    assert.equal(doc.querySelectorAll(".issue").length, 4);
    doc.querySelector('#issue-Q01 [data-entry="F01"]').click();
    assert.equal(doc.getElementById("library-view").hidden, false);
    assert.match(doc.getElementById("detail").textContent, /14px/);
    assert.equal(doc.querySelectorAll("#detail h1").length, 0);
    doc.querySelector('#detail [data-source="damo-intro"]').click();
    assert.equal(doc.getElementById("sources-view").hidden, false);
    doc.querySelector('[data-view="report"]').click();
    assert.match(doc.getElementById("report").textContent, /未测量实际节省工时/);
    assert.ok(dom.window.location.hash.includes("view=report"));
    for (const a of doc.querySelectorAll(".prose a[target='_blank']")) assert.match(a.rel, /noopener/);
  } finally { dom.window.close(); }
});
test("DOM: 窄屏和打印样式存在且 CSS 能解析", () => {
  const { dom, doc } = portal();
  try {
    const rules = [...doc.styleSheets[0].cssRules];
    assert.ok(rules.some((r) => r.conditionText === "print"));
    assert.ok(rules.some((r) => r.conditionText?.includes("760px")));
    assert.ok(rules.some((r) => r.selectorText === ".prose img,.card-preview"));
  } finally { dom.window.close(); }
});
