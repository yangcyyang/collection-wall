---
feature_ids: [F005]
topics: [knowledge, site, orbitos, export]
doc_kind: spec
created: 2026-07-17
---

# F005 点亮「知识总结」Tab

> 立项来源：2026-07-17 铲屎官确认预览效果后拍板（预览用真实卡片渲染，已认可）。
> 关联：OrbitOS-CN/400知识库（生产端）→ 本站（消费端）。数据清理为独立支线（派猫），不阻塞本功能。

## What（做什么）

把 400知识库 最近入库的标准卡片展示到网站「知识总结」Tab，复用推特日报的时间线设计。

1. **导出脚本** `pipeline/knowledge_export.py`：
   - 扫描 `OrbitOS-CN/400知识库/事实知识库/10_内容单元`；
   - 只取标准格式卡（有 unit_id、unit_type ∈ 七类、status=active），旧格式卡直接跳过；
   - 窗口默认最近 14 天（--days 可调），每张卡提取：类型、标题(H1)、
     摘要（首个小节首段，截 160 字）、要点（前 3 条列表项）、来源文件、置信度、入库日期、库内路径；
   - 写 `data/knowledge/recent.json`（schema_version/generated_at/window_days/total_pool/items）。
2. **站点页面** `site/src/pages/knowledge.astro` + `site/src/lib/knowledge.ts`：
   - 复用时间线组件语言：按入库日分组、sticky 日期徽章、左轨圆点；
   - 左列放**类型徽章**（技能/方法论/概念/方案/问题/观点/案例，各自配色），圆点同色；
   - 卡片四层：标题 / 摘要 / 要点列表 / 溯源脚注（来源 + 置信度 + obsidian:// 深链回原文）；
   - 顶部类型筛选条（复用 tag-filter 交互）。
3. **Tab 点亮**：index/twitter 页的「知识总结 · 即将开放」改为可点链接。

## Why
- 知识库生产端已运转（9,314 张卡），消费端为零；网站占位 Tab 与 data/knowledge/ 目录现成。
- 盘点确认干净卡池 8,748 张，「标准格式 + active」即可过滤，无需等清理支线。

## Tradeoff
- v1 手动跑导出脚本（或并入现有定时任务），不新建自动化——先验证内容价值再谈频率；
- obsidian:// 深链只在装有 Obsidian 的机器可用——个人站可接受，公网访客降级为纯文字来源说明；
- 摘要/要点用规则截取而非 AI 重写——保真、零成本，丑一点可后续迭代。

## Open Questions
- 导出频率：每日随定时刊跑 or 每周一次？（v1 手动，观察一周再定）
- 旧格式卡迁移完成后是否回填历史（把窗口拉长）？

## Next Action
1. Fable5 实现（脚本+页面）→ 本地验证 → Pi 审查 → push 上线（沿用 F001 时间线流程）。
2. 清理支线由墨墨执行（去重/迁移/收件箱排查），dry-run 报告先行，铲屎官确认后落盘。

## 验收标准（AC）
- AC-1：`python3 pipeline/knowledge_export.py` 幂等生成 recent.json，且只含标准卡（抽查无旧格式）。
- AC-2：/knowledge/ 页按日分组渲染，类型筛选可用，日期徽章 sticky 行为与推特日报一致。
- AC-3：卡片脚注展示来源与置信度；深链 URL 格式正确（obsidian://open?vault=…&file=…）。
- AC-4：pnpm test 不新增失败；构建 0 错误。
- AC-5：线上 /knowledge/ 出现新标记且 Tab 从「即将开放」变为可点。
