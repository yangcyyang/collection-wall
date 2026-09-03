---
feature_ids: [F009]
related_features: [F001, F007, F008]
topics: [sidehustle, xiaohongshu, radar, site]
doc_kind: spec
created: 2026-09-03
---

# F009 点亮「副业」Tab

> Status: in-progress | Owner: Cloud Agent
> 数据来源：`data/sidehustle/radar.json` 为最新报告真源。页面构建时读取，不硬编码 HTML。

## Why
收藏墙已有雷达（前沿信号）、闲鱼（交易需求）、小红书（AI 用户雷达），缺一块小红书副业机会雷达入口。先把 Tab / 契约 / 分区空状态立住，研究 bot 后续往 JSON 填每日报告。

## What
1. 导航新增 **副业**，路由 `/sidehustle/`。
2. 登录门禁与雷达 / 闲鱼 / 小红书一致；资讯、推特仍公开。
3. UI 对齐小红书：页头（title + `updated_at`）、今日判断 + 关键信号、八个中文分区、卡片点开弹层（不另开 `/sidehustle/{id}/`）。
4. 「今日副业机会」与「值得验证」分区视觉分离（对齐 F008 热门 vs 趋势）；各分区有空状态；全空时整页空状态。
5. 空 `sections` 时站点仍能构建。不改 sticker-shop 或其他无关 Tab。

## Schema（`data/sidehustle/radar.json`）
```
source / title / date / updated_at / count / summary / sections
summary: today_judgement[] / top_signals[]
sections: opportunities / new_demands / pay_signals / ai_leverage /
          digital_products / services / content / to_validate
item: id, title, summary,
      why?, audience?, result?, offer?, model?, ai_help?,
      start_cost?, delivery?, competition?, index?,
      tags?[], signal_strength?, evidence?[], first_detected?, last_updated?
```

| key | 中文 |
|-----|------|
| `opportunities` | 今日副业机会 |
| `new_demands` | 新增需求 |
| `pay_signals` | 付费信号 |
| `ai_leverage` | AI 可提效的传统服务 |
| `digital_products` | 数字产品 |
| `services` | 接单服务 |
| `content` | 内容账号 |
| `to_validate` | 值得验证 |

- `source` 固定 `xiaohongshu-sidehustle`，`title` 固定 `小红书副业机会雷达`
- `model`：`service|digital|traffic` → 页面显示 卖服务 / 卖数字产品 / 做流量
- `start_cost` / `delivery` / `competition`：`low|mid|high` → 页面显示 低 / 中 / 高
- `signal_strength`：`strong|mid|weak` → 页面显示 强 / 中 / 弱
- `index`：数字 1–30，页面显示为「副业机会指数」
- `evidence`：`[{url, title, note}]`，禁止裸字符串
- `count` 以八个分区 `items.length` 之和为准，写入时请同步
- `updated_at` / `first_detected` / `last_updated` 用 ISO8601 `+08:00`
- 可选字段缺失时页面仍渲染，不崩

## 历史归档
主视图始终读 `radar.json`（最新报告）。若同目录存在 `YYYY-MM-DD.json`，页头列出最近日期，**不生成** `/sidehustle/2026-09-03/` 子页。研究 bot 可在写最新报告时顺带拷一份按日归档。

## 研究 bot 怎么写 `radar.json`
1. 覆盖写入 `data/sidehustle/radar.json`，`source` 固定 `xiaohongshu-sidehustle`，`title` 固定 `小红书副业机会雷达`。
2. 把当日条目按八个分区放进 `sections.*`，`id` 用稳定 slug（全文件唯一更好）。
3. `summary.today_judgement` / `top_signals` 用中文字符串数组；没有就 `[]`。
4. `count` 改成八个分区长度之和，刷新 `date` 与 `updated_at`。
5. 可选：再写一份同结构的 `data/sidehustle/YYYY-MM-DD.json` 做归档（页头列日期，不生成子路由）。
6. 本地 `pnpm --dir site build` 后打开 `/sidehustle/` 检查分区、空状态和弹层。
7. 不要把条目写进 `.astro`；JSON 是唯一真源。条目形状示例：

```json
{
  "id": "ai-ppt-service",
  "title": "AI 做 PPT 代做",
  "summary": "职场汇报周高峰，代做询价增多",
  "why": "搜索与私信同时上涨",
  "audience": "不会做 PPT 的职场人",
  "result": "可编辑 PPT 源文件",
  "offer": "24 小时出 20 页可改稿",
  "model": "service",
  "ai_help": "用 Skill 套模板再人工改关键页",
  "start_cost": "low",
  "delivery": "mid",
  "competition": "high",
  "index": 22,
  "tags": ["PPT", "代做"],
  "signal_strength": "strong",
  "evidence": [{ "url": "https://www.xiaohongshu.com/...", "title": "笔记", "note": "评论区在问报价" }],
  "first_detected": "2026-09-01T12:00:00+08:00",
  "last_updated": "2026-09-03T21:30:00+08:00"
}
```

## Acceptance Criteria
- [x] AC-1：SiteNav 出现「副业」，`/sidehustle/` 可构建并产出 `index.html`。
- [x] AC-2：JSON 在 `data/sidehustle/`，空 sections 显示整页空状态；分区空时该节空状态。
- [x] AC-3：详情用弹层，不生成 `/sidehustle/{id}/`。
- [x] AC-4：未登录访问 `/sidehustle/` 与小红书一样跳登录。
- [x] AC-5：八个中文分区 + 今日判断 + 关键信号；机会 / 值得验证视觉分离。
- [x] AC-6：可选字段缺失仍渲染；出现时展示 model / 成本等级 / 指数 / evidence 对象。
- [x] AC-7：不改 sticker-shop 或其他无关 Tab。不「修复」既有 radar.test.mjs 硬编码计数失败。
