import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { root } from "../scripts/knowledge.mjs";

test("installer supports clean install, doctor, guarded update, rollback and uninstall", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zdm-install-"));
  t.after(() => fs.rmSync(dir, { recursive: true }));
  const pkg = path.join(dir, "package"),
    project = path.join(dir, "project");
  fs.mkdirSync(project);
  fs.mkdirSync(path.join(pkg, "bin"), { recursive: true });
  fs.mkdirSync(path.join(pkg, "payload"));
  fs.copyFileSync(
    path.join(root, "packages/zdm-design-assistant/bin/install.mjs"),
    path.join(pkg, "bin/install.mjs"),
  );
  const build = (version, text) => {
    fs.writeFileSync(path.join(pkg, "payload/SKILL.md"), text);
    fs.writeFileSync(
      path.join(pkg, "payload/.zdm-install.json"),
      JSON.stringify({
        name: "zdm-design-assistant",
        version,
        knowledgeVersion: "test",
        files: {
          "SKILL.md": crypto.createHash("sha256").update(text).digest("hex"),
        },
      }),
    );
  };
  const args = (command) => [
    path.join(pkg, "bin/install.mjs"),
    command,
    "--host",
    "codex",
    "--project",
    project,
  ];
  const run = (command) =>
    execFileSync(process.execPath, args(command), { encoding: "utf8" });
  const target = path.join(project, ".agents/skills/zdm-design-assistant");
  build("1", "first");
  run("install");
  assert.equal(fs.readFileSync(path.join(target, "SKILL.md"), "utf8"), "first");
  assert.ok(JSON.parse(run("doctor")).ok);
  fs.writeFileSync(path.join(target, "custom.txt"), "user work");
  assert.notEqual(spawnSync(process.execPath, args("uninstall")).status, 0);
  assert.ok(fs.existsSync(path.join(target, "custom.txt")));
  fs.unlinkSync(path.join(target, "custom.txt"));
  build("2", "second");
  run("update");
  assert.equal(
    fs.readFileSync(path.join(target, "SKILL.md"), "utf8"),
    "second",
  );
  run("rollback");
  assert.equal(fs.readFileSync(path.join(target, "SKILL.md"), "utf8"), "first");
  run("uninstall");
  assert.ok(!fs.existsSync(target));
});
test("installer refuses symlink target", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zdm-symlink-"));
  t.after(() => fs.rmSync(dir, { recursive: true }));
  fs.mkdirSync(path.join(dir, "elsewhere"));
  fs.symlinkSync(path.join(dir, "elsewhere"), path.join(dir, ".agents"));
  const result = spawnSync(
    process.execPath,
    [
      path.join(root, "packages/zdm-design-assistant/bin/install.mjs"),
      "install",
      "--host",
      "codex",
      "--project",
      dir,
    ],
    { encoding: "utf8" },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /符号链接/);
});
