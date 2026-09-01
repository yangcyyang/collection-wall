---
feature_ids: [F001]
topics: [Cloudflare Pages, GitHub, DNS, deployment]
doc_kind: guide
created: 2026-07-12
---

# F001 · Cloudflare Pages 接入与 `wall.yangcyyang.cn` 绑定

> 本指南需要 cy 在 GitHub 与 Cloudflare 控制台操作。不要在聊天或仓库中粘贴 token、密码或 DNS API key。

## 上线前检查

1. 私有 GitHub 仓库已创建，首推后的默认分支统一为 `main`。
2. 本机执行 `pnpm run test` 与 `pnpm run build` 均通过。
3. `pipeline/.env`、日志、运行游标均被忽略；详见 `docs/decisions/2026-07-12-first-push-security-audit.md`。

## 1. 连接 GitHub 仓库

在 Cloudflare 控制台：

1. 打开 **Workers & Pages**。
2. 选择 **Create application → Pages → Connect to Git**。
3. 按提示安装并授权 Cloudflare 的 GitHub App；只选择本项目的私有仓库。
4. 选择仓库后点击 **Begin setup**。

Cloudflare Pages 支持连接私有 GitHub 仓库；后续每次推送到生产分支都会自动构建与部署。

## 2. 填写构建设置

| 控制台字段 | 值 |
|---|---|
| Production branch | `main` |
| Build command | `pnpm --dir site install --frozen-lockfile && pnpm run build` |
| Build output directory | `site/dist` |
| Root directory | 留空（仓库根目录） |

站点读取已提交的 `data/tools/`；`pipeline/.env` 仅供本机采集，不上传到 Pages。

登录门需要在 Cloudflare Pages 项目 **Settings → Environment variables**（Production 与 Preview 都要）写入密钥，不要写进仓库。

登录必填（缺任一则锁定页失败关闭，只显示登录页；资讯与推特日报仍可未登录访问）：

| 变量 | 用途 |
|---|---|
| `WALL_USERNAME` | 共享登录用户名 |
| `WALL_PASSWORD` | 共享登录密码 |
| `WALL_SESSION_SECRET` | 签名会话 cookie 与 15 分钟登录链接的密钥（随机长字符串） |

忘记密码可选（未配置时申请链接仍显示通用成功，但不发信）：

| 变量 | 用途 |
|---|---|
| `WALL_RECOVERY_EMAIL` | 允许接收魔法登录链接的邮箱。在 Cloudflare 配置，不要写进仓库。示例：`928590029cy@gmail.com` |
| `RESEND_API_KEY` | Resend HTTP API 密钥 |
| `RESEND_FROM` | 可选。默认 `onboarding@resend.dev` 只能寄到 Resend 账号本人；用上述 Gmail 注册 Resend 后，免费测试发件人即可寄到该邮箱 |

Ask AI 可选：

| 变量 | 用途 |
|---|---|
| `GEMINI_API_KEY` | （可选）收藏墙 Ask AI 第二层用的共享 Gemini 密钥，只写在 Pages 环境变量，不要进仓库 |
| `GEMINI_MODEL` | （可选）Gemini 模型名，默认 `gemini-2.0-flash` |

缺登录密钥时，锁定页失败关闭（只显示登录页）；资讯与推特日报仍可未登录访问。建议把 Pages Functions 的 Fail open / closed 设为 **Fail closed**，避免函数额度耗尽时静态私有页被直接放出。

Ask AI 是三层检索：本地语义（免费、不消耗密钥）→ 共享 Gemini（登录后可调 `/api/ask-ai`，按访客 cookie 每天 20 次）→ 额度用尽或密钥缺失/出错时回退关键词搜索。访客也可以在设置里粘贴自己的 Gemini key（只存在浏览器 localStorage，请求时代理转发，不记日志、不计入共享额度）。不配置 `GEMINI_API_KEY` 时，自然语言询问会直接走关键词回退并提示。

构建完成后，先打开 Cloudflare 分配的 `*.pages.dev` 地址，确认收藏墙能显示卡片、封面和筛选。

## 3. 绑定自定义域名

1. 在 Pages 项目内进入 **Custom domains**。
2. 点击 **Set up a domain**，输入 `wall.yangcyyang.cn`，再点 **Continue**。
3. 若 `yangcyyang.cn` 已托管在同一个 Cloudflare 账号，按控制台提示确认，Cloudflare 会创建所需 DNS 记录。
4. 若域名 DNS 不在 Cloudflare，回到当前 DNS 提供商新增 CNAME：

| 类型 | 主机记录 | 目标 |
|---|---|---|
| CNAME | `wall` | `<你的 Pages 项目名>.pages.dev` |

必须先在 Pages 的 **Custom domains** 中完成关联，再添加 CNAME；只手工加 CNAME 而未关联项目会导致域名解析失败。

## 4. 验收与日常同步

部署成功后依次确认：

1. `https://<项目名>.pages.dev` 可打开。
2. `https://wall.yangcyyang.cn` 可打开且证书正常。
3. 新提交到生产分支后，Pages 的 Deployments 列表出现新的成功构建。

日常数据链路是：

```text
⌘D 收藏 → watcher/capture 写入 data/tools/
→ 5 分钟窗口合并自动 commit + push
→ Cloudflare Pages 自动构建
→ wall.yangcyyang.cn 更新
```

第一次推送前，watcher 保持 `AUTO_GIT_SYNC=0`；待私有仓库、upstream 与 Pages 均验收后，再将它设为 `1`。自动同步只会提交 `data/tools/`，并且必须已有人工配置好的 upstream 才会执行。

## 官方参考

- [Cloudflare Pages · Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/)
- [Cloudflare Pages · GitHub integration](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/)
- [Cloudflare Pages · Custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/)
