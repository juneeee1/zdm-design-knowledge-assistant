import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Alert,
  App as AntApp,
  Button,
  Checkbox,
  ConfigProvider,
  Drawer,
  Empty,
  Input,
  Modal,
  Pagination,
  Select,
  Spin,
  Tag,
  Tooltip,
} from "antd";
import { Bubble } from "@ant-design/x";
import {
  ArrowUp,
  BookOpen,
  Check,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  FileCheck2,
  GitCompareArrows,
  History,
  Layers3,
  Menu,
  MessageSquare,
  Plus,
  Search,
  Settings2,
  Square,
  Terminal,
  ThumbsDown,
  Trash2,
  X,
} from "lucide-react";
import "antd/dist/reset.css";
import "./styles.css";

const iconsize = 17;
const icon = (Icon) => <Icon size={iconsize} />;
async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("服务暂时不可用，请稍后重试");
  }
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}
function loadHistory() {
  try {
    const a = JSON.parse(localStorage.getItem("zdm-assistant-history") || "[]");
    return Array.isArray(a)
      ? a
          .filter((x) => typeof x.id === "string" && Array.isArray(x.turns))
          .slice(0, 20)
      : [];
  } catch {
    return [];
  }
}
function download(name, text) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/markdown;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportText(turn) {
  const a = turn.answer;
  return (
    `# ${a.title}\n\n需求：${turn.question}\n\n知识版本：${a.version}；卡片证据版本：${a.cardVersion}\n模式：${a.mode === "ai" ? "AI 归纳" : "知识检索"}\n\n${a.summary}\n\n` +
    a.findings
      .map((f) => `${f.text}\n\n依据：${f.citations.join("、")}`)
      .join("\n\n") +
    "\n\n## 工作建议\n" +
    a.suggestions.map((s) => `- ${s}`).join("\n") +
    "\n\n## 待确认\n" +
    a.questions.map((s) => `- ${s}`).join("\n") +
    "\n\n## 来源\n" +
    a.sources
      .map(
        (s) =>
          `- ${s.id} · ${s.title} · ${s.version} · ${s.status}\n  ${s.sourceUrl || s.path}`,
      )
      .join("\n")
  );
}
function Preview({ card, onClick }) {
  return (
    <button
      className="preview"
      onClick={onClick}
      aria-label={`预览 ${card.id} ${card.title || card.canonicalName}`}
    >
      {card.previewUrl ? (
        <img
          src={card.previewUrl}
          alt={`${card.id} ${card.title || card.canonicalName}`}
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.display = "none";
            e.currentTarget.parentElement.dataset.failed = "预览暂不可用";
          }}
        />
      ) : (
        <span>暂无预览</span>
      )}
    </button>
  );
}
function Assistant() {
  const { message } = AntApp.useApp();
  const [boot, setBoot] = useState(null),
    [fatal, setFatal] = useState(""),
    [view, setView] = useState("chat"),
    [mobileNav, setMobileNav] = useState(false);
  const [sessions, setSessions] = useState(loadHistory),
    [sessionId, setSessionId] = useState(null),
    [turns, setTurns] = useState([]),
    [input, setInput] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("all"),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState([]),
    [comparing, setComparing] = useState(false),
    [compareData, setCompareData] = useState([]);
  const [detail, setDetail] = useState(null),
    [detailBusy, setDetailBusy] = useState(false),
    [detailError, setDetailError] = useState(""),
    [evidence, setEvidence] = useState(null),
    [install, setInstall] = useState(false),
    [feedback, setFeedback] = useState(null),
    [note, setNote] = useState(""),
    [feedbackBusy, setFeedbackBusy] = useState(false);
  const controller = useRef(null),
    detailSequence = useRef(0),
    bottom = useRef(null);
  useEffect(() => {
    api("/api/bootstrap")
      .then(setBoot)
      .catch((e) => setFatal(e.message));
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("zdm-assistant-history", JSON.stringify(sessions));
    } catch {
      message.warning("本机历史存储空间不足，请导出重要记录");
    }
  }, [sessions]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length, busy]);
  async function ask(question = input) {
    if (!question.trim() || busy) return;
    const q = question.trim();
    setInput("");
    setError("");
    setBusy(true);
    setView("chat");
    setMobileNav(false);
    const id = sessionId || crypto.randomUUID();
    setSessionId(id);
    const pending = { id: crypto.randomUUID(), question: q };
    const next = [...turns, pending];
    setTurns(next);
    controller.current = new AbortController();
    try {
      const answer = await api("/api/ask", {
        method: "POST",
        signal: controller.current.signal,
        body: JSON.stringify({
          question: q,
          history: turns.map((t) => t.question).slice(-3),
        }),
      });
      const completed = next.map((t) =>
        t.id === pending.id ? { ...t, answer } : t,
      );
      setTurns(completed);
      setSessions((old) =>
        [
          {
            id,
            title: completed[0].question,
            updated: new Date().toISOString(),
            turns: completed,
          },
          ...old.filter((s) => s.id !== id),
        ].slice(0, 20),
      );
    } catch (e) {
      setTurns(turns);
      setInput(q);
      setError(
        e.name === "AbortError"
          ? "已停止本次回答。问题已保留，可再次提交。"
          : e.message,
      );
    } finally {
      setBusy(false);
      controller.current = null;
    }
  }
  function newChat() {
    if (busy) return;
    setSessionId(null);
    setTurns([]);
    setError("");
    setInput("");
    setView("chat");
    setMobileNav(false);
  }
  async function openCard(id) {
    const seq = ++detailSequence.current;
    setDetail({ id });
    setDetailBusy(true);
    setDetailError("");
    try {
      const data = await api(`/api/cards/${id}`);
      if (seq === detailSequence.current) setDetail(data);
    } catch (e) {
      if (seq === detailSequence.current) setDetailError(e.message);
    } finally {
      if (seq === detailSequence.current) setDetailBusy(false);
    }
  }
  async function openDoc(id) {
    try {
      setEvidence(await api(`/api/document?id=${encodeURIComponent(id)}`));
    } catch (e) {
      message.error(e.message);
    }
  }
  async function compare() {
    if (selected.length !== 2) return;
    setComparing(true);
    setCompareData([]);
    try {
      const a = await Promise.all(
        selected.map((id) => api(`/api/cards/${id}`)),
      );
      setCompareData(a);
    } catch (e) {
      message.error(e.message);
      setComparing(false);
    }
  }
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      message.success("已复制");
    } catch {
      message.error("无法访问剪贴板，请使用导出");
    }
  }
  async function saveFeedback() {
    setFeedbackBusy(true);
    try {
      await api("/api/feedback", {
        method: "POST",
        body: JSON.stringify({ note, record: feedback }),
      });
      setFeedback(null);
      setNote("");
      message.success("已记录，等待人工确认");
    } catch (e) {
      message.error(e.message);
    } finally {
      setFeedbackBusy(false);
    }
  }
  if (fatal)
    return (
      <main className="startup">
        <Alert type="error" title="暂时无法连接知识服务" description={fatal} />
        <Button onClick={() => location.reload()}>重试</Button>
      </main>
    );
  if (!boot)
    return (
      <main className="startup">
        <Spin tip="正在读取知识版本" />
      </main>
    );
  const categories = [...new Set(boot.cards.map((c) => c.category))];
  const filtered = boot.cards.filter(
    (c) =>
      (category === "all" || c.category === category) &&
      `${c.id} ${c.title} ${c.category}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const nav = (
    <>
      <div className="brand">
        <span className="brandmark">值</span>
        <div>
          <strong>设计知识助手</strong>
          <small>什么值得买 · UED</small>
        </div>
        <Button
          className="mobile-close"
          type="text"
          icon={icon(X)}
          aria-label="关闭导航"
          onClick={() => setMobileNav(false)}
        />
      </div>
      <Button block icon={icon(Plus)} onClick={newChat} disabled={busy}>
        新建问答
      </Button>
      <nav aria-label="主导航">
        {[
          ["chat", "知识问答", MessageSquare],
          ["library", "卡片库", Layers3],
          ["rules", "规范档案", BookOpen],
          ["issues", "待确认", FileCheck2],
        ].map(([id, title, Icon]) => (
          <button
            key={id}
            className={view === id ? "active" : ""}
            onClick={() => {
              setView(id);
              setMobileNav(false);
            }}
          >
            {icon(Icon)}
            <span>{title}</span>
            {id === "library" && <small>{boot.metrics.cards}</small>}
            {id === "issues" && <small>{boot.issues.length}</small>}
          </button>
        ))}
      </nav>
      <div className="history-label">
        <History size={14} />
        最近问答 <small>仅本浏览器</small>
      </div>
      <div className="histories">
        {sessions.length ? (
          sessions.map((s) => (
            <div
              className={`history-row ${s.id === sessionId ? "selected" : ""}`}
              key={s.id}
            >
              <button
                disabled={busy}
                onClick={() => {
                  setTurns(s.turns);
                  setSessionId(s.id);
                  setView("chat");
                  setError("");
                  setMobileNav(false);
                }}
                title={s.title}
              >
                {s.title}
              </button>
              <Tooltip title="删除本机记录">
                <Button
                  type="text"
                  size="small"
                  disabled={busy}
                  icon={<Trash2 size={13} />}
                  aria-label={`删除记录 ${s.title}`}
                  onClick={() => {
                    setSessions((x) => x.filter((a) => a.id !== s.id));
                    if (s.id === sessionId) newChat();
                  }}
                />
              </Tooltip>
            </div>
          ))
        ) : (
          <p className="muted">暂无记录</p>
        )}
      </div>
      <footer className="nav-footer">
        <Button
          type="text"
          block
          icon={icon(Terminal)}
          onClick={() => setInstall(true)}
        >
          安装到 AI 工具
        </Button>
        <div className="version">
          知识 {boot.version}
          <br />
          卡片 {boot.cardVersion}
        </div>
      </footer>
    </>
  );
  function sourceButton(s) {
    return (
      <button
        key={s.id}
        className="source-link"
        onClick={() =>
          s.kind === "card" ? openCard(s.recordId) : setEvidence(s)
        }
      >
        <BookOpen size={14} />
        <span>
          {s.recordId} · {s.title}
        </span>
        <ChevronRight size={14} />
      </button>
    );
  }
  return (
    <div className="shell">
      <aside className="sidebar">{nav}</aside>
      <Drawer
        open={mobileNav}
        onClose={() => setMobileNav(false)}
        placement="left"
        width={280}
        closable={false}
      >
        {nav}
      </Drawer>
      <div className="workspace">
        <header className="topbar">
          <div>
            <Button
              className="mobile-menu"
              type="text"
              icon={icon(Menu)}
              aria-label="打开导航"
              onClick={() => setMobileNav(true)}
            />
            <span>设计资产</span>
            <ChevronRight size={14} />
            <strong>
              {
                {
                  chat: "知识问答",
                  library: "卡片库",
                  rules: "规范档案",
                  issues: "待确认",
                }[view]
              }
            </strong>
          </div>
          <Tag color={boot.mode === "ai" ? "green" : "gold"}>
            {boot.mode === "ai" ? "AI 已配置" : "Codex 工作流"}
          </Tag>
        </header>
        {view === "chat" ? (
          <>
            <section className="conversation">
              {!turns.length ? (
                <div className="welcome">
                  <div className="section-eyebrow">DESIGN KNOWLEDGE</div>
                  <h1>从现有设计依据开始</h1>
                  <p>查找卡片、核对差异、准备评审。</p>
                  <div className="task-options">
                    {[
                      ["查卡片", "20040 卡片有哪些记录？", Search],
                      [
                        "比差异",
                        "比较 20040 和 20041 的差异与待确认项",
                        GitCompareArrows,
                      ],
                      [
                        "做评审",
                        "为好价页面准备一份设计评审检查清单",
                        FileCheck2,
                      ],
                    ].map(([title, q, Icon]) => (
                      <button key={title} onClick={() => ask(q)}>
                        <Icon size={22} />
                        <strong>{title}</strong>
                        <span>{q}</span>
                        <ChevronRight size={16} />
                      </button>
                    ))}
                  </div>
                  <div className="section-heading">
                    <h2>卡片索引</h2>
                    <Button type="link" onClick={() => setView("library")}>
                      全部 {boot.metrics.cards} 张 <ChevronRight size={14} />
                    </Button>
                  </div>
                  <div className="featured">
                    {["20040", "20041", "22001"]
                      .map((id) => boot.cards.find((c) => c.id === id))
                      .filter(Boolean)
                      .map((c) => (
                        <article key={c.id}>
                          <Preview card={c} onClick={() => openCard(c.id)} />
                          <button
                            className="asset-caption"
                            onClick={() => openCard(c.id)}
                          >
                            <strong>{c.id}</strong>
                            <span>{c.title}</span>
                          </button>
                        </article>
                      ))}
                  </div>
                  <div className="trust-line">
                    <BookOpen size={15} />
                    <span>
                      {boot.metrics.documents} 份规范档案 ·{" "}
                      {boot.metrics.traceable} 条 Figma 可追溯关系 ·{" "}
                      {boot.metrics.humanConfirmed} 条人工确认关系
                    </span>
                  </div>
                </div>
              ) : (
                <div className="turn-list">
                  {turns.map((t) => (
                    <article className="turn" key={t.id}>
                      <Bubble placement="end" content={t.question} />
                      {t.answer && (
                        <div className="answer">
                          <div className="answer-label">
                            <span className="tiny-mark">值</span>设计知识助手
                            <Tag>
                              {t.answer.mode === "ai" ? "AI 归纳" : "检索结果"}
                            </Tag>
                          </div>
                          <h2>{t.answer.title}</h2>
                          <p>{t.answer.summary}</p>
                          <div className="findings">
                            {t.answer.findings.map((f, i) => (
                              <div key={i} className="finding">
                                <p>{f.text}</p>
                                <div>
                                  {f.citations
                                    .map((id) =>
                                      t.answer.sources.find((s) => s.id === id),
                                    )
                                    .filter(Boolean)
                                    .map(sourceButton)}
                                </div>
                              </div>
                            ))}
                          </div>
                          {t.answer.suggestions.length > 0 && (
                            <section className="answer-section">
                              <h3>工作建议</h3>
                              <ul>
                                {t.answer.suggestions.map((s, i) => (
                                  <li key={i}>{s}</li>
                                ))}
                              </ul>
                            </section>
                          )}
                          {t.answer.questions.length > 0 && (
                            <section className="questions">
                              <h3>待确认</h3>
                              <ul>
                                {t.answer.questions.map((s, i) => (
                                  <li key={i}>{s}</li>
                                ))}
                              </ul>
                            </section>
                          )}
                          <details className="evidence-list">
                            <summary>
                              查看全部 {t.answer.sources.length} 条依据
                            </summary>
                            {t.answer.sources.map(sourceButton)}
                          </details>
                          <div className="answer-footer">
                            <small>
                              {t.answer.version} · {t.answer.cardVersion}
                            </small>
                            <div>
                              <Tooltip title="复制需求与依据给 Codex">
                                <Button
                                  type="text"
                                  icon={icon(Terminal)}
                                  aria-label="复制给 Codex"
                                  onClick={() =>
                                    copy(
                                      `请使用项目级 $zdm-design-assistant 处理以下需求。先调用查询脚本核验来源和版本，再给出设计评审草稿，区分事实、建议与待确认项。若尚未安装，请先使用本知识助手提供的安装命令。\n\n${exportText(t)}`,
                                    )
                                  }
                                />
                              </Tooltip>
                              <Tooltip title="复制评审稿">
                                <Button
                                  type="text"
                                  icon={icon(Copy)}
                                  aria-label="复制评审稿"
                                  onClick={() => copy(exportText(t))}
                                />
                              </Tooltip>
                              <Tooltip title="导出 Markdown">
                                <Button
                                  type="text"
                                  icon={icon(Download)}
                                  aria-label="导出 Markdown"
                                  onClick={() =>
                                    download(
                                      `设计评审-${t.answer.id}.md`,
                                      exportText(t),
                                    )
                                  }
                                />
                              </Tooltip>
                              <Tooltip title="反馈问题">
                                <Button
                                  type="text"
                                  icon={icon(ThumbsDown)}
                                  aria-label="反馈问题"
                                  onClick={() =>
                                    setFeedback(`${t.answer.id}: ${t.question}`)
                                  }
                                />
                              </Tooltip>
                            </div>
                          </div>
                        </div>
                      )}
                    </article>
                  ))}
                  {busy && (
                    <div className="thinking">
                      <Spin size="small" />
                      <span>
                        {boot.mode === "ai"
                          ? "正在检索依据并核对回答…"
                          : "正在查询知识…"}
                      </span>
                    </div>
                  )}
                  <div ref={bottom} />
                </div>
              )}
            </section>
            <div className="composer-wrap">
              {error && (
                <Alert
                  type="warning"
                  title={error}
                  closable
                  onClose={() => setError("")}
                />
              )}
              <form
                className="composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  ask();
                }}
              >
                <Input.TextArea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="输入需求、卡片编号或规范问题…"
                  autoSize={{ minRows: 2, maxRows: 5 }}
                  maxLength={2000}
                  aria-label="设计问题"
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing
                    ) {
                      e.preventDefault();
                      ask();
                    }
                  }}
                />
                <div className="composer-actions">
                  <span>
                    {boot.mode === "ai"
                      ? "回答将附带来源与待确认项"
                      : "检索设计依据；AI 归纳由你的 Codex 完成"}
                  </span>
                  {busy ? (
                    <Tooltip title="停止">
                      <Button
                        icon={icon(Square)}
                        aria-label="停止回答"
                        onClick={() => controller.current?.abort()}
                      />
                    </Tooltip>
                  ) : (
                    <Button
                      type="primary"
                      htmlType="submit"
                      icon={icon(ArrowUp)}
                      aria-label="发送问题"
                      disabled={!input.trim()}
                    />
                  )}
                </div>
              </form>
            </div>
          </>
        ) : (
          <main className="content-page">
            {view === "library" ? (
              <>
                <div className="page-heading">
                  <div>
                    <h1>卡片库</h1>
                    <p>{boot.metrics.cards} 条原始记录 · 变体归属同一编号</p>
                  </div>
                  <Button
                    icon={icon(GitCompareArrows)}
                    disabled={selected.length !== 2}
                    onClick={compare}
                  >
                    对比 {selected.length}/2
                  </Button>
                </div>
                <div className="filters">
                  <Input
                    prefix={icon(Search)}
                    placeholder="搜索编号、名称或分类"
                    aria-label="搜索卡片"
                    allowClear
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setPage(1);
                    }}
                  />
                  <Select
                    aria-label="卡片分类"
                    value={category}
                    onChange={(v) => {
                      setCategory(v);
                      setPage(1);
                    }}
                    options={[
                      { value: "all", label: "全部分类" },
                      ...categories.map((c) => ({ value: c, label: c })),
                    ]}
                  />
                </div>
                <div className="result-count">
                  {filtered.length} 条结果
                  {selected.length > 0 && (
                    <Button
                      type="link"
                      size="small"
                      onClick={() => setSelected([])}
                    >
                      清空已选
                    </Button>
                  )}
                </div>
                <div className="card-grid">
                  {filtered.slice((page - 1) * 18, page * 18).map((c) => (
                    <article
                      className={
                        selected.includes(c.id) ? "asset selected" : "asset"
                      }
                      key={c.id}
                    >
                      <Preview card={c} onClick={() => openCard(c.id)} />
                      <div className="asset-info">
                        <button onClick={() => openCard(c.id)}>
                          <strong>{c.id}</strong>
                          <span>{c.title}</span>
                        </button>
                        <Checkbox
                          aria-label={`选择 ${c.id} 对比`}
                          checked={selected.includes(c.id)}
                          disabled={
                            selected.length === 2 && !selected.includes(c.id)
                          }
                          onChange={(e) =>
                            setSelected((a) =>
                              e.target.checked
                                ? [...a, c.id]
                                : a.filter((id) => id !== c.id),
                            )
                          }
                        />
                      </div>
                      <div className="asset-meta">
                        {c.category}
                        <span>待确认</span>
                      </div>
                    </article>
                  ))}
                </div>
                {!filtered.length && <Empty description="未找到卡片" />}
                <Pagination
                  current={page}
                  pageSize={18}
                  total={filtered.length}
                  showSizeChanger={false}
                  onChange={setPage}
                />
              </>
            ) : view === "rules" ? (
              <>
                <div className="page-heading">
                  <div>
                    <h1>规范档案</h1>
                    <p>
                      来源记录与工作建议分别保留，正式采用前需确认适用范围。
                    </p>
                  </div>
                </div>
                {[...new Set(boot.documents.map((d) => d.section))].map(
                  (section) => (
                    <section className="rule-band" key={section}>
                      <h2>{section}</h2>
                      {boot.documents
                        .filter((d) => d.section === section)
                        .map((d) => (
                          <button key={d.id} onClick={() => openDoc(d.id)}>
                            <span>
                              <small>{d.id}</small>
                              {d.title}
                            </span>
                            <Tag>{d.status}</Tag>
                            <ChevronRight size={16} />
                          </button>
                        ))}
                    </section>
                  ),
                )}
              </>
            ) : (
              <>
                <div className="page-heading">
                  <div>
                    <h1>待确认</h1>
                    <p>缺少证据的地方保持开放，不由 AI 自动补全。</p>
                  </div>
                </div>
                {boot.issues.map((i) => (
                  <article className="issue" key={i.id}>
                    <div>
                      <Tag>{i.priority}</Tag>
                      <small>{i.id}</small>
                      <h2>{i.title}</h2>
                      <Tag color="gold">{i.status}</Tag>
                    </div>
                    <p>{i.question}</p>
                    <dl>
                      <dt>当前处理</dt>
                      <dd>{i.interim}</dd>
                      <dt>关闭条件</dt>
                      <dd>{i.resolution}</dd>
                      <dt>责任角色</dt>
                      <dd>{i.owner}</dd>
                    </dl>
                    <Button
                      size="small"
                      icon={icon(ThumbsDown)}
                      onClick={() => setFeedback(`${i.id}: ${i.title}`)}
                    >
                      补充依据
                    </Button>
                  </article>
                ))}
              </>
            )}
          </main>
        )}
      </div>
      <Drawer
        title={
          detail ? `${detail.id} · ${detail.canonicalName || "卡片档案"}` : ""
        }
        width={620}
        open={Boolean(detail)}
        onClose={() => {
          detailSequence.current++;
          setDetail(null);
        }}
      >
        {detailBusy ? (
          <Spin />
        ) : detailError ? (
          <Alert type="error" title={detailError} />
        ) : (
          detail?.canonicalName && (
            <>
              <Preview
                card={detail}
                onClick={() =>
                  window.open(detail.previewUrl, "_blank", "noopener")
                }
              />
              <div className="detail-tags">
                <Tag>待人工确认</Tag>
                <Tag>{detail.category}</Tag>
                <a href={detail.figmaUrl} target="_blank" rel="noreferrer">
                  Figma 原始节点 <ExternalLink size={13} />
                </a>
              </div>
              <h3>来源备注</h3>
              {detail.annotationRecords.length ? (
                detail.annotationRecords.map((a, i) => (
                  <p className="annotation" key={i}>
                    {a.text}
                  </p>
                ))
              ) : (
                <p className="muted">暂无旁注记录</p>
              )}
              <h3>用途与变体</h3>
              <p>
                {detail.businessContext?.purpose ||
                  "业务用途待确认，不根据画面推断。"}
              </p>
              <p>
                变体扫描：{detail.variantInventoryStatus}；已记录{" "}
                {detail.variants.length} 个变体。
              </p>
              {detail.documents.map(sourceButton)}
              <h3>页面关联 · {detail.usages.length}</h3>
              {detail.usages.map((u) => (
                <div className="usage" key={u.id}>
                  <strong>{u.page?.name || u.pageId}</strong>
                  <Tag
                    color={
                      u.humanReview?.status === "approved"
                        ? "green"
                        : u.evidenceLevel === "figma-traceable"
                          ? "blue"
                          : "gold"
                    }
                  >
                    {u.humanReview?.status === "approved"
                      ? "人工确认"
                      : u.evidenceLevel === "figma-traceable"
                        ? "Figma 可追溯"
                        : "推断，待确认"}
                  </Tag>
                  <p>{u.evidenceSummary}</p>
                  {u.page?.figmaUrl && (
                    <a href={u.page.figmaUrl} target="_blank" rel="noreferrer">
                      查看页面来源
                    </a>
                  )}
                </div>
              ))}
              <small>
                知识 {detail.knowledgeVersion} · 卡片 {detail.cardVersion}
              </small>
              <div className="detail-actions">
                <Button
                  onClick={() => {
                    setDetail(null);
                    ask(`查看 ${detail.id} 的设计记录和待确认问题`);
                  }}
                >
                  继续问这张卡片
                </Button>
                <Button onClick={() => setFeedback(`card:${detail.id}`)}>
                  反馈问题
                </Button>
              </div>
            </>
          )
        )}
      </Drawer>
      <Drawer
        title={evidence?.title || "来源档案"}
        width={650}
        open={Boolean(evidence)}
        onClose={() => setEvidence(null)}
      >
        {evidence && (
          <>
            <div className="detail-tags">
              <Tag>{evidence.status}</Tag>
              <span>{evidence.version}</span>
            </div>
            {evidence.html ? (
              <div
                className="document-rendered"
                dangerouslySetInnerHTML={{ __html: evidence.html }}
              />
            ) : (
              <pre className="document-body">{evidence.body}</pre>
            )}
            <h3>原始来源</h3>
            {evidence.sourceRecords?.map((s) => (
              <section className="usage" key={s.id}>
                <strong>{s.name}</strong>
                <p>{s.scope}</p>
                <p>{s.limitation}</p>
                {s.url && (
                  <a href={s.url} target="_blank" rel="noreferrer">
                    打开来源 <ExternalLink size={12} />
                  </a>
                )}
              </section>
            ))}
            <p className="muted">{evidence.path}</p>
          </>
        )}
      </Drawer>
      <Modal
        title="卡片差异核对"
        open={comparing}
        onCancel={() => setComparing(false)}
        width={1050}
        footer={
          <Button
            type="primary"
            onClick={() => {
              setComparing(false);
              ask(`比较 ${selected.join(" 和 ")} 的差异与待确认项`);
            }}
          >
            基于来源继续比较
          </Button>
        }
      >
        {compareData.length ? (
          <>
            <Alert
              type="info"
              title="以下为原始记录对照；未记录的差异不代表不存在。"
            />
            <div className="comparison">
              {compareData.map((c) => (
                <section key={c.id}>
                  <h2>
                    {c.id} · {c.canonicalName}
                  </h2>
                  <Preview card={c} onClick={() => openCard(c.id)} />
                  <a href={c.figmaUrl} target="_blank" rel="noreferrer">
                    Figma 来源
                  </a>
                </section>
              ))}
            </div>
            {[
              [
                "业务用途",
                (c) => <p>{c.businessContext?.purpose || "待确认"}</p>,
              ],
              [
                "差异说明",
                (c) => <p>{c.differenceNotes || "没有已确认的差异说明"}</p>,
              ],
              [
                "配置属性",
                (c) => (
                  <p>
                    {c.variantPropertyDefinitions
                      .map((p) => p.name)
                      .join("、") || "尚未记录"}
                    <br />
                    <small>配置属性不代表可任意组合。</small>
                  </p>
                ),
              ],
              [
                "变体记录",
                (c) => (
                  <p>
                    {{
                      partial: "部分扫描",
                      "not-scanned": "尚未扫描",
                      complete: "已扫描",
                    }[c.variantInventoryStatus] ||
                      c.variantInventoryStatus}{" "}
                    · {c.variants.length} 条记录
                  </p>
                ),
              ],
              [
                "原始备注",
                (c) => (
                  <details>
                    <summary>{c.annotationRecords.length} 条备注</summary>
                    {c.annotationRecords.map((a, i) => (
                      <p key={i}>{a.text}</p>
                    ))}
                  </details>
                ),
              ],
            ].map(([label, render]) => (
              <section className="compare-row" key={label}>
                <h3>{label}</h3>
                <div className="comparison">
                  {compareData.map((c) => (
                    <div key={c.id}>{render(c)}</div>
                  ))}
                </div>
              </section>
            ))}
          </>
        ) : (
          <Spin />
        )}
      </Modal>
      <Modal
        title="安装到 AI 工具"
        open={install}
        onCancel={() => setInstall(false)}
        footer={null}
      >
        <p>项目级安装 · 使用宿主 AI 工具的模型 · 知识可离线查询</p>
        <Alert type="info" title="需要 Node.js 22.13 或更新版本" />
        <ol className="install-steps">
          <li>在 Codex 中打开目标项目</li>
          <li>在项目终端运行下方命令</li>
          <li>重新打开 AI 会话，调用 zdm-design-assistant</li>
        </ol>
        {boot.installerPackageUrl || boot.installUrl ? (
          <Button
            href={boot.installerPackageUrl || boot.installUrl}
            icon={icon(Download)}
          >
            下载完整安装包
          </Button>
        ) : (
          <Tag>安装包尚未构建</Tag>
        )}
        <pre className="command">
          {`npx --yes ${boot.installerPackageUrl || "/绝对路径/zdm-design-assistant.tgz"} install --host codex`}
        </pre>
        <p>
          安装目标：当前项目的
          .agents/skills/。安装器不会改写项目原有规则；遇到已修改的安装内容会停止并提示。
        </p>
        <Button
          onClick={() =>
            copy(
              `npx --yes ${boot.installerPackageUrl || "/绝对路径/zdm-design-assistant.tgz"} install --host codex`,
            )
          }
          icon={icon(Copy)}
        >
          复制安装命令
        </Button>
      </Modal>
      <Modal
        title="反馈与补充依据"
        open={Boolean(feedback)}
        onCancel={() => {
          setFeedback(null);
          setNote("");
        }}
        onOk={saveFeedback}
        confirmLoading={feedbackBusy}
        okButtonProps={{ disabled: !note.trim() }}
        okText="提交反馈"
        cancelText="取消"
      >
        <p className="muted">{feedback}</p>
        <Input.TextArea
          aria-label="问题说明"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={5}
          maxLength={2000}
          showCount
          placeholder="哪里有问题？有哪些可核对的依据？"
        />
        <p className="muted">
          反馈等待人工处理，不会自动更改规范。请勿填写密钥或个人敏感信息。
        </p>
      </Modal>
    </div>
  );
}
createRoot(document.getElementById("root")).render(
  <ConfigProvider
    theme={{
      token: {
        colorPrimary: "#d92d36",
        borderRadius: 6,
        fontFamily:
          'Inter, -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif',
        colorText: "#242629",
        colorBgLayout: "#f7f8fa",
      },
    }}
  >
    <AntApp>
      <Assistant />
    </AntApp>
  </ConfigProvider>,
);
