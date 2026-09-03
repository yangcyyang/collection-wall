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
4. 空 `items` 时展示空状态，站点仍能构建。

## Schema（`data/xianyu/demands.json`）
```
source / title / updated_at / count / summary / items[]
summary: top_demands[] / price_bands[] / gaps[]
item: id, title, kind, score, confidence, status, price, category,
      tags[], summary, why_it_matters, url, first_detected, last_updated
```

- `kind`: `want|service|account|course|goods|other`
- `confidence`: `high|medium|low`（页面显示 高/中/低）
- `status`: `emerging|hot|stable|cooling`（页面显示 新兴/热门/稳定/降温）
- `count` 以 `items.length` 为准，写入时请同步。
- `updated_at` / `first_detected` / `last_updated` 用 ISO8601 `+08:00`。
- `url` 指向闲鱼商品/求购页，例如 `https://www.goofish.com/...`。

## 怎么填数据
1. 编辑 `data/xianyu/demands.json`，往 `items` 追加对象，`id` 用稳定 slug。
2. 按需填写 `summary.top_demands` / `price_bands` / `gaps`（字符串数组，可空）。
3. 把顶层 `count` 改成 `items.length`，刷新 `updated_at`。
4. 本地 `pnpm --dir site build` 后打开 `/xianyu/` 检查卡片和弹层。
5. 不要把条目写进 `.astro`；JSON 是唯一真源。

## Acceptance Criteria
- [x] AC-1：SiteNav 出现「闲鱼」，`/xianyu/` 可构建。
- [x] AC-2：JSON 在 `data/xianyu/`，空 items 显示空状态。
- [x] AC-3：详情用弹层，不生成 `/xianyu/{id}/`。
- [x] AC-4：未登录访问 `/xianyu/` 与雷达一样跳登录。
- [x] AC-5：不改 sticker-shop 或其他无关 Tab。
