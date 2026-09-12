---
feature_ids: [F010]
related_features: [F001, F007, F008, F009]
topics: [producthunt, digest, site]
doc_kind: spec
created: 2026-09-12
---

# F010 点亮「Product Hunt」Tab

> Status: in-progress | Owner: Cloud Agent
> 数据来源：`data/producthunt/digest.json` 为最新日报真源。页面构建时读取，不硬编码 HTML。

## Why
收藏墙已有雷达、闲鱼、小红书、副业，缺一块 Product Hunt 点子日报入口。先把 Tab / 契约 / 空状态立住，研究 bot 后续往 JSON 填 Top10。

## What
1. 导航新增 **Product Hunt**，路由 `/producthunt/`。
2. 登录门禁与雷达 / 闲鱼 / 小红书 / 副业一致；资讯、推特仍公开。
3. UI 对齐闲鱼 / 副业：页头、卡片网格、弹层详情（不另开 `/producthunt/{id}/`）。
4. **没有按日子路由**。可选 `YYYY-MM-DD.json` 只出现在页头日期列表，不生成 `/producthunt/2026-09-12/`。
5. `products` 为空时整页空状态；站点仍能构建。不改 sticker-shop 或其他无关 Tab。

## Schema（`data/producthunt/digest.json`）
```
source / title / date / updated_at / count / takeaways[] / recommend / products[]
product: id, rank, name, tagline, intro, votes, producthunt_url, website
```

- `source` 固定 `producthunt-digest`，`title` 固定 `Product Hunt 点子日报`
- `date` 用 `YYYY-MM-DD`；`updated_at` 用 ISO8601 `+08:00`
- `count` 以 `products.length` 为准，写入时请同步
- `takeaways` 是中文字符串数组；没有就 `[]`
- `recommend` 是字符串；没有就 `""`
- `id` 用稳定 slug
- `intro` 约 200–300 字中文
- `votes` 可以是数字或 `null`
- `producthunt_url` 指向 Product Hunt 产品页；`website` 指向产品官网，没有就 `""`
- 可选字段缺失时页面仍渲染，不崩

## 路由与空状态
- 唯一页面：`/producthunt/`，构建产物为 `producthunt/index.html`
- **不生成** `/producthunt/[date]/`、`/producthunt/{id}/`
- 主视图始终读 `digest.json`
- `products.length === 0`（或缺文件 / JSON 损坏）→ 整页空状态，即使 `takeaways` / `recommend` 有内容也不出卡片区
- 页头展示 `title` + `date` + `updated_at`；若目录里有 `YYYY-MM-DD.json`，页头列出最近日期

## 页面结构
1. 页头：栏目标题、日报 title、日期、更新时间、可选历史日期
2. 上部：`takeaways` + `recommend`
3. 下部：Top10 卡片（`rank` / `name` / `tagline` / `votes`）
4. 点击卡片打开页内弹层：`intro` + 两个外链（`producthunt_url`、`website`）

## 研究 bot 怎么写 `digest.json`
1. 覆盖写入 `data/producthunt/digest.json`，`source` / `title` 用上面的固定值。
2. 把当日 Top10 放进 `products`，`id` 用稳定 slug。
3. `takeaways` 用中文字符串数组；`recommend` 用一句话；没有就空。
4. `count` 改成 `products.length`，刷新 `date` 与 `updated_at`。
5. 可选：再写一份同结构的 `data/producthunt/YYYY-MM-DD.json` 做归档（页头列日期，不生成子路由）。
6. 本地 `pnpm --dir site build` 后打开 `/producthunt/` 检查空状态、卡片和弹层。
7. 不要把条目写进 `.astro`；JSON 是唯一真源。条目形状示例：

```json
{
  "id": "stable-slug",
  "rank": 1,
  "name": "Name",
  "tagline": "",
  "intro": "200-300字中文",
  "votes": null,
  "producthunt_url": "https://www.producthunt.com/...",
  "website": ""
}
```

## Acceptance Criteria
- [x] AC-1：SiteNav 出现「Product Hunt」，`/producthunt/` 可构建并产出 `index.html`。
- [x] AC-2：JSON 在 `data/producthunt/digest.json`，空 `products` 显示整页空状态。
- [x] AC-3：详情用弹层，不生成 `/producthunt/{id}/` 或 `/producthunt/[date]/`。
- [x] AC-4：未登录访问 `/producthunt/` 与雷达 / 小红书 / 副业一样跳登录。
- [x] AC-5：有数据时页头展示 title + date + updated_at；上部 takeaways + recommend；下部 Top10 卡片。
- [x] AC-6：弹层展示 intro 与两条外链；votes 为 null 时不崩。
- [x] AC-7：不改 sticker-shop 或其他无关 Tab。不改 DNS。
