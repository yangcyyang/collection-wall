---
feature_ids: [F001]
topics: [GitHub, Cloudflare Pages, 自动同步, DNS]
doc_kind: guide
created: 2026-07-12
---

# F001 GitHub + Cloudflare Pages 上线指引

## 目标链路

```text
⌘D 收藏
  → watcher 检测新增书签
  → capture 抓取并写入 data/tools
  → 300 秒（5 分钟）固定批次合并
  → 仅提交 data/tools 并 git push
  → Cloudflare Pages 自动构建
  → wall.yangcyyang.cn 更新
```

自动同步默认关闭。只有首次人工推送完成、Git upstream 明确、Cloudflare
首构建通过后，才在本机 `pipeline/.env` 设置 `AUTO_GIT_SYNC=1`。

## 上线前必须拍板

1. **公开内容**：网站会公开展示 `data/tools/` 中约 653 条收藏、描述、标签、
   使用状态与封面截图。私有 GitHub 仓库不等于私有网站。
2. **Git 历史**：当前本地 `master` 的旧提交含本机路径。推荐首发改用干净的
   `main` 历史，只纳入审核后的当前快照；不要直接推旧历史。
3. **仓库名**：建议 `collection-wall`，GitHub 可见性必须选 **Private**。

## 第一步：创建空的 GitHub 私有仓库

1. 打开 [GitHub 新建仓库](https://github.com/new)。
2. 当前 GitHub CLI 登录账号是 `yangcyyang`，Owner 默认选择 `yangcyyang`；
   如需放到其他账号或组织，先明确授权范围。
3. Repository name 填 `collection-wall`（如需别名可在确认时修改）。
4. Description 可填“个人工具收藏墙与自动采集管线”。
5. Visibility 选择 **Private**。
6. **不要勾选** README、`.gitignore`、License，避免与本地历史分叉。
7. 点击 **Create repository**。

完成后把仓库页面地址发给执行代理。执行代理会展示首提交清单，获得明确
“确认首次推送”后才配置 remote 并 push。

## 第二步：连接 Cloudflare Pages

1. 登录 Cloudflare，进入 **Workers & Pages**。
2. 选择 **Create application → Pages → Connect to Git**。
3. 选择 GitHub；首次使用时点击 **Install & Authorize**。
4. GitHub App 的 Repository access 选 **Only select repositories**，只授权
   `collection-wall`。
5. 选中仓库后点击 **Begin setup**。
6. 在 **Set up builds and deployments** 填写：

```text
Project name: wall-yangcyyang
Production branch: main
Framework preset: Astro
Root directory: 留空（仓库根目录）
Build command: pnpm --dir site install --frozen-lockfile && pnpm run build
Build output directory: site/dist
Environment variable: NODE_VERSION=22.12.0
再增加 Production/Preview 密钥（不要写入仓库）：
WALL_USERNAME / WALL_PASSWORD / WALL_SESSION_SECRET
忘记密码（可选）：WALL_RECOVERY_EMAIL / RESEND_API_KEY / RESEND_FROM
```

仓库若保持公开，`data/` 里的 JSON 在 GitHub 上仍可读；登录门只挡网站未登录访问。

7. 点击 **Save and Deploy**。
8. 构建完成后先打开 `*.pages.dev` 地址，确认首页、搜索、分类筛选、封面与
   移动端布局正常。

Cloudflare 的 Git 集成会在生产分支每次 push 后自动构建；官方说明见
[Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/)
和 [Build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/)。

## 第三步：绑定 wall.yangcyyang.cn

1. 在 Pages 项目打开 **Custom domains**。
2. 点击 **Set up a domain**。
3. 输入 `wall.yangcyyang.cn`，点击 **Continue**。
4. 如果 `yangcyyang.cn` 已由同一 Cloudflare 账号管理，确认系统自动创建的
   CNAME 记录。
5. 等状态变为 **Active**，再打开 `https://wall.yangcyyang.cn` 验收。

必须先在 Pages 项目中添加自定义域，再处理 DNS；只手工加 CNAME 而未关联
Pages 项目可能导致 522。官方步骤见
[Custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/)。

## 第四步：开启 ⌘D 自动同步

首构建通过后，在本机 `pipeline/.env` 设置：

```dotenv
AUTO_GIT_SYNC=1
AUTO_GIT_SYNC_INTERVAL_SECONDS=300
```

安全边界：

- 只有 capture 退出码为 0 才安排同步；失败采集不发布。
- 5 分钟内多条成功采集只生成一个批次，第一条不会被持续收藏无限拖延。
- 自动提交只暂存 `data/tools/`，不会执行 `git add .`。
- 没有 upstream 时立即拒绝，不产生自动提交或网络推送。
- push 失败保留本地 commit；下一次成功采集会重试推送。
- watcher 重启后会主动安排一次补同步，不依赖内存中的旧计时器。

## 验收清单

- [ ] GitHub 仓库为 Private，首提交不含 `.env`、日志、运行态目录。
- [ ] Cloudflare 首次构建成功，输出目录为 `site/dist`。
- [ ] `*.pages.dev` 可打开，653 条数据数量与本地一致。
- [ ] `wall.yangcyyang.cn` HTTPS 可打开。
- [ ] 新增一条测试收藏后，JSON 与封面写入成功。
- [ ] 只出现一条 `data: sync captured bookmarks` 提交。
- [ ] Cloudflare 自动构建成功，线上出现新卡片。
- [ ] 自动提交没有夹带代码、日志或 `.env`。

## 暂停与回滚

- 本地暂停：将 `AUTO_GIT_SYNC=0`，重启 watcher。
- 云端暂停：Pages 项目进入 **Build → Branch control**，关闭生产分支自动部署。
- DNS 回滚：先从 Pages 的 Custom domains 移除域名，再调整 DNS 记录。
