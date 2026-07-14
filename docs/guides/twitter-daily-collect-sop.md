---
feature_ids: [F001]
topics: [推特日报, opencli, 采集SOP]
doc_kind: guide
created: 2026-07-14
updated: 2026-07-14
---

# 推特日报 · 每日采集 SOP（荧荧执行版）

> 真相源：`data/twitter/YYYY-MM-DD.json`  
> 账号：opencli `@yangcyyang1` · 目标时刻 11:45 采 / ~12:00 上墙  
> **分工铁律（宪宪 2026-07-14 验收退回后固化）**：脚本只做拉流/去重/硬规则初筛；**title / summary / recommend_reason / tags 必须由荧荧本体逐条阅读后写入**，禁止截断模板、禁止关键词瞎标。

## 0. 硬规则（脚本可执行）

| 规则 | 说明 |
|------|------|
| 禁促销 | FREE 课 / MILLIONAIRE / 蓝图 / Like+comment 领礼 / 午夜截止 |
| 禁非 AI 生活与纯娱乐 | 生活、擦边、三丽鸥、交友、纯梗图 |
| 禁股票财经炒作 | 建仓、股价、浮亏、散户、memecoin 等；**除非**正文核心是 AI 产业/算力/模型（仍禁止“慢慢买”号召） |
| 禁怀旧旧闻 | “7 年前视频”类无新增量回顾 |
| 同作者 ≤2 | 入选后同一 author 最多 2 |
| 去转发 / 短回复 | retweet 与无信息 `@` 短回复丢弃 |
| 质量优先 | 目标 30；硬筛后不足也**不注水**；写清 `selection.actual_count` 与 note |

## 1. 字段契约（本体必须生成）

对齐 `site/src/lib/twitter.ts`：

| 字段 | 规则 |
|------|------|
| `title` | **中文一句话总概**，禁止原文截断加 `…`；英文推先理解再写中文标题；`text` ≤80 字可不写 title（前端露短文/中文 summary） |
| `summary` | **中文**简要摘要，忠于原文，不编造 |
| `recommend_reason` | **每条不同**的人话：说清为什么值得 cy 看，必须与内容对得上 |
| `tags` | 与内容真实相关的短标签；禁止“股票贴标 OpenAI”类瞎猜 |
| `created_at` | ISO 8601 UTC |
| 头像 | 不采集 |

## 2. 每日流程

1. `opencli twitter whoami` 确认登录  
2. opencli 拉 Following（live / top / AI 关键词补捞）  
3. `python3 pipeline/twitter_daily_collect.py --mode hard-filter ...` → 候选池 JSON（**无** title/reason 终稿）  
4. **荧荧逐条读候选**，选出 ≤30 条，手写 title/summary/recommend_reason/tags  
5. 组装写入 `data/twitter/YYYY-MM-DD.json`  
6. 本地 commit；Tab 上线后再 push 并验 `wall.yangcyyang.cn/twitter/`

## 3. 失败

登录态/opencli/候选过少且无法成刊 → thread 报 **今天缺刊 + 原因**，不写残缺灌水文件。

## 4. 验收抽样标准

抽 5 条（含 ≥2 条英文原文推）：标题是总概不是截断、理由与内容对齐、无股票娱乐怀旧、tags 说得通、中文字段可读。
