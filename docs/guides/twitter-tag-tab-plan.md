---
feature_ids: [twitter-tag-tab]
topics: [twitter日报, 前端, 标签分类, 分页]
doc_kind: guide
created: 2026-07-20
---

# 推特日报 · 标签分类 Tab + 分页 落地规格

## 背景
`wall.yangcyyang.cn/twitter/` 顶部把全部 256 个标签按频次平铺成一屏「标签墙」，
高频主标签和大量「只出现 1 次」的长尾标签混在一起，找方向困难。
本次改造：**加一层「类别 Tab」收纳标签 + 内容分页**。数据侧类别对照表已备好，本任务只做前端接入与渲染。

## 已备好的数据（直接用，不用自己归类）
`pipeline/tag_categories.json`（与 `pipeline/tag_aliases.json` 并列）：

```json
{
  "order": ["vendor","product","topic","engineering","industry","research","other"],
  "labels": { "vendor":"厂商公司", "product":"模型产品", "topic":"主题方向",
              "engineering":"工程能力", "industry":"产业观察",
              "research":"评测研究", "other":"其他" },
  "map": { "OpenAI":"vendor", "Codex":"product", "Agent":"topic", ... 共 256 条 ... }
}
```

- `order`：类别 Tab 的展示顺序（前面再加一个「全部」）。
- `labels`：类别 key → 中文名。
- `map`：**规范化后**的标签 → 类别 key。
- **兜底契约**：`map` 里查不到的标签（未来新采的新标签）一律归 `other`（其他），页面不得崩、不得漏标签。

## 前端改造点（`site/src/pages/twitter.astro` + `site/src/lib/twitter.ts`）

1. **加载对照表**：在 `lib/twitter.ts` 里读 `pipeline/tag_categories.json`，导出 `getTagCategories()`；
   给 `tagCounts()` 的每一项补 `category` 字段（查 `map`，缺省 `other`）。别名规范化沿用现有 `normalizeTags`。

2. **类别 Tab 行**（标签区上方新增一排）：`全部 + order 里非空的类别`。
   某类别下若 0 个标签则不显示该 Tab。默认选中「全部」。

3. **每类标签精选 + 折叠**：选中某类别后，只显示该类标签，按频次降序；
   默认亮前 N 个（建议 N=20），其余收进「更多 ▾」，点开展开。避免长尾再糊屏。

4. **内容分页**（客户端 JS，与现有过滤同一套，**不要用 Astro 构建期分页**——过滤是动态的）：
   - 默认（全部 / 未选具体标签）：保留现有「按天分组 + 更早归档折叠」，体验不动。
   - 选中某标签过滤后：结果跨多天且稀疏，改为**按条分页**，每页 30 条，底部「上一页 / 下一页 + 页码」。

5. **交互 script 扩展**（现有 `twitter.astro` 底部 `<script>`）：
   - 类别 Tab 单选：切换时刷新「可见标签集」并重置具体标签过滤为空。
   - 具体标签单选过滤：复用现有 `data-tag-filter` / `data-tags` 逻辑。
   - 分页仅作用于「当前过滤结果」；切类别 / 切标签时回到第 1 页。

## 交互规则速查
| 操作 | 结果 |
|---|---|
| 点类别 Tab | 只显示该类标签；内容回到默认天分组视图；标签过滤清空 |
| 点具体标签 | 过滤出含该标签的推文，按条分页（每页 30） |
| 再点同一标签 | 取消过滤，回默认视图 |
| 未归类新标签 | 自动进「其他」Tab，不报错 |

## 验收标准（Done 要有证据）
- [ ] 页面顶部**不再一屏标签墙**：默认只见类别 Tab 行 + 「全部」下的高频标签。
- [ ] 7 个类别 Tab（+全部）可切，每类只显示本类标签，「更多」可展开长尾。
- [ ] 选中标签后内容按条分页可翻页，切换过滤回第 1 页。
- [ ] 手工塞一个 `map` 里没有的假标签，验证它出现在「其他」Tab 且不报错。
- [ ] `pnpm build` 通过；`wall.yangcyyang.cn/twitter/` 线上验证；附截图。

## 不动的东西
- 采集主流程 `pipeline/twitter_daily_collect.py`、`data/twitter/*.json`。
- 单条推文卡片 `TwitterDayGroup.astro` 的渲染尽量复用，只在其外层套类别/分页容器。

## 分工
- 对照表 + 规格：大师（规划/验收）
- 前端落地：执行猫
- 验收：大师（跨家族）
