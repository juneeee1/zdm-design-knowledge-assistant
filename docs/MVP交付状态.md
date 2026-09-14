# MVP 交付状态

更新时间：2026-09-14。应用构建 0.3.0-mvp.1。知识版本与卡片证据版本分别由 governance/sources.json 和 catalog.json 维护，本轮不新增“已确认”规范。

## 最新范围

用户确认首期默认使用每个人自己的 Codex。因此网页提供真实检索、预览、对照、来源、历史、导出、反馈和“复制给 Codex”；AI 归纳、评审和生成在安装了 Skill 的 Codex 中完成。网页不假装已经连接模型，也不要求用户重复购买模型服务。

网页直接接模型的服务端适配保留为可选能力，未作真实模型验收，不是本次交付的前置条件。

## 已实现

- React / Ant Design X 工作界面：全量卡片浏览、编号与名称过滤、分类、原图、来源抽屉、双卡对照、规范全文、待确认队列。
- HTTP 查询与问答：真实知识检索、上下文补充、无证据处理。配置可选模型时要求 JSON 结构和有效引用，失败明确报错。
- 评审资料导出、复制给 Codex、本浏览器历史、反馈提交。反馈只形成待确认记录，不自动更改知识。
- 本机 SQLite；Vercel 私有 Blob 以条件写入保存反馈，避免多请求覆盖。原型限制 200 条反馈；可选网页模型最多 100 次累计调用，另有每日上限。
- 独立完整安装包：全量卡片预览与结构化资料、精炼知识、查询工具。支持项目级 install / update / doctor / rollback / uninstall。
- 访问保护、输入限长、同源检查、限流、可选模型超时和取消；保留独立关闭入口。
- GitHub 与 GitLab 持续校验配置，以及公司服务器 Docker 部署入口。

## 渠道核验

- GitLab 浏览器已登录 zhuqingyi。尝试在个人命名空间创建独立私有项目，提交返回“命名空间 is not valid”，未建成；没有修改公司现有项目。
- 按用户允许的备用方案建立 GitHub 仓库：https://github.com/juneeee1/zdm-design-knowledge-assistant 。公开范围为本知识库与 MVP，密钥和运行数据排除。
- 用户授权 Vercel 免费额度，收费时停止。已建立独立项目和私有 Blob，未升级订阅。此次为临时原型验证；正式公司生产使用需重新核对托管计划适用范围。
- 公网入口：https://zdm-design-knowledge-assistant.vercel.app 。安装包已发布至 GitHub Release，具体地址和 SHA-256 统一维护在 governance/application-release.json。

## 验证边界

完整性校验与 18 项自动化测试通过，涵盖检索/API/安装器与私有存储并发；增加 6/7 位编号详情、预览和限定编号查询的回归检查。模型适配器使用本地 HTTP 测试服务验证请求与返回格式，不是线上真实模型验收。

已通过公开 GitHub 下载地址，用真实 npx 命令安装到全新临时项目。完整性检查、安装后规范查询与双卡查询成功；安装包内包含 287 个索引条目与 6 条来源注册。宿主 AI 的自动发现/触发体验仍需用户在实际新会话中验收，首次建议显式调用 `$zdm-design-assistant`。

新 HTTP 应用已在 Chrome 进行桌面与 390×844 移动端截图检查，无横向溢出，首屏三张真实预览均加载成功。公网检索与来源可用；资料导出已实际生成 Markdown 下载文件；复制给 Codex 显示成功。

公网提交测试反馈后，独立本机进程通过私有存储读回同一记录，证明反馈不是仅存于浏览器或临时实例。管理员可用 `node scripts/export-feedback.mjs --cloud` 导出处理；本机模式不带 `--cloud`。本地云凭据文件 `.env.vercel.local` 已排除提交与部署上传。

## 本机运行

需要 Node.js 22.13 或更新的 22.x 版本。运行 `npm ci`、`npm run validate`、`npm test`、`npm run build:app`、`npm run build:installer`，然后 `npm start`，默认地址 `http://127.0.0.1:4317`。

## 可选模型与公司部署

参照 `.env.example` 在忽略提交的 `.env` 配置模型。地址应包含版本前缀，例如 `https://供应商域名/v1`；服务需兼容 Chat Completions 与 JSON 输出。不得把密钥写入前端、Git、安装包或聊天。

Docker 需要将 `/data` 挂到持久化卷、配置 `DEMO_PASSWORD`，并由 HTTPS 反向代理提供访问。默认用户为 `demo`；HTTP Basic 只能在 HTTPS 公网入口后使用。配置 `PUBLIC_ORIGIN` 为确切公网来源。

Vercel Blob 的反馈与额度是全局条件写入。请求速率和同时执行数的内存限制只对单实例有效，不宣称为全局防滥用系统。正式上线需追加网关限流、登录和审计。

本机单服务 SQLite 支持持久化；不要多副本各自使用独立 SQLite 文件后宣称有全局额度控制。

## 关闭与维护

`DEMO_DISABLED=true` 并重新部署会停止应用接口；需要全面停止访问时在 Vercel 暂停/移除部署。GitHub 转私有独立操作。公开关闭不能撤回已下载的知识包，本轮未创建定时关闭任务。

反馈先由管理员从私有存储读取，人工补入知识库。本期不包含多人审批后台。DaMo 全库变量、完整业务语义和研发实现映射继续保留为资料缺口。
