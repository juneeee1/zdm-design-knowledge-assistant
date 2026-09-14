import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { randomUUID, timingSafeEqual, createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { root } from "../scripts/knowledge.mjs";
import { createKnowledge, retrievalAnswer } from "./retrieval.mjs";
import { answerWithModel, modelReady } from "./model.mjs";
import { localStore, blobStore } from './store.mjs';

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".tgz": "application/gzip",
};
const hash = (value) => createHash("sha256").update(value).digest();
export function createApp({
  env = process.env,
  dataDir = path.resolve(root, env.DATA_DIR || ".runtime"),
} = {}) {
  const knowledge = createKnowledge();
  const store = env.VERCEL ? blobStore() : localStore(dataDir);
  const limits = new Map();
  let active = 0;
  const dailyLimit = Math.max(0, Number(env.AI_DAILY_REQUEST_LIMIT || 100));
  const concurrency = Math.max(1, Number(env.AI_CONCURRENCY || 2));
  function rate(key) {
    const now = Date.now();
    for (const [k, v] of limits) if (v.until < now) limits.delete(k);
    const value = limits.get(key) || { until: now + 60000, count: 0 };
    limits.set(key, value);
    return ++value.count <= 30;
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
    );
    const json = (status, value) => {
      if (res.destroyed) return;
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(value));
    };
    try {
      const url = new URL(req.url, "http://localhost");
      if (env.DEMO_DISABLED === 'true') return json(503, {error:'本次演示已结束'});
      if (url.pathname === "/healthz") return json(200, { ok: true });
      if (
        env.DEMO_PASSWORD &&
        !timingSafeEqual(
          hash(req.headers.authorization || ""),
          hash(
            `Basic ${Buffer.from(`demo:${env.DEMO_PASSWORD}`).toString("base64")}`,
          ),
        )
      ) {
        res.setHeader(
          "WWW-Authenticate",
          'Basic realm="ZDM Design Assistant", charset="UTF-8"',
        );
        return json(401, { error: "请使用演示账号登录" });
      }
      if (url.pathname.startsWith("/api/")) {
        if (!rate(req.socket.remoteAddress || "unknown"))
          return json(429, { error: "请求过于频繁，请稍后重试" });
        if (req.method === "GET" && url.pathname === "/api/bootstrap")
          return json(200, {
            version: knowledge.data.version,
            cardVersion: knowledge.data.cardVersion,
            metrics: knowledge.data.metrics,
            mode: modelReady(env) ? "ai" : "retrieval",
            cards: knowledge.data.catalog.cards.map((c) => ({
              id: c.id,
              title: c.canonicalName,
              category: c.category,
              previewUrl: c.previewPath ? `/card-assets/${c.id}.png` : null,
            })),
            issues: knowledge.data.issues,
            documents: knowledge.data.documents.map((d) => ({
              id: d.id,
              title: d.name,
              section: d.section,
              status: d.status,
            })),
            installUrl: fs.existsSync(
              path.join(root, "release/zdm-design-assistant.tgz"),
            )
              ? "/downloads/zdm-design-assistant.tgz"
              : null,
          });
        if (req.method === "GET" && url.pathname === "/api/search")
          return json(200, {
            sources: knowledge.query(
              (url.searchParams.get("q") || "").slice(0, 2000),
              30,
            ),
          });
        if (
          req.method === "GET" &&
          /^\/api\/cards\/\d{5}$/.test(url.pathname)
        ) {
          const card = knowledge.card(url.pathname.split("/").pop());
          return json(card ? 200 : 404, card || { error: "没有这个卡片编号" });
        }
        if (req.method === "GET" && url.pathname === "/api/document") {
          const entry = knowledge.entries.find(
            (e) =>
              e.kind === "knowledge" && e.id === url.searchParams.get("id"),
          );
          return json(
            entry ? 200 : 404,
            entry ? knowledge.evidence(entry) : { error: "没有这份档案" },
          );
        }
        if (req.method !== "POST") return json(404, { error: "接口不存在" });
        const origin = req.headers.origin;
        const expected = env.PUBLIC_ORIGIN || `http://${req.headers.host}`;
        if (origin && origin !== expected)
          return json(403, { error: "来源不允许" });
        if (!String(req.headers["content-type"]).startsWith("application/json"))
          return json(415, { error: "仅支持 JSON" });
        let body;
        try {
          if (req.body !== undefined) body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
          else {
            let raw = '';
            for await (const chunk of req) { raw += chunk; if(Buffer.byteLength(raw)>24000) return json(413,{error:'输入过长'}); }
            body = JSON.parse(raw);
          }
          if (!body || typeof body !== 'object' || Buffer.byteLength(JSON.stringify(body))>24000) return json(400,{error:'输入格式或长度无效'});
        } catch {
          return json(400, { error: "输入格式无效" });
        }
        if (url.pathname === "/api/feedback") {
          if (
            typeof body.note !== "string" ||
            !body.note.trim() ||
            body.note.length > 2000 ||
            typeof body.record !== "string" ||
            body.record.length > 4000
          )
            return json(400, { error: "请填写不超过 2000 字的问题说明" });
          const id = randomUUID();
          await store.feedback({id,created:new Date().toISOString(),version:knowledge.data.version,record:body.record,note:body.note.trim()});
          return json(201, { id });
        }
        if (url.pathname !== "/api/ask")
          return json(404, { error: "接口不存在" });
        if (
          typeof body.question !== "string" ||
          !body.question.trim() ||
          body.question.length > 2000
        )
          return json(400, { error: "请输入 1 至 2000 字的问题" });
        const history = Array.isArray(body.history)
          ? body.history
              .filter((x) => typeof x === "string")
              .slice(-3)
              .map((x) => x.slice(0, 2000))
          : [];
        let sources = knowledge.query(body.question, 8);
        if (
          history.length &&
          /它|这两|上面|继续|这些|对比|评审/.test(body.question)
        ) {
          const extra = knowledge.query(history.at(-1), 8);
          sources = [
            ...new Map([...sources, ...extra].map((s) => [s.id, s])).values(),
          ].slice(0, 12);
        }
        const fallback = retrievalAnswer(
          body.question,
          sources,
          knowledge.data.version,
        );
        if (!modelReady(env) || !sources.length)
          return json(200, {
            ...fallback,
            id: randomUUID(),
            cardVersion: knowledge.data.cardVersion,
          });
        const day = new Date().toISOString().slice(0, 10);
        if(active >= concurrency) return json(429,{error:'AI 正忙，请稍后重试'});
        if(!await store.reserveAI(day,dailyLimit)) return json(429,{error:'AI 试用额度已用完，仍可浏览知识库并使用自己的 Codex'});
        active++;
        const controller = new AbortController();
        res.on("close", () => controller.abort());
        try {
          const answer = await answerWithModel({
            question: body.question,
            history,
            sources,
            signal: controller.signal,
            env,
          });
          return json(200, {
            ...answer,
            mode: "ai",
            sources,
            version: knowledge.data.version,
            cardVersion: knowledge.data.cardVersion,
            id: randomUUID(),
          });
        } catch (error) {
          if (controller.signal.aborted) return;
          return json(502, {
            error:
              "模型服务未能返回有效且可追溯的回答。可重试，或使用知识库检索。",
            code: /^MODEL_/.test(error.message)
              ? error.message
              : "MODEL_UNAVAILABLE",
          });
        } finally {
          active--;
        }
      }
      if (!["GET", "HEAD"].includes(req.method))
        return json(405, { error: "不支持此请求" });
      let file;
      if (/^\/card-assets\/\d{5}\.png$/.test(url.pathname))
        file = path.join(
          root,
          "source/card-finder/assets/cards",
          path.basename(url.pathname),
        );
      else if (url.pathname === "/downloads/zdm-design-assistant.tgz")
        file = path.join(root, "release/zdm-design-assistant.tgz");
      else if (url.pathname === "/" || url.pathname === "/index.html")
        file = path.join(root, "dist/index.html");
      else if (/^\/assets\/[\w.-]+$/.test(url.pathname))
        file = path.join(root, "dist", url.pathname);
      if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile())
        return json(404, { error: "资源不存在" });
      res.writeHead(200, {
        "Content-Type": mime[path.extname(file)] || "application/octet-stream",
        "Content-Length": fs.statSync(file).size,
        "Cache-Control": "no-cache",
      });
      if (req.method === "HEAD") return res.end();
      fs.createReadStream(file).pipe(res);
    } catch(error) {
      json(error.message==='FEEDBACK_LIMIT'?429:503, { error: error.message==='FEEDBACK_LIMIT'?'本次试用反馈已满，请导出后交管理员处理':'服务暂时不可用，请稍后重试' });
    }
  });
  server.on("close", () => store.close());
  server.requestTimeout = 70000;
  return server;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  if (fs.existsSync(path.join(root, ".env")))
    process.loadEnvFile(path.join(root, ".env"));
  const host = process.env.HOST || "127.0.0.1";
  if (
    !["127.0.0.1", "localhost", "::1"].includes(host) &&
    !process.env.DEMO_PASSWORD
  )
    throw new Error(
      "External binding requires DEMO_PASSWORD and HTTPS reverse proxy",
    );
  const server = createApp();
  server.listen(Number(process.env.PORT || 4317), host, () =>
    console.log(
      `ZDM assistant: http://${host}:${server.address().port} (${modelReady() ? "ai" : "retrieval"})`,
    ),
  );
}
