---
feature_ids: [F001]
topics: [推特日报, opencli, 采集SOP]
doc_kind: guide
created: 2026-07-14
updated: 2026-07-15
---

# 推特日报 · 每日采集 SOP（荧荧执行版）

> 真相源：`data/twitter/YYYY-MM-DD.json`（**北京日历日**，一天一份）  
> 账号：opencli `@yangcyyang1`  
> 节奏（2026-07-15 芝芝协调 / cy 推进）：**每天两次** · **12:00** 与 **00:00**（北京时间；定时由宪宪注册）  
> **分工铁律**：脚本只做拉流/去重/硬规则初筛/日文件合并；**title / summary / recommend_reason / tags 必须由荧荧本体逐条阅读后写入**。

## 0. 节奏、窗口与目标日期（硬边界）

时区一律 **Asia/Shanghai（北京时间）**。

| 场次 | 触发（北京） | 内容窗口（北京） | 写入文件 |
|------|--------------|------------------|----------|
| **午场** | **12:00** | **当天 00:00–12:00** | **当天** `data/twitter/YYYY-MM-DD.json`（通常新建） |
| **夜场** | **00:00** | **前一天 12:00–24:00** | **前一天** 同路径文件（**追加** + id 去重） |

**禁止**：夜场把推文写进「新日历日」文件——否则日期分组会串块。  
夜场在 00:00 刚过时，`date +%Y-%m-%d` 已是新一天，**目标日必须用「昨天」**。

| 项 | 规则 |
|----|------|
| 触发 | 每天 **12:00**、**00:00**（取代 11:45） |
| 单次上限 | **15、不保底** |
| 单日总上限 | **30、不保底**（两场合计；满 30 停止新增） |
| 写入 | **追加 + 按 `id` 去重**；禁止覆盖抹掉另一场 |
| 结果 | 每个日历日文件在午夜夜场后收满完整 24h（上半场+下半场） |

### 解析目标日（推荐脚本）

```bash
# slot=noon | midnight
eval "$(python3 pipeline/twitter_daily_collect.py --mode resolve-slot --slot noon)"
# 导出：TARGET_DATE / WINDOW_START / WINDOW_END / DAY_FILE / SLOT
# noon     → TARGET_DATE=今天,  WINDOW=今天 00:00–12:00
# midnight → TARGET_DATE=昨天,  WINDOW=昨天 12:00–24:00

opencli twitter search \
  "filter:follows -filter:replies -filter:nativeretweets since:${SINCE_DATE}" \
  --product live --limit 80 -f json > /tmp/tw-live.json
# … 硬筛 → 逐条写字段（≤15）→
python3 pipeline/twitter_daily_collect.py --mode merge-day \
  --day-file "data/twitter/${TARGET_DATE}.json" \
  --batch /tmp/batch-items.json \
  --date "${TARGET_DATE}"
```

## 1. 硬规则（脚本可执行）

| 规则 | 说明 |
|------|------|
| 禁促销 | FREE 课 / MILLIONAIRE / 蓝图 / Like+comment 领礼 / 午夜截止 |
| 禁非 AI 生活与纯娱乐 | 生活、擦边、三丽鸥、交友、纯梗图 |
| 禁股票财经炒作 | 建仓、股价、浮亏、散户、memecoin 等（AI 产业讨论除外，禁止「慢慢买」） |
| 禁怀旧旧闻 | 「7 年前视频」类无新增量 |
| 同作者 ≤2 | **单次入选**内同一 author 最多 2；合并进日文件后，若同日已有该作者 2 条则本批跳过 |
| 去转发 / 短回复 | retweet 与无信息 `@` 短回复丢弃 |
| 质量优先 | 单次 ≤15、单日 ≤30，均不设保底 |

## 2. 字段契约（本体必须生成）

短推阈值 **200 字**（cy 拍板 A）：

| 字段 | 规则 |
|------|------|
| `title`（长推） | `len(text) > 200`：中文一句话总概，禁止截断加 `…` |
| `title`（短推） | `len(text) ≤ 200`：**不写** `title` |
| `summary`（长推） | 中文摘要 |
| `summary`（短推·中文） | **原文全文**（可清 t.co） |
| `summary`（短推·英文） | **完整中文翻译**（全文翻译，非摘要） |
| `recommend_reason` | 每条不同、与内容对得上 |
| `tags` | 真实相关，禁止瞎标 |
| `created_at` | ISO 8601 UTC |

### selection 约定

```json
{
  "max_count": 30,
  "per_run_max": 15,
  "min_count": null,
  "window_hours": 12,
  "runs_per_day": 2,
  "slot": "noon|midnight",
  "target_date_rule": "noon→today; midnight→yesterday (Asia/Shanghai)",
  "merge": "append_dedupe_by_id",
  "actual_count": 18,
  "short_tweet": {
    "threshold_chars": 200,
    "title_optional": true,
    "summary_required_zh": true,
    "summary_semantics": "full_text_or_full_zh_translation"
  }
}
```

## 3. 每日流程（每趟触发都跑）

1. 判定场次 **noon / midnight**（定时提示词或运行时刻）  
2. `resolve-slot` 得到 `TARGET_DATE`（**00:00 必须是昨天**）  
3. `opencli twitter whoami`  
4. 拉 Following，覆盖该场 12h 窗口  
5. hard-filter → 荧荧逐条字段，**本批 ≤15**  
6. **merge-day** 写入 `data/twitter/${TARGET_DATE}.json`：

```bash
python3 pipeline/twitter_daily_collect.py --mode merge-day \
  --day-file "data/twitter/${TARGET_DATE}.json" \
  --batch /tmp/batch-items.json \
  --date "${TARGET_DATE}" \
  --slot noon \
  --per-run-max 15 \
  --day-max 30
```

   - 读已有 `items[]`（无则新建）  
   - 按 `id` 去重追加  
   - 刷新 `selection`（含 `slot`、`window_hours=12`）  
7. commit + push → 验线上对应日期区块  

前端**不改**：按文件名日期分组，夜场追加进「昨天」不会串到「今天」。

## 4. 失败

任一步失败 → thread 报 **缺刊（本趟）+ 原因**；**禁止**用空文件覆盖已有日刊；本趟无新增可写 `本趟 0 条新增` 并说明是否因硬筛过严/登录态。

## 5. 验收抽样

每趟抽 3–5 条（含短推/长推）：短推无 title、英文短推全译、理由对齐、同日无重复 id、作者单次 ≤2。  
