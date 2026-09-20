# data/nvpusa — 女菩萨只读镜像（collection-wall 接入）

Tab 文案：**nvpusa** · slug：`/nvpusa/` · 登录保护（**不要**写入 `functions/auth.js` 的 `PUBLIC_EXACT`）。

数据已验收（2026-09-20）。详单：`docs/nvpusa/DATA_ACCEPTANCE.md`、`docs/nvpusa/FIELDS.md`、`docs/nvpusa/ACCEPTANCE.md`。  
**本目录只交付数据+文档；页面接入由主 bot 交接 code Bot。勿在此推 git。**

## 目录

| 路径 | 说明 |
|------|------|
| `archive.json` | 原始归档，**493** 条 |
| `archive.local.json` | **页面应读此文件**；本地化媒体为 `/nvpusa/...` |
| `avatars/` | **493** 张头像（全齐） |
| `covers/` | **445** 张封面 |
| `missing-covers.txt` | 源站不可得封面 **5** 条（保持 HTTPS，页面需降级） |
| `missing-avatars.txt` | 空 |
| `MEDIA_GAP_REPORT.json` | 缺口快照 |
| `README.md` | 本说明 |

## URL 映射（archive.local.json）

| 原始 | 本地 |
|------|------|
| `/api/media?key=avatars%2F{file}` | `/nvpusa/avatars/{file}` |
| `/api/media?key=covers%2F{file}` | `/nvpusa/covers/{file}` |
| 已补采的 twimg | `/nvpusa/avatars|covers/...` |
| 源站不可得封面（5） | 保持原 HTTPS |
| 空 `cover_url`（43） | 保持空 |

## 统计

| 项 | 值 |
|----|-----|
| 条数 | 493 |
| 头像文件 / 本地 URL | 493 / 493 |
| 封面文件 / 本地 URL | 445 / 445 |
| 封面仍 HTTPS | 5 |
| 封面空 | 43 |
| 目录体积 | ~24M |

## 媒体进站点（对齐 tools/skills）

```text
data/nvpusa/avatars/*  →  site/public/nvpusa/avatars/*
data/nvpusa/covers/*   →  site/public/nvpusa/covers/*
```

在 `scripts/sync-site-covers.mjs` 增加对应 `syncCovers`（见 `docs/nvpusa/HANDOFF_CODE_BOT.md`）。
