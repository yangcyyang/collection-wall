---
name: twitter-daily-collect
description: >
  推特日报每场采集编排：resolve-slot → 拉流 → 硬筛入审计池 → pick 还原工作单 → 本体逐条写字段 → merge-day → commit。
  Use when: 执行 noon/midnight 场推特日报采集、定时刊触发、需要按 SOP 跑一趟采集。
  Not for: 修改采集规则本身（改 SOP，见真相源）、非 twitter 数据源采集。
  Output: 紧凑审计池 + 更新后的 data/twitter/YYYY-MM-DD.json + commit/push + 结构化回执。
triggers:
  - "定时刊"
  - "twitter 日报"
  - "推特采集"
  - "noon 场"
  - "midnight 场"
  - "twitter-daily-collect"
---

# Twitter Daily Collect（推特日报每场采集）

**单一真相源铁律**：本 skill 只写编排、门禁、异常处置；窗口/上限/字段契约等规则表**一律不复制**，改动请直接改真相源，不要在这里同步维护第二份。

## 1. 真相源指针

- 完整规则表（窗口、单次/单日上限、硬过滤规则、字段契约、短推阈值）：`docs/guides/twitter-daily-collect-sop.md`
- 执行脚本：`pipeline/twitter_daily_collect.py`（`resolve-slot` / `hard-filter` / `pick` / `merge-day` / `normalize-tags`）
- 审计池：`data/twitter/pool/YYYY-MM-DD-{noon|midnight}.json`（紧凑引用，不含全文）
- 日文件：`data/twitter/YYYY-MM-DD.json`（北京日历日，一天一份，累计条目）
- 管线加固 spec（P1 回执契约、后续 verify-day 门禁）：`docs/features/F004-twitter-pipeline-hardening.md`

## 2. 七步流程

1. **resolve-slot**：`python3 pipeline/twitter_daily_collect.py --mode resolve-slot --slot noon|midnight`，拿到 `TARGET_DATE` / `WINDOW_START` / `WINDOW_END` / `SINCE_DATE` / `DAY_FILE`
2. `opencli twitter whoami` 确认登录态
3. 拉 Following 时间线，覆盖本场 12h 窗口并保存为本场原始 JSON：`opencli twitter search "filter:follows -filter:replies -filter:nativeretweets since:${SINCE_DATE}" --product live --limit 80 -f json > /tmp/tw-live.json`
4. `hard-filter --inputs /tmp/tw-live.json --date "${TARGET_DATE}" --slot "${SLOT}"`：全量打分，写入紧凑审计池
5. `pick --pool-file "data/twitter/pool/${TARGET_DATE}-${SLOT}.json" --inputs /tmp/tw-live.json --out /tmp/tw-work-items.json`：按池选 id，再从同一原始文件还原全文工作单
6. **本体逐条阅读**工作单并写字段（title/summary/recommend_reason/tags），本批数量遵真相源上限
7. `merge-day` 写入 `data/twitter/${TARGET_DATE}.json`、回写池内引用与状态，随后提交池文件和日文件并 push

## 3. 三道 STOP 门禁

- **STOP**：未跑 `--mode resolve-slot` 拿到 `TARGET_DATE` 之前不许拉流。**midnight 场目标日必须是昨天**——错了这一条，日期分组在前端整个串块，是最贵的错。
- **STOP**：`pick` 必须同时传本场原始 `--inputs`。还原缺 id 时脚本会失败；禁止把池内截断的 `label` 当推文正文继续发布。
- **STOP**：`title` / `summary` / `recommend_reason` / `tags` 必须逐条本体阅读后写入。**禁止批量生成、禁止模板化理由**——这条是本 skill 存在的意义，防的是后来的猫图省事用脚本糊弄字段。
- **STOP**：禁止用空文件或空 `items` 覆盖已有日刊。`merge-day` 是追加+去重语义，任何直接覆盖日文件的操作都是违规。

## 4. 异常处置表

| 异常 | 处置 |
|------|------|
| 登录态失效（`whoami` 失败） | thread 报「登录态失效」+ 停止本趟，不得跳过校验硬拉 |
| 本趟候选/入选 0 条 | 写「本趟 0 条新增」，说明是硬筛过严还是登录态问题，不得静默跳过 |
| `hard-filter` 退出码 2（候选 < 5） | **不是失败、不报缺刊**。按不保底规则照常走完本趟，有几条写几条；回执里标注候选过少，并顺手核一次登录态 |
| `pick` 报无法还原全文 | 重新使用本场原始 JSON；若已丢失，按池内 `ref` 重拉原推。禁止发布截断 `label` |
| `merge-day` 报错 / 非 0 退出 | 不得用手改 JSON 绕过；报错内容原样贴出，日文件保持报错前状态 |
| 缺刊（任一步失败未产出） | thread 报「缺刊（本趟）+ 原因」，禁止用空文件覆盖已有日刊掩盖缺刊 |

## 5. 回执格式

跑完固定回帖一条结构化回执，格式取自 `docs/features/F004-twitter-pipeline-hardening.md` P1 定稿：

```
【日报回执】date=YYYY-MM-DD slot=noon|midnight added=N dup=N rejected=N day_total=N
```

数字来源，**不许手写**：
- `added` / `dup`（=`skipped_dup`）/ `day_total`（=`actual_count`）：直接取自本场 `merge-day` 的 stdout JSON
- `rejected`：本场 `hard-filter` 阶段 stdout JSON 的 `rejected` 字段各原因计数之和

> F004 的 `--mode verify-day` 机器校验尚未落地（P1 后续项），当前回执由执行猫人工核对后发出，不等 F004 上线。

## 6. 验收抽样

每趟抽 3–5 条（含短推/长推），核对：短推无 `title`、英文短推是完整中文翻译（非摘要）、`recommend_reason` 与内容对得上且每条不同、同日无重复 `id`、同一 `author` 单次 ≤2 条。规则细节见真相源第 5 节。

## Common Mistakes

- **只把审计池交给 `pick`**：池里故意没有全文，工作单无法还原。修复：同传本场原始 `--inputs`。
- **只提交日文件**：会丢失漏选审计与 `published` 回写。修复：同一 commit 包含本场池文件和日文件。
