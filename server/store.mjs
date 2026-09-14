import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { get, put, BlobPreconditionFailedError } from "@vercel/blob";

export function localStore(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path.join(dataDir, "assistant.sqlite"));
  db.exec(
    "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS feedback (id TEXT PRIMARY KEY, created TEXT, version TEXT, record TEXT, note TEXT); CREATE TABLE IF NOT EXISTS usage (day TEXT PRIMARY KEY, count INTEGER NOT NULL);",
  );
  return {
    feedback(record) {
      if (db.prepare("SELECT count(*) AS n FROM feedback").get().n >= 200)
        throw new Error("FEEDBACK_LIMIT");
      db.prepare("INSERT INTO feedback VALUES (?,?,?,?,?)").run(
        record.id,
        record.created,
        record.version,
        record.record,
        record.note,
      );
    },
    reserveAI(day, limit) {
      db.prepare("INSERT OR IGNORE INTO usage VALUES (?,0)").run(day);
      return Boolean(
        db
          .prepare(
            "UPDATE usage SET count=count+1 WHERE day=? AND count<? RETURNING count",
          )
          .get(day, limit),
      );
    },
    close() {
      db.close();
    },
  };
}

// Conditional writes prevent concurrent serverless instances from losing feedback or bypassing quotas.
export function blobStore({ read = get, write = put } = {}) {
  const key = "zdm-mvp/state-v1.json";
  async function update(change) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const existing = await read(key, { access: "private", useCache: false });
      const state = existing
        ? await new Response(existing.stream).json()
        : { schema: 1, day: "", used: 0, totalAI: 0, feedback: [] };
      if (
        state.schema !== 1 ||
        !Array.isArray(state.feedback) ||
        !Number.isInteger(state.totalAI) ||
        !Number.isInteger(state.used)
      )
        throw new Error("STORE_INVALID");
      const result = change(state);
      if (result === false) return false;
      try {
        await write(key, JSON.stringify(state), {
          access: "private",
          addRandomSuffix: false,
          contentType: "application/json",
          ...(existing
            ? { ifMatch: existing.blob.etag, allowOverwrite: true }
            : { allowOverwrite: false }),
        });
        return result;
      } catch (error) {
        if (
          !(error instanceof BlobPreconditionFailedError) &&
          !/already exists/i.test(error.message)
        )
          throw error;
      }
    }
    throw new Error("STORE_BUSY");
  }
  return {
    feedback(record) {
      return update((state) => {
        if (state.feedback.length >= 200) throw new Error("FEEDBACK_LIMIT");
        state.feedback.push(record);
        return true;
      });
    },
    reserveAI(day, limit) {
      return update((state) => {
        if (state.day !== day) {
          state.day = day;
          state.used = 0;
        }
        if (state.used >= limit || state.totalAI >= 100) return false;
        state.used++;
        state.totalAI++;
        return true;
      });
    },
    close() {},
  };
}
