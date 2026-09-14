#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const [command = "help", ...args] = process.argv.slice(2);
const hosts = {
  codex: ".agents/skills",
  cursor: ".cursor/skills",
  claude: ".claude/skills",
};
const hash = (file) =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
function files(dir, prefix = "") {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name),
      r = path.posix.join(prefix, e.name);
    if (e.isSymbolicLink()) throw new Error(`不处理符号链接：${p}`);
    return e.isDirectory() ? files(p, r) : [r];
  });
}
function safeParents(dir) {
  let p = path.resolve(dir);
  while (true) {
    if (fs.existsSync(p) && fs.lstatSync(p).isSymbolicLink())
      throw new Error(`安装路径包含符号链接：${p}`);
    const parent = path.dirname(p);
    if (parent === p) break;
    p = parent;
  }
}
function manifest(dir) {
  const m = JSON.parse(
    fs.readFileSync(path.join(dir, ".zdm-install.json"), "utf8"),
  );
  if (
    m.name !== "zdm-design-assistant" ||
    !m.files ||
    typeof m.files !== "object"
  )
    throw new Error("安装清单无效");
  return m;
}
function unchanged(dir) {
  const m = manifest(dir);
  const actual = files(dir).filter((f) => f !== ".zdm-install.json");
  if (
    actual.length !== Object.keys(m.files).length ||
    actual.some((f) => !m.files[f] || hash(path.join(dir, f)) !== m.files[f])
  )
    throw new Error(
      "发现用户修改或新增文件；已停止。请先备份或手动合并，不会覆盖或删除。",
    );
  return m;
}
async function run() {
  if (
    !["install", "update", "doctor", "uninstall", "rollback"].includes(command)
  ) {
    console.log(
      "zdm-design-assistant <install|update|doctor|uninstall|rollback> --host codex|cursor|claude [--project /path]\n默认只安装到当前项目，不修改全局设置。",
    );
    return;
  }
  if (Number(process.versions.node.split(".")[0]) < 22)
    throw new Error("需要 Node.js 22.13 或更新版本");
  for (let i = 0; i < args.length; i += 2)
    if (!["--host", "--project"].includes(args[i]) || !args[i + 1])
      throw new Error("未知参数或缺少参数值");
  const option = (k) => args[args.indexOf(k) + 1];
  const requestedProject = path.resolve(
    args.includes("--project") ? option("--project") : process.cwd(),
  );
  if (
    !fs.existsSync(requestedProject) ||
    !fs.statSync(requestedProject).isDirectory()
  )
    throw new Error("目标项目目录不存在");
  const project = fs.realpathSync(requestedProject);
  let host = args.includes("--host") ? option("--host") : null;
  if (!host) {
    const detected = Object.keys(hosts).filter((h) =>
      fs.existsSync(path.join(project, hosts[h].split("/")[0])),
    );
    console.log(`检测到：${detected.join(", ") || "无项目级 AI 配置"}`);
    if (!process.stdin.isTTY)
      throw new Error("非交互模式请指定 --host codex|cursor|claude");
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    try {
      host = (await rl.question("选择工具 (codex/cursor/claude): ")).trim();
    } finally {
      rl.close();
    }
  }
  if (!hosts[host])
    throw new Error("不支持的工具；请选择 codex、cursor 或 claude");
  const target = path.join(project, hosts[host], "zdm-design-assistant");
  const backup = path.join(project, ".zdm-assistant-backups", host);
  safeParents(target);
  safeParents(backup);
  if (command === "doctor") {
    const m = unchanged(target);
    console.log(
      JSON.stringify(
        {
          ok: true,
          target,
          host,
          version: m.version,
          files: Object.keys(m.files).length,
          knowledgeVersion: m.knowledgeVersion,
        },
        null,
        2,
      ),
    );
    return;
  }
  if (command === "uninstall") {
    const m = unchanged(target);
    for (const file of Object.keys(m.files))
      fs.unlinkSync(path.join(target, file));
    fs.unlinkSync(path.join(target, ".zdm-install.json"));
    const prune = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true }))
        if (e.isDirectory()) prune(path.join(dir, e.name));
      if (!fs.readdirSync(dir).length) fs.rmdirSync(dir);
    };
    prune(target);
    console.log(`已卸载：${target}。回退备份保留在 ${backup}`);
    return;
  }
  if (command === "rollback") {
    const snapshots = fs.existsSync(backup)
      ? fs
          .readdirSync(backup)
          .filter((n) => /^\d+-/.test(n))
          .sort()
      : [];
    if (!snapshots.length) throw new Error("没有可回退版本");
    const previous = path.join(backup, snapshots.at(-1));
    unchanged(previous);
    if (fs.existsSync(target)) {
      unchanged(target);
      fs.renameSync(
        target,
        path.join(backup, `replaced-${crypto.randomUUID()}`),
      );
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.renameSync(previous, target);
    console.log(`已回退：${target}`);
    return;
  }
  const payload = path.join(packageRoot, "payload");
  if (!fs.existsSync(payload))
    throw new Error("安装包尚未构建，请先运行 npm run build:installer");
  const sourceManifest = manifest(payload);
  unchanged(payload);
  if (command === "update" && !fs.existsSync(target))
    throw new Error("尚未安装，请先运行 install");
  if (fs.existsSync(target)) {
    const old = unchanged(target);
    if (old.version === sourceManifest.version) {
      console.log(`已是此版本：${old.version}。未覆盖任何文件。`);
      return;
    }
    fs.mkdirSync(backup, { recursive: true });
    fs.renameSync(
      target,
      path.join(backup, `${Date.now()}-${crypto.randomUUID()}`),
    );
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const staging = `${target}.stage-${crypto.randomUUID()}`;
  try {
    fs.cpSync(payload, staging, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
    unchanged(staging);
    fs.renameSync(staging, target);
  } catch (e) {
    throw new Error(`安装未完成，原版本备份仍保留在 ${backup}。${e.message}`);
  }
  console.log(
    `安装完成：${target}\n知识版本：${sourceManifest.knowledgeVersion}\n重新打开 AI 会话后使用 $zdm-design-assistant。\n校验：npx <同一安装包> doctor --host ${host}`,
  );
}
run().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
