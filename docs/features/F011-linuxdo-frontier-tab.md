---
feature_ids: [F011]
related_features: [F001, F010]
topics: [linuxdo, frontier, site]
doc_kind: spec
created: 2026-09-21
---

# F011 点亮「linux.do」热门前沿分享 Tab

> Status: in-progress | Owner: Cloud Agent
> 数据来源：`data/linuxdo/digest.json` 为最新日报真源。页面构建时读取，不硬编码 HTML。

## Why
收藏墙已有 Product Hunt 点子日报，缺一块 linux.do 热门/分享工作台：读当日 digest，勾选后本机隐藏已看过的帖。

## What
1. 导航新增 **linux.do**，路由 `/linuxdo/`。
2. 登录门禁与 Product Hunt / 雷达一致；资讯、推特仍公开。
3. UI 对齐小红书/Product Hunt：页头、两组 `tool-section` 卡片。标题外链到 linux.do，展示赞/浏览和一行 why。
4. **没有按日子路由**。可选 `YYYY-MM-DD.json` 只出现在页头日期列表，不生成 `/linuxdo/2026-09-21/`。
5. 勾选后点「移除所选」，条目从列表消失；`localStorage` 按日期记住。`恢复已移除` 清空当日集合。不写 GitHub API。
6. `items` 为空时整页空状态；站点仍能构建。

## Schema（`data/linuxdo/digest.json`）
```
source / title / date / updated_at / count / hot[] / share[] / items[]
item: id, group, title, likes, views, why, url
```

- `source` 固定 `linuxdo-frontier`，`title` 固定 `linux.do 热门前沿分享`
- `date` 用 `YYYY-MM-DD`；`updated_at` 用 ISO8601 `+08:00`
- `count` 以 `items.length` 为准；`items` 是 `hot` + `share`
- `group` 为 `hot` 或 `share`
- `id` 是 linux.do topic id
- `url` 形如 `https://linux.do/t/topic/{id}`
- 可选字段缺失时页面仍渲染，不崩

## 移除（仅本机）
- 键名：`linuxdo-frontier-dismissed:{date}`
- 值：topic id 字符串数组
- 纯客户端过滤，不影响静态构建
- 工具条：全选 / 取消 / 移除所选 / 恢复已移除 / 已隐藏 N 条

## Acceptance Criteria
- [x] AC-1：SiteNav 出现「linux.do」，`/linuxdo/` 可构建并产出 `index.html`。
- [x] AC-2：JSON 在 `data/linuxdo/digest.json`，空 `items` 显示整页空状态。
- [x] AC-3：页面分【今日热门】与【值得看的分享】；标题链到 linux.do；展示赞/浏览/why。
- [x] AC-4：未登录访问 `/linuxdo/` 与 Product Hunt 一样跳登录。
- [x] AC-5：勾选若干卡片后点「移除所选」，条目消失；刷新后仍隐藏。
- [x] AC-6：「恢复已移除」清空当日 dismissed，条目重新出现。
- [x] AC-7：不改其他无关 Tab。不写 GitHub API。
