---
feature_ids: [F007]
related_features: [F001]
topics: [xianyu, goofish, site, radar]
doc_kind: spec
created: 2026-09-03
---

# F007 点亮「闲鱼」Tab

> Status: in-progress | Owner: Cloud Agent
> 数据来源：`data/xianyu/demands.json` 为唯一真源。页面构建时读取，不硬编码 HTML。

## Why
收藏墙已有雷达（前沿信号），缺一块闲鱼 AI 需求观察入口。先把 Tab / 契约 / 空状态立住，后续再往 JSON 填真实需求。

## What
1. 导航新增 **闲鱼**，路由 `/xianyu/`（不用 `/goofish/`）。
2. 登录门禁与雷达/收藏墙一致；资讯、推特仍公开。
3. UI 对齐雷达：页头、卡片网格、弹层详情（不另开 `/xianyu/{id}/`）。
4. `/xianyu/` 按 `lane` 拆成 **趋势** / **热门** 两节，视觉权重对齐雷达子区块。
5. 全站无条目时展示页级空状态；某一 lane 无条目时只空那一节。站点仍能构建。

## Schema（`data/xianyu/demands.json`）
```
source / title / updated_at / count / summary / items[]
summary: top_demands[] / price_bands[] / gaps[] / trend_highlights[] / hot_highlights[]
item: id, title, kind, score, confidence, status, lane, price, category,
      tags[], summary, why_it_matters, url, first_detected, last_updated
```

- `kind`: `want|service|account|course|goods|other`
- `confidence`: `high|medium|low`（页面显示 高/中/低）
- `status`: `emerging|hot|stable|cooling`（页面显示 新兴/热门/稳定/降温）
- `lane`: `trend|hot`（页面分区：趋势 / 热门）。写入时请显式标注，这是卡片分组的唯一真源。
- `count` 以 `items.length` 为准，写入时请同步。
- `updated_at` / `first_detected` / `last_updated` 用 ISO8601 `+08:00`。
- `url` 指向闲鱼商品/求购页，例如 `https://www.goofish.com/...`。

### 分区约定
页面只认 `item.lane`，不靠 `status` 或 `summary.top_demands` 切栏。

| lane | 中文 | 放什么 |
|------|------|--------|
| `trend` | 趋势 | 求购、缺口、正在起来的方向（`kind=want`、平台过滤/供给缺口、教程/搜索被劫持等方向信号） |
| `hot` | 热门 | 高想要数、高成交感的在售爆款（拼车 / 代充 / ¥1 引流包 / 代出图等） |

缺 `lane` 时的回退（仅兼容旧数据，新条目不要依赖）：

- `status=emerging` 或 `kind=want` → `trend`
- `status=hot` → `hot`
- 其余 → `trend`

`summary.trend_highlights` / `hot_highlights` 是对应区块的可选导语。`top_demands` / `price_bands` / `gaps` 仍留给采集侧备忘，页面不再用它们做分组。

现有 16 条的映射：

- **趋势**：`want-kaobei-prompt`、`want-ai-daizuo`（求购）；`signal-prompt-keyword-blocked`（平台过滤缺口）；`book-ai-duanju-bundle`、`book-ai-manju`、`book-ai-jichu-qinghua`、`book-ai-chuangfu`、`book-aigc-illustration`（图书/搜索方向）；`mj-prompt-fashion`（垂直提示词缺口）。
- **热门**：`mj-prompt-pack-1yuan`（引流包）；`mj-daichong-60`、`mj-daichong-78`（代充）；`mj-daioutu-9p9`（代出图）；`mj-pinch-week-15`、`mj-pinch-month-46`、`mj-daypass-4`（拼车/日卡）。

## 怎么填数据
1. 编辑 `data/xianyu/demands.json`，往 `items` 追加对象，`id` 用稳定 slug，并写上 `lane`。
2. 按需填写 `summary.trend_highlights` / `hot_highlights`；`top_demands` / `price_bands` / `gaps` 可继续给采集备忘。
3. 把顶层 `count` 改成 `items.length`，刷新 `updated_at`。
4. 本地 `pnpm --dir site build` 后打开 `/xianyu/` 检查两栏卡片和弹层。
5. 不要把条目写进 `.astro`；JSON 是唯一真源。

## Acceptance Criteria
- [x] AC-1：SiteNav 出现「闲鱼」，`/xianyu/` 可构建。
- [x] AC-2：JSON 在 `data/xianyu/`，空 items 显示空状态。
- [x] AC-3：详情用弹层，不生成 `/xianyu/{id}/`。
- [x] AC-4：未登录访问 `/xianyu/` 与雷达一样跳登录。
- [x] AC-5：不改 sticker-shop 或其他无关 Tab。
- [x] AC-6：`/xianyu/` 展示「趋势」「热门」两节；每条 item 有 `lane`；缺栏时该节空状态。
