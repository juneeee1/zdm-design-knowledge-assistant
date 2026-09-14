import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { createKnowledge, validateAnswer } from "../server/retrieval.mjs";
import { createApp } from "../server/index.mjs";
import { answerWithModel } from "../server/model.mjs";
import http from "node:http";

test("query finds exact card IDs, Chinese topics and preserves uncertainty", () => {
  const k = createKnowledge();
  const found = k.query("比较 20040 和 20041 的差异与待确认项");
  assert.ok(found.some((s) => s.recordId === "20040"));
  assert.ok(found.some((s) => s.recordId === "20041"));
  assert.ok(found.filter(s=>s.kind==='card').every(s=>['20040','20041'].includes(s.recordId)));
  assert.ok(k.query("字体与颜色规范").length);
  assert.equal(k.query("xyz-nonexistent-abc").length, 0);
  assert.equal(k.data.metrics.cards, 261);
  assert.equal(k.data.metrics.humanConfirmed, 0);
  assert.equal(k.card("99999"), null);
  assert.ok(k.card("20040").previewUrl);
  assert.ok(k.query('比较 2200104 和 2200105').some(s=>s.recordId==='2200104'));
});
test("model output rejects fabricated citations and malformed result types", () => {
  const source = { id: "card:20040" };
  const answer = {
    title: "test",
    summary: "summary",
    findings: [{ text: "test", citations: ["card:20040"] }],
    suggestions: [],
    questions: [],
  };
  assert.ok(validateAnswer(answer, [source]));
  assert.throws(() =>
    validateAnswer(
      { ...answer, findings: [{ text: "test", citations: ["card:99999"] }] },
      [source],
    ),
  );
  assert.throws(() =>
    validateAnswer({ ...answer, findings: [{ text: "test", citations: [] }] }, [
      source,
    ]),
  );
  assert.throws(() =>
    validateAnswer({ ...answer, suggestions: [{}] }, [source]),
  );
});
test("API serves complete catalog, handles query, validates input and persists feedback", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zdm-api-"));
  const server = createApp({ env: { AI_ENABLED: "false" }, dataDir: dir });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async (p) => fetch(base + p);
  const post = (p, body, headers = {}) =>
    fetch(base + p, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  const boot = await (await get("/api/bootstrap")).json();
  assert.equal(boot.cards.length, 261);
  assert.equal(boot.mode, "retrieval");
  const answer = await (await post("/api/ask", { question: "20040" })).json();
  assert.equal(answer.mode, "retrieval");
  assert.ok(answer.sources.some((s) => s.recordId === "20040"));
  assert.equal((await post("/api/ask", { question: "" })).status, 400);
  assert.equal(
    (
      await post(
        "/api/ask",
        { question: "20040" },
        { Origin: "https://evil.example" },
      )
    ).status,
    403,
  );
  assert.equal((await get("/.env")).status, 404);
  assert.equal((await get("/server/index.mjs")).status, 404);
  assert.equal((await get("/api/cards/99999")).status, 404);
  const image = await get("/card-assets/20040.png");
  assert.equal(image.status, 200);
  assert.ok(Number(image.headers.get("content-length")) > 1000);
  for(const id of ['2200104','330131','3900101']) {
    assert.equal((await get(`/api/cards/${id}`)).status,200);
    assert.equal((await get(`/card-assets/${id}.png`)).status,200);
  }
  const feedback = await post("/api/feedback", {
    record: "card:20040",
    note: "test feedback",
  });
  assert.equal(feedback.status, 201);
  assert.ok((await feedback.json()).id);
  assert.ok(fs.existsSync(path.join(dir, "assistant.sqlite")));
});
test("demo password guards knowledge, assets and downloads", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zdm-auth-"));
  const server = createApp({
    env: { DEMO_PASSWORD: "test-pass" },
    dataDir: dir,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise((r) => server.close(r));
    fs.rmSync(dir, { recursive: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const p of [
    "/api/bootstrap",
    "/card-assets/20040.png",
    "/downloads/zdm-design-assistant.tgz",
  ])
    assert.equal((await fetch(base + p)).status, 401);
  assert.equal(
    (
      await fetch(base + "/api/bootstrap", {
        headers: {
          Authorization: `Basic ${Buffer.from("demo:test-pass").toString("base64")}`,
        },
      })
    ).status,
    200,
  );
});
test("model adapter makes real HTTP request and validates provider JSON (local fixture, not live AI)", async (t) => {
  let received;
  const fixture = http.createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    received = {
      path: req.url,
      body: JSON.parse(raw),
      auth: req.headers.authorization,
    };
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: "fixture",
                summary: "test",
                findings: [
                  { text: "source-backed", citations: ["card:20040"] },
                ],
                suggestions: [],
                questions: [],
              }),
            },
          },
        ],
      }),
    );
  });
  fixture.listen(0, "127.0.0.1");
  await once(fixture, "listening");
  t.after(() => new Promise((r) => fixture.close(r)));
  const result = await answerWithModel({
    question: "20040",
    history: [],
    sources: [{ id: "card:20040", body: "test" }],
    signal: new AbortController().signal,
    env: {
      MODEL_BASE_URL: `http://127.0.0.1:${fixture.address().port}/v1`,
      MODEL_NAME: "fixture",
      MODEL_API_KEY: "test",
    },
  });
  assert.equal(result.title, "fixture");
  assert.equal(received.path, "/v1/chat/completions");
  assert.equal(received.auth, "Bearer test");
  assert.equal(received.body.messages.length, 2);
});
