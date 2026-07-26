---
feature_ids: [F001]
topics: [推特日报, opencli, 采集SOP]
doc_kind: guide
created: 2026-07-14
updated: 2026-07-26
---

# 推特日报 · 每日采集 SOP（荧荧执行版）

> 成品真相源：`data/twitter/YYYY-MM-DD.json`（**北京日历日**，一天一份）
> 审计池：`data/twitter/pool/YYYY-MM-DD-{noon|midnight}.json`（每场一份，紧凑引用进 Git）
> 账号：opencli `@yangcyyang1`  
> 节奏（2026-07-15 芝芝协调 / cy 推进）：**每天两次** · **12:00** 与 **00:00**（北京时间；定时由宪宪注册）  
> **分工铁律**：脚本做拉流/去重/硬筛/打分/入池/出单/合并；**title / summary / recommend_reason / tags 必须由荧荧本体逐条阅读后写入**。

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
| 入池 | 硬筛后的候选**全量保存**，不在这里限制作者或条数 |
| 单次工作单 | 按分数取 **≤20、不保底**；同作者最多 2 条 |
| 单日安全阀 | **≤60、不保底**；这是异常保护，不是目标产量 |
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

# 机器段：硬筛、打分并持久化；省略 --out 时自动使用该场标准池路径
python3 pipeline/twitter_daily_collect.py --mode hard-filter \
  --inputs /tmp/tw-live.json \
  --date "${TARGET_DATE}" \
  --slot "${SLOT}"

# 本体段：按分数出工作单，此处才执行同作者 ≤2
python3 pipeline/twitter_daily_collect.py --mode pick \
  --pool-file "data/twitter/pool/${TARGET_DATE}-${SLOT}.json" \
  --inputs /tmp/tw-live.json \
  --out /tmp/tw-work-items.json \
  --top-n 20 \
  --max-per-author 2

# 荧荧逐条阅读、淘汰低信息条目并补齐字段，写成 /tmp/batch-items.json 后：
python3 pipeline/twitter_daily_collect.py --mode merge-day \
  --day-file "data/twitter/${TARGET_DATE}.json" \
  --batch /tmp/batch-items.json \
  --date "${TARGET_DATE}" \
  --slot "${SLOT}" \
  --pool-file "data/twitter/pool/${TARGET_DATE}-${SLOT}.json"
```

## 1. 硬规则（脚本可执行）

| 规则 | 说明 |
|------|------|
| 禁促销 | FREE 课 / MILLIONAIRE / 蓝图 / Like+comment 领礼 / 午夜截止 |
| 禁非 AI 生活与纯娱乐 | 生活、擦边、三丽鸥、交友、纯梗图 |
| 禁股票财经炒作 | 建仓、股价、浮亏、散户、memecoin 等（AI 产业讨论除外，禁止「慢慢买」） |
| 禁怀旧旧闻 | 「7 年前视频」类无新增量 |
| 同作者 ≤2 | **不在入池阶段裁剪**；`pick` 工作单和日文件合并各自执行同作者最多 2 条 |
| 去转发 / 短回复 | retweet 与无信息 `@` 短回复丢弃 |
| 质量优先 | 工作单 ≤20、不保底；本体可继续淘汰，单日 60 仅作安全阀 |

### 打分的已知限制

关键词打分能把明显相关内容顶上来、把明显不相关内容压下去，但**不能判断内容是否有信息量**。只要出现 `Anthropic`、`Codex`、`ChatGPT` 等强信号，吐槽、标题党、网址导航或软文也可能进入 Top 20。

因此，工作单不是可直接发布的成品：荧荧仍须逐条阅读，跳过纯抱怨、无事实增量、全大写营销标题、SEO 软文及与 AI 实质无关的内容。不要为了凑数补齐 20 条；先运行一至两周，再用真实误选样本调整权重或廉价规则。

### 为什么候选池进入 Git

候选池是“为什么入选、为什么没入选”的审计证据。它不放进
`.gitignore`；每场采集与日刊一起提交。为避免 Git 历史持续膨胀，
池文件使用紧凑 JSON，**不保存推文全文、作者简介、图片 URL 数组或成品空字段**。

池文件使用 `schema_version: 3`，池内每条只保留：

- `id` / `author`；
- `label`：最多 96 字的单行辨识标题，不等同全文；
- `ref`：待发布时指向原推 URL，发布后改指
  `data/twitter/YYYY-MM-DD.json#<id>`；
- `score` / `score_breakdown` / `status`。为避免每条重复五个长字段名，
  `score_breakdown` 是数组，顺序由池顶层 `score_dimensions` 唯一解释；
  `pick` 还原临时工作单时会恢复成可读字典。

`pick` 必须同时传本场原始 `--inputs`，按池中的 id 还原完整工作单；
若某个入选 id 无法还原则失败退出，禁止把截断的 `label` 当正文发布。

> **同场重跑限制**：本场的 `/tmp/tw-live.json` 是还原全文的必要输入，不是
> 持久化状态。它被系统清理后，不能按池内截断 `label` 或 `ref` 直接重发；必须
> 重新采集该场窗口、重新 hard-filter 与 pick，再由人工复核差异后发布。

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
  "max_count": 60,
  "per_run_max": 20,
  "min_count": null,
  "window_hours": 12,
  "runs_per_day": 2,
  "slot": "noon|midnight",
  "target_date_rule": "noon→today; midnight→yesterday (Asia/Shanghai)",
  "merge": "append_dedupe_by_id",
  "actual_count": 32,
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
5. `hard-filter` → 打分 → **全量紧凑落盘**到 `data/twitter/pool/${TARGET_DATE}-${SLOT}.json`
6. `pick` 同时读取池和本场原始 `--inputs`，按分数取 **≤20**，此时才执行同作者 ≤2，产出含全文的临时工作单
7. 荧荧逐条阅读工作单，跳过低信息内容并补齐成品字段
8. **merge-day** 写入 `data/twitter/${TARGET_DATE}.json`，并回写池中对应条目为 `published`：

```bash
python3 pipeline/twitter_daily_collect.py --mode merge-day \
  --day-file "data/twitter/${TARGET_DATE}.json" \
  --batch /tmp/batch-items.json \
  --date "${TARGET_DATE}" \
  --slot noon \
  --pool-file "data/twitter/pool/${TARGET_DATE}-noon.json" \
  --per-run-max 20 \
  --day-max 60
```

   - 读已有 `items[]`（无则新建）  
   - 按 `id` 去重追加  
   - 刷新 `selection`（含 `slot`、`window_hours=12`）  
9. commit + push → 验线上对应日期区块

前端**不改**：按文件名日期分组，夜场追加进「昨天」不会串到「今天」。

## 4. 失败

任一步失败 → thread 报 **缺刊（本趟）+ 原因**；**禁止**用空文件覆盖已有日刊；本趟无新增可写 `本趟 0 条新增` 并说明是否因硬筛过严/登录态。

## 5. 验收抽样

每趟抽 3–5 条（含短推/长推）：短推无 title、英文短推全译、理由对齐、同日无重复 id、作者单次 ≤2。另核对：

- 硬筛通过数与池内候选数一致，不因同作者过多而提前丢数据；
- `pick` 不选 `score=0` 或 `status=published` 的条目；
- 合并成功的条目在池内变成 `published`，未发布条目保持 `pending`；
- 日文件保留有限数值的最终 `score` 作为榜单结果凭证；不出现
  `status`、`score_breakdown`、`label`、`ref`、`char_len`、`is_short` 等池专用字段。
