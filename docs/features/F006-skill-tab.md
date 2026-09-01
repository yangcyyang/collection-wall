---
feature_ids: [F006]
related_features: [F001]
topics: [skills, colaskill, site]
doc_kind: spec
created: 2026-09-01
---

# F006 点亮「技能」Tab

> Status: in-progress | Owner: Cloud Agent
> 数据来源：Cola Skill 公开目录（https://colaskill.com/zh/），JSON 为唯一真源。

## Why
收藏墙已有提示词 / 雷达，缺一块浏览 SKILL.md 技能包的入口。Cola Skill 是 MarsWave/ColaOS 的精选市场，适合作为第一批种子。

## What
1. 导航新增 **技能**，路由 `/skills/`（复数，对齐 `/prompts/` `/radar/`）。
2. 数据在 `data/skills/`，不写入 `data/tools/`。
3. 入库脚本 `scripts/colaskill-ingest.mjs` 拉官方 `api.colaos.ai/v1/skill-directory/skills`，也可 `--from` 丢入 dump。
4. 卡片网格 + 分类芯片 + 文本搜索；★ 标注为 **GitHub stars**，不是安装量。
5. 封面下载到 `data/skills/covers/`，构建时同步到 `site/public/skills/covers/`，不热链。

## Schema（`data/skills/colaskill.json`）
```
source / title / updated_at / count / items[]
item: id, slug, title, headline, author, github_url, github_stars,
      categories[], license, detail_url, cover, cover_source,
      example_prompts[], install_url, featured
```
`github_stars` 只存目录 API 给出的整数。缩写（3.3K）不估精确值。`download_count` 不入库。

分类芯片复用 Cola 站点公开规则（创作设计 / 增长营销 / 产品技术 / 一人公司 / 职场办公 / 自我提升 / 教学讲课 / 调研分析 / 电商运营）。

## Acceptance Criteria
- [ ] AC-1：SiteNav 出现「技能」，`/skills/` 可构建。
- [ ] AC-2：JSON 在 data/skills/，tools 书签 schema 未改。
- [ ] AC-3：卡片展示名称、一句话、作者、分类、GitHub ★、Cola 详情与 GitHub 外链。
- [ ] AC-4：可按分类和文本筛选。
- [ ] AC-5：封面本地下载；无封面时 fallback，不热链 colaskill。
- [ ] AC-6：不编造条目或星数；pnpm test / 构建通过。
