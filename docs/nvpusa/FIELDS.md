# nvpusa archive 字段说明

文件：`data/nvpusa/archive.json`（原始）与 `archive.local.json`（页面用）。  
顶层 **JSON 数组**，**493** 条。

## 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | X 用户数字 ID |
| `screen_name` | string | handle；外链 `https://x.com/{screen_name}` |
| `name` | string | 展示昵称 |
| `avatar_url` | string | local：`/nvpusa/avatars/...`（493 全本地） |
| `cover_url` | string \| `""` | 多数 `/nvpusa/covers/...`；5 条仍 HTTPS；43 条空 |
| `followers_count` | number | 粉丝数 |
| `description` | string | 简介 |
| `verified` | 0 \| 1 | 认证 |
| `backed_up_at` | ISO8601 Z | 归档时间 |
| `is_blocked` | 0 \| 1 | 拉黑 |
| `is_suspended` | 0 \| 1 \| 2 | 1\|2 = 流失（仅 lost 筛选） |
| `clicks_card` / `clicks_timeline` / `clicks_roulette` | number | 分来源点击 |
| `total_clicks` | number | 总点击（热门排序） |
| `last_synced_at` | ISO8601 Z | 最近同步 |

## 筛选语义（对照 https://nv-pu-sa.pages.dev/）

| filter | 规则 |
|--------|------|
| all | 排除 suspended∈{1,2} |
| hot | 存活；按 total_clicks |
| verified | verified truthy |
| top | followers ≥ 500000 |
| 100k | followers ≥ 100000 |
| recent | 按 backed_up_at |
| lost | 仅 suspended∈{1,2} |

搜索：`screen_name` / `name` / `description` 子串（忽略大小写）。
