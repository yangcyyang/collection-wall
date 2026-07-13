---
feature_ids: [F001]
topics: [部署, 域名, Cloudflare Pages]
doc_kind: decision
created: 2026-07-10
---

# F001 部署域名与浏览器身份决策

| 决策 | 结论 | 拍板人 |
|---|---|---|
| Chrome 身份 | 「洋·临时」= Chrome `Profile 7`（本机 Chrome Bookmarks 配置路径，不入库），watcher 已确认自动发现并纳入监听 | cy 2026-07-10 |
| 部署域名 | `yangcyyang.cn` 下新开子域 `wall.yangcyyang.cn`，收藏墙/日报/知识总结三个 Tab 共用同一站点，不再单独开第二个子域 | cy + 宪宪 建议 2026-07-10 |
| DNS 绑定 | 未执行。Cloudflare Pages 项目创建后，需要 cy 在 Cloudflare 后台为 `wall.yangcyyang.cn` 添加 CNAME/Pages 绑定 | 待 cy 操作 |

## Cloudflare Pages 准备清单（Phase 1 建站时使用）

1. 项目名建议：`wall-yangcyyang`（Cloudflare Pages project name）
2. 生产分支：`main`。当前旧 `master` 历史含本机路径，首发前建议以审核后的
   当前快照建立干净 `main` 历史，不直接推送旧历史。
3. 构建输出目录：`site/dist`（Astro 默认）
4. 自定义域：`wall.yangcyyang.cn` — 在 Pages 项目里添加后，Cloudflare 会给出需要在 DNS 里加的 CNAME 记录，需 cy 在 `yangcyyang.cn` 的 DNS 区里确认/添加
5. 环境变量：`DEEPSEEK_API_KEY` 仅用于本地 pipeline 生成 `data/`，**不需要**在 Cloudflare Pages 侧配置（Pages 只做静态构建，不跑 AI 分析）

## 安全提醒

DeepSeek key 由 cy 在聊天里明文提供，已写入 `pipeline/.env`（`chmod 600`，`.gitignore` 已排除，未提交、未记入本文档）。建议 F001 跑通验证后去 DeepSeek 后台换发新 key，旧 key 作废。

## 上线整备状态（2026-07-12）

- [x] Astro 站点脚手架（`site/`）
- [x] watcher 成功采集后 300 秒固定批次 Git 同步（默认关闭，首次 push 后启用）
- [x] GitHub + Cloudflare Pages 操作指引：`docs/guides/F001-GitHub-Cloudflare-Pages上线指引.md`
- [ ] 铲屎官确认 653 条收藏与封面可公开
- [ ] 创建 GitHub 私有仓库并确认首次 push
- [ ] Cloudflare Pages 项目实际创建并完成首构建
- [ ] DNS CNAME 绑定（cy 操作）
