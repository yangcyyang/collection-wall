---
feature_ids: [F008]
related_features: [F001, F007]
topics: [xiaohongshu, radar, site]
doc_kind: spec
created: 2026-09-03
---

# F008 点亮「小红书」Tab

> Status: in-progress | Owner: Cloud Agent
> 数据来源：`data/xiaohongshu/radar.json` 为最新报告真源。页面构建时读取，不硬编码 HTML。

## Why
收藏墙已有雷达（前沿信号）和闲鱼（交易需求），缺一块小红书 AI 用户雷达入口。先把 Tab / 契约 / 分区空状态立住，研究 bot 后续往 JSON 填每日报告。

## What
1. 导航新增 **小红书**，路由 `/xiaohongshu/`。
2. 登录门禁与雷达/闲鱼/收藏墙一致；资讯、推特仍公开。
3. UI 对齐雷达：页头、分区卡片、弹层详情（不另开 `/xiaohongshu/{id}/`）。
4. 热门与趋势分区视觉分离；各分区有空状态；全空时整页空状态。
5. 空 `sections` 时站点仍能构建。

## Schema（`data/xiaohongshu/radar.json`）
```
source / title / date / updated_at / count / summary / sections / awareness
summary: today_judgement[] / top_signals[]
sections: hot / trends / needs / pains / scenarios / products /
          content_opps / product_opps / biz_opps / quotes
awareness: dominant_level / fastest_growing / note
item: id, title, summary, why?, audience?, direction?, price?,
      tags?[], signal_strength?, evidence?[], first_detected?, last_updated?
```

- `direction`（趋势项）：`up_fast|up|flat|down|new` → 页面显示 快速上升/缓慢上升/稳定/下降/新出现
- `signal_strength`：`strong|mid|weak` → 页面显示 强/中/弱
- `awareness.dominant_level` 形如 `L2`
- `count` 以十个分区 `items.length` 之和为准，写入时请同步
- `updated_at` / `first_detected` / `last_updated` 用 ISO8601 `+08:00`
- 可选字段缺失时页面仍渲染，不崩

## 历史归档
主视图始终读 `radar.json`（最新报告）。若同目录存在 `YYYY-MM-DD.json`，页头列出最近日期，**不生成** `/xiaohongshu/2026-09-03/` 子页。研究 bot 可在写最新报告时顺带拷一份按日归档。

## 研究 bot 怎么写 `radar.json`
1. 覆盖写入 `data/xiaohongshu/radar.json`，`source` 固定 `xiaohongshu-ai-radar`，`title` 固定 `小红书 AI 用户雷达`。
2. 把当日条目按分区放进 `sections.*`，`id` 用稳定 slug（全文件唯一更好）。
3. `summary.today_judgement` / `top_signals` 用中文字符串数组；没有就 `[]`。
4. `awareness` 三字段用字符串，没有就 `""`。
5. `count` 改成十个分区长度之和，刷新 `date` 与 `updated_at`。
6. 可选：再写一份 `data/xiaohongshu/YYYY-MM-DD.json`（同结构）做归档。
7. 本地 `pnpm --dir site build` 后打开 `/xiaohongshu/` 检查分区、空状态和弹层。
8. 不要把条目写进 `.astro`；JSON 是唯一真源。条目形状示例：

```json
{
  "id": "ai-face-filter",
  "title": "AI 修图滤镜",
  "summary": "修图需求升温",
  "why": "搜索与笔记同时上涨",
  "audience": "美妆博主",
  "direction": "up_fast",
  "price": "免费试用",
  "tags": ["修图", "滤镜"],
  "signal_strength": "strong",
  "evidence": [{ "url": "https://www.xiaohongshu.com/...", "title": "笔记", "note": "评论区在问同款" }],
  "first_detected": "2026-09-01T12:00:00+08:00",
  "last_updated": "2026-09-03T21:30:00+08:00"
}
```

## Acceptance Criteria
- [x] AC-1：SiteNav 出现「小红书」，`/xiaohongshu/` 可构建。
- [x] AC-2：JSON 在 `data/xiaohongshu/`，空 sections 显示整页空状态。
- [x] AC-3：详情用弹层，不生成 `/xiaohongshu/{id}/`。
- [x] AC-4：未登录访问 `/xiaohongshu/` 与雷达一样跳登录。
- [x] AC-5：热门 / 趋势分区标题与样式分离；十个中文分区 + 今日判断 + 认知层级。
- [x] AC-6：不改 sticker-shop 或其他无关 Tab。
