const data = JSON.parse(document.getElementById("knowledge-data").textContent);
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = (value) => /^https?:\/\//i.test(value || "") ? esc(value) : "#";
const evidenceNames = { "figma-traceable": "Figma 可追溯", "observed-web": "网页观察", proposal: "工作建议", "project-policy": "项目约定", unknown: "证据待补", inferred: "推断 · 待复核", "human-reviewed": "人工确认", mixed: "混合证据" };
const state = { view: "library", query: "", scope: "all", evidence: "all", status: "all", category: "all", page: 0, selected: "D01", compared: [] };
const pageSize = 12;
const sections = [...new Set(data.entries.filter((e) => e.kind === "knowledge").map((e) => e.section))];
const cardById = new Map(data.cards.map((c) => [c.id, c]));
const pageById = new Map(data.pages.map((p) => [p.id, p]));
function badge(text, cls = "") { return `<span class="badge ${cls}">${esc(text)}</span>`; }
function updateHash() {
  const params = new URLSearchParams();
  for (const key of ["view", "query", "scope", "evidence", "status", "category", "selected"]) params.set(key, state[key]);
  history.replaceState(null, "", "#" + params.toString());
}
function syncInputs() { for (const key of ["scope", "evidence", "status"]) $(key).value = state[key]; $("search").value = state.query; }
function renderCategories() {
  const categories = [["all", "全部主题"], ...sections.map((s) => [s, s.replace(/^\d+-/, "")]), ["cards", "卡片证据"]];
  $("categories").innerHTML = '<p class="side-label">知识导航</p>' + categories.map(([id, label]) => {
    const count = id === "all" ? data.entries.length : id === "cards" ? data.cards.length : data.entries.filter((e) => e.kind === "knowledge" && e.section === id).length;
    return `<button class="category ${state.category === id ? "active" : ""}" data-category="${esc(id)}" aria-pressed="${state.category === id}">${esc(label)}<small>${count}</small></button>`;
  }).join("");
}
function filtered() {
  const terms = state.query.toLowerCase().trim().split(/\s+/u).filter(Boolean);
  return data.entries.filter((e) => {
    const text = [e.id, e.name, e.summary, e.body].join(" ").toLowerCase();
    return (state.scope === "all" || e.kind === state.scope) &&
      (state.evidence === "all" || e.evidence === state.evidence) &&
      (state.status === "all" || e.status === state.status) &&
      (state.category === "all" || (state.category === "cards" ? e.kind === "card" : e.kind === "knowledge" && e.section === state.category)) &&
      terms.every((t) => text.includes(t));
  }).sort((a, b) => Number(b.id === state.query.trim()) - Number(a.id === state.query.trim()));
}
function renderResults() {
  const rows = filtered();
  state.page = Math.min(state.page, Math.max(0, Math.ceil(rows.length / pageSize) - 1));
  if (rows.length && !rows.some((e) => e.id === state.selected)) state.selected = rows[0].id;
  $("result-count").textContent = `${rows.length} 条结果`;
  $("result-list").innerHTML = rows.slice(state.page * pageSize, (state.page + 1) * pageSize).map((e) =>
    `<div class="result-row ${state.selected === e.id ? "selected" : ""}"><button class="result-open" data-entry="${esc(e.id)}"><strong>${esc(e.id)} · ${esc(e.name)}</strong><small>${e.kind === "card" ? "原始卡片证据" : esc(e.section.replace(/^\d+-/, ""))} · ${esc(evidenceNames[e.evidence] || e.evidence)}</small></button>${e.kind === "card" ? `<input type="checkbox" data-compare="${esc(e.id)}" aria-label="对比卡片 ${esc(e.id)}" ${state.compared.includes(e.id) ? "checked" : ""} ${state.compared.length >= 2 && !state.compared.includes(e.id) ? "disabled" : ""}>` : ""}</div>`
  ).join("") || '<div class="empty">未找到匹配资料。<br>当前库没有足够证据。</div>';
  $("page-count").textContent = rows.length ? `${state.page + 1} / ${Math.ceil(rows.length / pageSize)}` : "0 / 0";
  $("previous").disabled = state.page === 0;
  $("next").disabled = (state.page + 1) * pageSize >= rows.length;
  $("compare").disabled = state.compared.length !== 2;
  $("compare-count").textContent = state.compared.length;
  if (!rows.length) { $("detail").innerHTML = '<div class="empty">当前筛选下没有资料。未确认内容不会作为已确认规范展示。</div>'; }
  updateHash();
}
function cardSection(c) {
  const notes = (c.annotationRecords || []).map((a) => `<li>${esc(a.text).replace(/\n/g, "<br>")}</li>`).join("");
  const variants = (c.variants || []).map((v) => `<tr><td>${esc(v.name)}</td><td><a href="https://www.figma.com/design/bAgan5FT4BJsOkwGpIeGVM/?node-id=${encodeURIComponent(v.nodeId)}" target="_blank" rel="noopener">${esc(v.nodeId)}</a></td><td>${esc(v.width)} × ${esc(v.height)}</td></tr>`).join("");
  const props = (c.variantPropertyDefinitions || []).map((p) => `<li>${esc(p.name)}${p.options ? "：" + esc(p.options.join("、")) : " · " + esc(p.type || "未分类")}</li>`).join("");
  const usages = data.usages.filter((u) => u.cardId === c.id);
  const sample = data.entries.find((e) => e.card_id === c.id);
  return `<div class="detail-links"><a href="${safeUrl(c.figmaUrl)}" target="_blank" rel="noopener">Figma 来源</a><a href="../source/card-finder/knowledge/cards/${esc(c.id)}.md" target="_blank" rel="noopener">原始档案</a>${sample ? `<button data-entry="${esc(sample.id)}">精炼评审档案</button>` : ""}</div>
    <img class="card-preview" src="../source/card-finder/assets/cards/${esc(c.id)}.png" alt="${esc(c.id)} 卡片原始预览">
    <div class="callout">${c.sourceKind !== "figma-authoritative-heading" ? "页面侧待归档编号，尚未找到卡片库权威编号标题。" : "预览与编号来自扫描快照；来源可追溯不等于业务定义已确认。"}研发编号 ${esc(c.engineeringId)} 为项目映射约定，尚未核验代码。</div>
    <section class="prose"><h3>原始备注</h3>${notes ? `<ul>${notes}</ul>` : '<p class="meta">没有记录备注。</p>'}<h3>变体与配置</h3>${variants ? `<table><thead><tr><th>原始名称</th><th>节点</th><th>扫描尺寸</th></tr></thead><tbody>${variants}</tbody></table>` : '<p class="meta">未提取到变体，不代表没有状态。</p>'}${props ? `<ul>${props}</ul>` : ""}<h3>原始待确认问题</h3>${c.openQuestions?.length ? `<ul>${c.openQuestions.map((q) => `<li>${esc(q)}</li>`).join("")}</ul>` : '<p class="meta">原始问题字段为空，不代表已通过人工审核。</p>'}<h3>页面关系 · ${usages.length}</h3><p class="relation-note">原始 Frame 是证据容器；旧 status=confirmed 字段不代表人工批准。</p>${usages.length ? `<table><thead><tr><th>Frame</th><th>证据</th><th>人工确认</th><th>关系状态</th></tr></thead><tbody>${usages.map((u) => { const p = pageById.get(u.pageId); return `<tr><td>${p?.figmaUrl ? `<a href="${safeUrl(p.figmaUrl)}" target="_blank" rel="noopener">${esc(p.name)}</a>` : esc(p?.name || u.pageId)}</td><td>${esc(evidenceNames[u.evidenceLevel] || u.evidenceLevel)}</td><td>${u.humanReview?.status === "approved" ? "已确认" : "未确认"}</td><td>${esc(u.relationshipStatus || "未知")}</td></tr>`; }).join("")}</tbody></table>` : '<p class="meta">没有收录页面关系，不代表该卡片未使用。</p>'}</section>`;
}
function renderDetail() {
  const e = data.entries.find((e) => e.id === state.selected);
  if (!e) { $("detail").innerHTML = '<div class="empty">档案不存在。</div>'; return; }
  $("detail").innerHTML = `<div class="badges">${badge(e.status, e.status === "已确认" ? "evidence" : "pending")}${badge(evidenceNames[e.evidence] || e.evidence, "evidence")}${badge(e.kind === "card" ? "原始证据" : "精炼档案")}</div><h2>${esc(e.id)} · ${esc(e.name)}</h2><p class="meta">版本 ${esc(e.version)}${e.owner ? " · " + esc(e.owner) : ""}</p>` + (e.kind === "card" ? cardSection(cardById.get(e.id)) : `<p>${esc(e.summary)}</p><div class="detail-links"><a href="../${esc(e.path)}" target="_blank" rel="noopener">源文档</a>${(e.source_ids || []).map((id) => `<button data-source="${esc(id)}">${esc(data.sources.find((s) => s.id === id)?.name || id)}</button>`).join("")}</div>${e.questions?.length ? `<div class="callout">关联待确认：${e.questions.map((id) => `<button data-issue="${esc(id)}">${esc(id)}</button>`).join(" ")}</div>` : ""}<div class="prose">${e.html}</div>`);
}
function renderIssues() {
  $("issue-list").innerHTML = data.issues.filter((i) => $("priority").value === "all" || i.priority === $("priority").value).map((i) => `<section class="issue" id="issue-${esc(i.id)}"><h3>${badge(i.priority, "pending")} ${esc(i.id)} · ${esc(i.title)}</h3><div class="owner">${esc(i.owner)} · ${esc(i.status)}</div><p>${esc(i.question)}</p><p><strong>关闭条件：</strong>${esc(i.resolution)}</p><p><strong>试用处理：</strong>${esc(i.interim)}</p><div class="detail-links">${i.affects.map((id) => `<button data-entry="${esc(id)}">${esc(data.entries.find((e) => e.id === id)?.name || id)}</button>`).join("")}</div></section>`).join("");
}
function renderSources() {
  $("source-list").innerHTML = data.sources.map((s) => `<section class="source" id="source-${esc(s.id)}"><h3>${esc(s.name)} ${badge(evidenceNames[s.evidence] || s.evidence, "evidence")}</h3><p>${esc(s.scope)}</p><p class="meta">采集日期 ${esc(s.retrievedAt)}</p><div class="callout">${esc(s.limitation)}</div><div class="detail-links">${s.url ? `<a href="${safeUrl(s.url)}" target="_blank" rel="noopener">打开来源</a>` : ""}${s.snapshot ? `<a href="../${esc(s.snapshot)}" target="_blank" rel="noopener">本地证据</a>` : ""}</div></section>`).join("");
}
function showView(view) {
  state.view = view;
  for (const name of ["library", "issues", "sources", "report"]) $(name + "-view").hidden = name !== view;
  document.querySelectorAll("[data-view]").forEach((b) => { if (b.dataset.view === view) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  updateHash();
}
function openEntry(id) {
  if (!data.entries.some((e) => e.id === id)) return;
  state.selected = id;
  if (!filtered().some((e) => e.id === id)) { Object.assign(state, { query: "", scope: "all", evidence: "all", status: "all", category: "all" }); syncInputs(); renderCategories(); }
  state.page = Math.floor(filtered().findIndex((e) => e.id === id) / pageSize);
  showView("library"); renderResults(); renderDetail();
  $("detail").focus({ preventScroll: true });
  if (innerWidth <= 760) $("detail").scrollIntoView({ behavior: "smooth", block: "start" });
}
function renderCompare() {
  if (state.compared.length !== 2) return;
  $("detail").innerHTML = `<h2>卡片对比</h2><p class="meta">证据版本 ${esc(data.cardVersion)} · 正式业务差异未确认时保持未知</p><div class="compare-grid">${state.compared.map((id) => { const c = cardById.get(id); return `<section><h3>${esc(id)} · ${esc(c.canonicalName)}</h3><img src="../source/card-finder/assets/cards/${esc(id)}.png" alt="${esc(id)} 卡片预览"><p>${badge("待确认", "pending")}</p><p>${esc(c.category)}</p><p><strong>差异结论：</strong>${esc(c.differenceNotes || "暂无正式差异结论")}</p><p><strong>待确认：</strong></p><ul>${(c.openQuestions || []).map((q) => `<li>${esc(q)}</li>`).join("") || "<li>尚无完整业务审核记录</li>"}</ul><button data-entry="${esc(id)}">查看完整档案</button></section>`; }).join("")}</div>`;
  if (innerWidth <= 760) $("detail").scrollIntoView({ behavior: "smooth" });
}
document.addEventListener("click", (event) => {
  const b = event.target.closest("button"); if (!b) return;
  if (b.dataset.view) showView(b.dataset.view);
  if (b.dataset.entry) openEntry(b.dataset.entry);
  if (b.dataset.category) { state.category = b.dataset.category; state.scope = "all"; state.page = 0; syncInputs(); renderCategories(); renderResults(); renderDetailIfResults(); }
  if (b.dataset.issue) { $("priority").value = "all"; renderIssues(); showView("issues"); $("issue-" + b.dataset.issue)?.scrollIntoView({ behavior: "smooth" }); }
  if (b.dataset.source) { showView("sources"); $("source-" + b.dataset.source)?.scrollIntoView({ behavior: "smooth" }); }
});
function renderDetailIfResults() { if (filtered().length) renderDetail(); }
$("search-form").addEventListener("submit", (e) => e.preventDefault());
$("search").addEventListener("input", () => { state.query = $("search").value; state.page = 0; renderResults(); renderDetailIfResults(); });
for (const key of ["scope", "evidence", "status"]) $(key).addEventListener("change", () => { state[key] = $(key).value; state.page = 0; if (key === "scope") state.category = "all"; renderCategories(); renderResults(); renderDetailIfResults(); });
$("reset").addEventListener("click", () => { Object.assign(state, { query: "", scope: "all", evidence: "all", status: "all", category: "all", page: 0, selected: "D01", compared: [] }); syncInputs(); renderCategories(); renderResults(); renderDetailIfResults(); });
$("previous").addEventListener("click", () => { state.page--; renderResults(); });
$("next").addEventListener("click", () => { state.page++; renderResults(); });
$("result-list").addEventListener("change", (event) => { const id = event.target.dataset.compare; if (!id) return; state.compared = event.target.checked ? [...new Set([...state.compared, id])].slice(0, 2) : state.compared.filter((c) => c !== id); renderResults(); });
$("compare").addEventListener("click", renderCompare);
$("priority").addEventListener("change", renderIssues);
$("print").addEventListener("click", () => window.print());
function restore() {
  const params = new URLSearchParams(location.hash.slice(1));
  for (const key of ["view", "query", "scope", "evidence", "status", "category", "selected"]) if (params.has(key)) state[key] = params.get(key);
  if (!["library", "issues", "sources", "report"].includes(state.view)) state.view = "library";
  for (const key of ["scope", "evidence", "status"]) if (![...$(key).options].some((o) => o.value === state[key])) state[key] = "all";
  if (!["all", "cards", ...sections].includes(state.category)) state.category = "all";
  if (!data.entries.some((e) => e.id === state.selected)) state.selected = "D01";
  syncInputs(); renderCategories(); renderResults(); renderDetailIfResults(); showView(state.view);
}
$("version").textContent = data.version;
$("issue-count").textContent = data.metrics.issues;
$("metrics").innerHTML = [[data.metrics.documents, "精炼知识档案", ""], [data.metrics.cards, "卡片证据档案", ""], [data.metrics.traceable, "Figma 可追溯关系", "green"], [data.metrics.humanConfirmed, "人工确认关系", "amber"], [data.metrics.issues, "本轮待确认事项", "amber"]].map(([value, label, cls]) => `<div class="metric"><strong class="${cls}">${value}</strong><span>${label}</span></div>`).join("");
$("report").innerHTML = data.report;
renderIssues(); renderSources(); restore();
window.addEventListener("hashchange", restore);
