# Handoff 草案：code Bot — 「nvpusa」Tab

> 数据已验收、目录就绪。**由主 bot 交接 code Bot**；本文仅任务说明。  
> 勿改 `PUBLIC_EXACT`；勿由数据 agent 推 git。

## 目标

- 导航文案：**nvpusa**
- 路由：`/nvpusa/` → `site/src/pages/nvpusa.astro`
- 复用墙登录（路径保持私有）

## 数据（已就绪，勿重复拷）

```text
data/nvpusa/
  archive.json            # 原始 493
  archive.local.json      # 页面请读此文件
  avatars/                # 493
  covers/                 # 445
  missing-covers.txt      # 5（源站不可得）
  README.md
docs/nvpusa/
  FIELDS.md
  ACCEPTANCE.md
  DATA_ACCEPTANCE.md
  HANDOFF_CODE_BOT.md
```

## 建议改动（按墙惯例）

| 文件 | 动作 |
|------|------|
| `site/src/pages/nvpusa.astro` | 新建（参考 `skills.astro` / `xianyu.astro`） |
| `site/src/components/SiteNav.astro` | `current` 联合类型加 `"nvpusa"`；items 加 `{ id: "nvpusa", href: "/nvpusa/", label: "nvpusa" }` |
| `site/src/lib/nvpusa.mjs` | `getArchive()` 读 `../data/nvpusa/archive.local.json` |
| `scripts/sync-site-covers.mjs` | 同步 avatars/covers → `site/public/nvpusa/...` |
| `functions/auth.js` | **不要**把 `/nvpusa` 加入 `PUBLIC_EXACT` |

```js
await syncCovers(join(repoRoot, "data/nvpusa/avatars"), join(repoRoot, "site/public/nvpusa/avatars"));
await syncCovers(join(repoRoot, "data/nvpusa/covers"), join(repoRoot, "site/public/nvpusa/covers"));
```

## UI 最低要求

列表卡片、搜索、筛选（all/hot/verified/top/100k/recent/lost）、排序、随机一条、外链 X；5 条 HTTPS / 43 条空封面要有 fallback。

## 验证

`pnpm build` 后确认 `site/public/nvpusa/`；按 `ACCEPTANCE.md` 勾选；看 CF Pages 构建。
