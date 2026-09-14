import { loadKnowledge, search, searchEntries } from "./knowledge.mjs";

const data = loadKnowledge();
const [command = "help", ...args] = process.argv.slice(2);
let result;
if (command === "search") {
  if (!args.join(" ").trim()) {
    result = { error: "请输入编号或关键词" }; process.exitCode = 1;
  } else result = search(searchEntries(data), args.join(" ")).map(({ body, ...entry }) => entry);
} else if (command === "get") {
  const entry = searchEntries(data).find((e) => e.id === args[0]);
  if (!entry) { result = { error: "未找到档案", id: args[0] }; process.exitCode = 1; }
  else result = entry.kind === "card" ? { ...entry, card: data.catalog.cards.find((c) => c.id === entry.id) } : entry;
} else if (command === "issues") result = data.issues.filter((i) => !args[0] || i.priority === args[0] || i.id === args[0]);
else if (command === "health") result = { knowledgeVersion: data.version, cardVersion: data.cardVersion, ...data.metrics };
else if (command === "sources") result = data.sources;
else result = { usage: ["search <关键词或编号>", "get <知识ID或卡片编号>", "issues [P0|P1|问题ID]", "health", "sources"], note: "页面关系与卡片比较继续使用 packages/zdm-card-knowledge/scripts/query-card.mjs" };
console.log(JSON.stringify(result, null, 2));
