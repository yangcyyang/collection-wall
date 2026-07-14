---
feature_ids: [F001]
topics: [推特日报, opencli, 采集SOP]
doc_kind: guide
created: 2026-07-14
---

# 推特日报 · 每日采集 SOP（荧荧执行版）

> 真相源：`data/twitter/YYYY-MM-DD.json`  
> Schema：芝芝 `6052e3a` + `b0b1359`（`site/src/lib/twitter.ts`）  
> 账号：opencli 登录态 `@yangcyyang1`  
> 时刻：每天 **11:45** 采集 → 约 **12:00** 上墙（定时任务由宪宪注册）

## 0. 硬规则

| 规则 | 说明 |
|------|------|
| 禁促销模板 | FREE / MILLIONAIRE / 蓝图 / 午夜截止 / 订阅捆绑等丢弃 |
| 禁非 AI 生活贴 | 纯生活、擦边、无信息增量高热 meme |
| 同作者每日 ≤2 | 入选后同一 `author` 最多 2 条 |
| 中文 AI/产品加权 | 中文且命中 AI/产品信号加分 |
| 去转发 / 去短回复 | 默认去 retweet；无内容短 `@` 回复丢弃 |
| 目标 30 条 | **不足 20 条 → 缺刊，不写文件** |
| 失败不糊弄 | 登录态/opencli 失败 → 报「今天缺刊 + 原因」 |

## 1. Schema 契约（采集端必须真实生成）

对齐 `Tweet` / `TwitterDay`：

| 字段 | 要求 |
|------|------|
| `date` | `YYYY-MM-DD`，与文件名一致 |
| `generated_at` | ISO 8601 UTC |
| `source.type` | `following_timeline` |
| `source.account` | `yangcyyang1` |
| `source.window_hours` | `24` |
| `items[].title` | **中文一句话总概标题**；原文 `text` 长度 ≤80 时 **不生成 title**（前端直接暴露原文） |
| `items[].summary` | 简要摘要（长推压缩；短推可与原文一致） |
| `items[].url` | 原推链接 |
| `items[].tags` | 字符串数组，不限词表；**采集流程生成** |
| `items[].recommend_reason` | **人话一句话**，禁止「AI/模型相关；互动906」拼接 |
| `items[].created_at` | ISO 8601 UTC（`...Z`） |
| 头像 | **不采集**；前端 `unavatar.io/x/{author}` |

卡片展示顺序（前端）：标题 → 摘要 → 标签 → 推荐理由；链接在右上角。

## 2. 前置检查

```bash
opencli doctor
opencli twitter whoami -f json   # logged_in=true, username=yangcyyang1
```

失败 → 缺刊。

## 3. 采集（Following，非公开热搜）

```bash
SINCE=$(date -u -v-1d +%Y-%m-%d)
DAY=$(date +%Y-%m-%d)

opencli twitter search \
  "filter:follows -filter:replies -filter:nativeretweets since:${SINCE}" \
  --product live --limit 80 -f json > /tmp/tw-follows-live.json

opencli twitter search \
  "filter:follows -filter:replies -filter:nativeretweets since:${SINCE}" \
  --product top --limit 40 -f json > /tmp/tw-follows-top.json

opencli twitter search \
  "filter:follows (AI OR LLM OR agent OR GPT OR Claude OR OpenAI OR Anthropic OR Codex OR 大模型 OR Agent) -filter:replies -filter:nativeretweets since:${SINCE}" \
  --product live --limit 40 -f json > /tmp/tw-follows-ai.json
```

## 4. 筛选写盘

```bash
cd "/Users/cy/Documents/03 life/AI design/产品项目/自动化工作流"
python3 pipeline/twitter_daily_collect.py \
  --inputs /tmp/tw-follows-live.json /tmp/tw-follows-top.json /tmp/tw-follows-ai.json \
  --date "${DAY}" \
  --out-dir data/twitter
```

- exit 0 → `data/twitter/${DAY}.json`
- exit 2 → 缺刊，不写文件

## 5. 发布（Tab 上线后）

`git_sync.py` 仅同步 `data/tools`。推特日报：

```bash
git add -- "data/twitter/${DAY}.json"
git commit -m "data(twitter): ${DAY} digest"
git push origin HEAD
```

检查 `https://wall.yangcyyang.cn/twitter/`。

## 6. 每日自检

- [ ] whoami OK  
- [ ] 条数 ≥20  
- [ ] `created_at` 均为 ISO `Z`  
- [ ] 长推有中文 `title`；短推无强行拆标题  
- [ ] `tags` + 人话 `recommend_reason` 齐全  
- [ ] 无促销 / 无纯生活 / 作者 ≤2  
- [ ]（上线后）commit 已 push 且线上可见  

通过 → thread「本日已刊」+ 路径 + short SHA。  
失败 → 「今天缺刊：原因=…」。

## 7. 全链路手动验证（push 上线后做一次）

采集 → 写盘 → commit+push → 浏览器确认线上 → 证据三件套。

## 8. 交界

| 谁 | 交界 |
|----|------|
| 芝芝 | Tab / schema；字段变更以 thread 为准 |
| Pi | 审查 Tab 代码 |
| 宪宪 | 11:45 定时 + 观察期 |
