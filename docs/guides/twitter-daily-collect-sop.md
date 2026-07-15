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

## 0. 节奏与窗口

| 项 | 规则 |
|----|------|
| 触发 | 每天 **12:00**、**00:00** 各一次（取代旧的 11:45 单次） |
| 窗口 | 每次只采 **近 12 小时**（`since` 取约 12 小时前的 UTC 日期边界即可；opencli 用 `since:YYYY-MM-DD` 时按实际运行时刻覆盖近 12h 内容，并依赖 id 去重） |
| 单次上限 | **15 条、不保底**（硬筛后不足也接受；不为凑数注水） |
| 单日总上限 | **30 条、不保底**（两次合计；已达 30 则本批只补未收录 id，满了可提前停） |
| 写入方式 | **追加 + 按推文 `id` 去重**，**禁止整文件覆盖**抹掉同日另一趟结果 |
| 文件 | 仍写 `data/twitter/YYYY-MM-DD.json`（北京日期）；00:00 那趟通常写**刚结束的日历日**还是**新日历日**——以运行时刻的北京日期为准：`date +%Y-%m-%d` |

### opencli 采集示例（12h）

```bash
# 近 12 小时：用「半天前」的 since 日期（UTC），再靠筛选与 id 去重收紧
SINCE=$(date -u -v-12H +%Y-%m-%d 2>/dev/null || date -u -d '12 hours ago' +%Y-%m-%d)
DAY=$(TZ=Asia/Shanghai date +%Y-%m-%d)

opencli twitter search \
  "filter:follows -filter:replies -filter:nativeretweets since:${SINCE}" \
  --product live --limit 80 -f json > /tmp/tw-live.json
# … AI 关键词补捞等同前
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

1. `opencli twitter whoami`  
2. 拉 Following（近 12 小时窗口）  
3. `python3 pipeline/twitter_daily_collect.py --mode hard-filter ...` → 候选池  
4. 荧荧逐条生成字段，**本批 ≤15 条**  
5. **合并日文件**（推荐脚本）：

```bash
python3 pipeline/twitter_daily_collect.py --mode merge-day \
  --day-file "data/twitter/${DAY}.json" \
  --batch /tmp/batch-items.json \
  --date "${DAY}" \
  --per-run-max 15 \
  --day-max 30
```

   - 读已有 `items[]`（若无则新建壳）  
   - 按 `id` 去重；本批新 id 追加  
   - 刷新 `selection.actual_count`、`generated_at`、`window_hours=12` 等  
6. `git add data/twitter/${DAY}.json` → commit → push  
7. 验 `https://wall.yangcyyang.cn/twitter/` 当天区块条数增加/更新  

前端**不改**：同一天文件追加后按时间倒序自然显示。

## 4. 失败

任一步失败 → thread 报 **缺刊（本趟）+ 原因**；**禁止**用空文件覆盖已有日刊；本趟无新增可写 `本趟 0 条新增` 并说明是否因硬筛过严/登录态。

## 5. 验收抽样

每趟抽 3–5 条（含短推/长推）：短推无 title、英文短推全译、理由对齐、同日无重复 id、作者单次 ≤2。  
