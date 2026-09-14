import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { loadKnowledge, search, searchEntries, root } from "../scripts/knowledge.mjs";

const data = loadKnowledge();
const entries = searchEntries(data);
test("精确编号优先，并保留原始证据与精炼档案", () => {
  const matches = search(entries, "20040");
  assert.equal(matches[0].id, "20040");
  assert.ok(matches.some((m) => m.id === "C20040"));
});
test("字号来源能查到，不凭空生成已确认结论", () => {
  const matches = search(entries, "字号 行高");
  assert.ok(matches.some((m) => m.id === "F01"));
  assert.equal(data.documents.find((d) => d.id === "F01").status, "待确认");
  assert.ok(search(entries, "不存在的规则987654321").length === 0);
});
test("可追溯与人工确认独立统计", () => {
  assert.equal(data.metrics.humanConfirmed, data.catalog.usages.filter((u) => u.humanReview?.status === "approved" && u.relationshipStatus !== "rejected").length);
  assert.ok(data.metrics.traceable > data.metrics.humanConfirmed);
  assert.equal(data.metrics.confirmedDocuments, 0);
});
test("保留未命名变体和视频比例疑问", () => {
  assert.ok(search(entries, "状态4").some((e) => e.id === "20032"));
  assert.ok(search(entries, "Variant4").some((e) => e.id === "20048"));
  assert.ok(data.issues.find((i) => i.id === "Q07").question.includes("16:9"));
});
test("CLI 可以跨工作目录查询；缺失 ID 失败退出", () => {
  const script = `${root}/scripts/query-knowledge.mjs`;
  const record = JSON.parse(execFileSync(process.execPath, [script, "get", "F01"], { cwd: "/", encoding: "utf8" }));
  assert.equal(record.id, "F01");
  const missing = spawnSync(process.execPath, [script, "get", "MISSING"], { encoding: "utf8" });
  assert.equal(missing.status, 1);
  assert.ok(JSON.parse(missing.stdout).error);
  const empty = spawnSync(process.execPath, [script, "search"], { encoding: "utf8" });
  assert.equal(empty.status, 1);
});
