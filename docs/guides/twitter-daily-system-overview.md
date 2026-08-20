---
feature_ids: [F001]
topics: [推特日报, 系统总览, 双场采集, 定时任务, 产物地图, 风险]
doc_kind: overview
created: 2026-08-09
updated: 2026-08-09
---

# AI 推特日报 · 系统总览

> **本文定位**：给人看的系统地图（流程 / 产物 / 定时 / 现状 / 风险）。  
> **执行细则真相源**（不要替代）：[`docs/guides/twitter-daily-collect-sop.md`](./twitter-daily-collect-sop.md)  
> **部署与调度 gotcha**：`/Users/cy/.claude/projects/-Users-cy-Documents-03-life-AI-design------------/memory/twitter-daily-deploy-gotcha.md`  
> **线上**：https://wall.yangcyyang.cn/twitter/  
> 落盘依据：thread 宪宪规格消息 `0001786265052333-000985-a467778b`；执行：荧荧 (@grok)

---

## 0. 系统目标（一句话）

用 opencli 登录的 `@yangcyyang1` 关注流，按**北京时间双场**筛出有信息量的 AI 推文 → 写入日刊 JSON → `git push` → 站点按日历日展示。

| 原则 | 说明 |
|------|------|
| 机器做机械活 | 拉流、去重、硬筛、打分、入池、出工作单、merge |
| 荧荧做判断活 | **title / summary / recommend_reason / tags** 必须本体逐条阅读后写 |
| 质量优先 | 工作单 ≤20 不保底；单日 ≤60 仅安全阀；禁止空文件覆盖已有日刊 |

---

## 1. 端到端流程（登录 → 上线）

时区一律 **Asia/Shanghai**。每一场（noon 或 midnight）按同一条链路跑：

```
定时 tick → 本 thread 派单 → 荧荧认领
  → resolve-slot（目标日 + 12h 窗口）
  → opencli whoami（profile qav5zurq / @yangcyyang1）
  → 拉 Following timeline（覆盖窗口）[+ search 补流]
  → hard-filter（全量候选入池）
  → pick（≤20，同作者≤2，还原全文工作单）
  → 本体阅读：剔窗外 / 促销赞助 / 炒股 / 低信息
  → 写字段 → batch JSON
  → merge-day（追加 + id 去重；池状态 published）
  → git commit + push origin/main
  → 验线上日期区块 → 任务待验收
```

### 1.1 步骤表

| # | 阶段 | 做什么 | 关键命令 / 产物 |
|---|------|--------|-----------------|
| 1 | 解析场次 | 得到 `TARGET_DATE`、窗口、日刊路径 | `python3 pipeline/twitter_daily_collect.py --mode resolve-slot --slot noon\|midnight` |
| 2 | 登录 | 验 Twitter 登录态 | `opencli --profile qav5zurq twitter whoami` |
| 3 | 拉流 | Following 覆盖该场 12h；可补 search | `opencli twitter timeline --type following --limit 1000 -f json` → `/tmp/tw-live-*-tl.json` |
| 4 | 硬筛入池 | 去促销/非 AI/转发等；打分；**全量**落池 | `--mode hard-filter --inputs … --date $DATE --slot $SLOT` → `data/twitter/pool/$DATE-$SLOT.json` |
| 5 | 出工作单 | 按分取 ≤20，同作者 ≤2；用原始 inputs 还原全文 | `--mode pick … --out /tmp/tw-work-items.json` |
| 6 | 人工精选 | 逐条读；可从池补捞高分窗内条；**不凑数** | 产出 `/tmp/batch-items-*.json` |
| 7 | 补字段 | 见字段契约 | `title?` / `summary` / `recommend_reason` / `tags` / `created_at` |
| 8 | 合并日刊 | 追加 + 按 id 去重；回写池 `published` | `--mode merge-day --day-file data/twitter/$DATE.json --batch …` |
| 9 | 上线 | commit + push；验墙 | `data/twitter/$DATE.json` 进 Git；https://wall.yangcyyang.cn/twitter/ |

### 1.2 字段契约（成品）

短推阈值 **200 字**（cy 拍板）：

| 字段 | 长推（>200） | 短推（≤200） |
|------|--------------|--------------|
| `title` | 中文一句话总概 | **不写** |
| `summary` | 中文摘要 | 中文原文全文 / 英文全文翻译 |
| `recommend_reason` | 每条不同、对齐内容 | 同左 |
| `tags` | 真实相关 | 同左 |
| `created_at` | ISO 8601 UTC | 同左 |

### 1.3 硬筛规则（摘要）

禁促销、禁非 AI 生活娱乐、禁股票炒作话术、禁怀旧旧闻、去 retweet / 无信息短回复。  
关键词打分**不能**判断信息量：Top20 仍可能混营销/吐槽 → **本体阅读不可省**。

---

## 2. 双场日期归属与定时工作流

### 2.1 日期归属（最易踩坑）

| 场次 | 触发（北京） | 内容窗口（北京） | 写入文件 |
|------|--------------|------------------|----------|
| **noon** | **12:00** | **当天** 00:00–12:00 | `data/twitter/**当天**.json`（通常新建） |
| **midnight** | **00:00** | **前一天** 12:00–24:00 | `data/twitter/**昨天**.json`（**追加** + id 去重） |

```
日历日 D 的完整 24h =
    D 日 12:00 的 noon（D 00:00–12:00）
  + D+1 日 00:00 的 midnight（D 12:00–24:00 → 仍写进 D 的文件）
```

**禁止**：午夜刚过时把推文写进「新日历日」——前端按文件名日期分组会串块。

### 2.2 产量阀值

| 环节 | 规则 |
|------|------|
| 入池 | 硬筛通过**全量**保存 |
| 单场工作单 | ≤20，不保底；同作者 ≤2 |
| 单日 | ≤60 安全阀，不保底 |
| 写入 | 追加 + id 去重；失败报缺刊+原因，禁止空文件覆盖 |

### 2.3 定时任务（当前 runtime）

注册于 Clowder schedule（port **3004**），投递本 thread：`thread_mrjdadaqwdgxyq8z`，执行猫 **grok（荧荧）**。

| 场次 | taskId | cron | 时区 | 最近自然 tick（截至文档更新） |
|------|--------|------|------|------------------------------|
| noon | `dyn-1785856953757-vcbbc7` | `0 12 * * *` | Asia/Shanghai | `RUN_DELIVERED`（2026-08-09 12:00 场） |
| midnight | `dyn-1785856953853-xyfa46` | `0 0 * * *` | Asia/Shanghai | `RUN_DELIVERED`（**2026-08-09 00:00** 触发；`TARGET_DATE=2026-08-08`） |

自检：

```bash
curl -s http://127.0.0.1:3004/api/schedule/tasks
# 两 task 须 enabled；验收以自然 tick 的 RUN_DELIVERED 为准，不只信注册成功
```

### 2.4 一次自然 tick 链路

```
时钟到点 → schedule RUN_DELIVERED
  → thread 出现「[定时任务] 执行 AI 推特日报（noon|midnight）…」
  → 荧荧认领（message-claim 易挂旧票 → 用 subjectKey 单独建票）
  → 第 1 节流程
  → commit/push → 线上日期块更新 → in_review
```

---

## 3. 产物地图

工作根目录（定时任务**必须**在此跑，勿用 worktree 静默跑旧码）：

`/Users/cy/Documents/03 life/AI design/产品项目/自动化工作流`

### 3.1 持久产物（进 Git / 上线）

| 产物 | 路径 | 说明 |
|------|------|------|
| 日刊成品（真相源） | `data/twitter/YYYY-MM-DD.json` | 一天一份；`items[]` + `selection` |
| 场次审计池 | `data/twitter/pool/YYYY-MM-DD-{noon\|midnight}.json` | schema v3 紧凑：id/author/label/score/status，**无全文** |
| 采集脚本 | `pipeline/twitter_daily_collect.py` | resolve-slot / hard-filter / pick / merge-day |
| 打分权重 | `pipeline/score_weights.json` | 关键词打分 |
| 执行 SOP | `docs/guides/twitter-daily-collect-sop.md` | 细则真相源 |
| **本系统总览** | `docs/guides/twitter-daily-system-overview.md` | 本文 |
| 前端 | `site/src/pages/twitter.astro`、`site/src/lib/twitter.ts`、`TwitterDayGroup.astro` 等 | 按日刊文件名日期分组 |
| 线上 | https://wall.yangcyyang.cn/twitter/ | push `main` 后构建生效 |

### 3.2 临时产物（本机 `/tmp`，不进 Git）

| 产物 | 典型路径 | 注意 |
|------|----------|------|
| Following 原始流 | `/tmp/tw-live-*-tl.json` | 池无全文；清理后同场须重拉才能还原 |
| search 补流 | `/tmp/tw-live-*-search.json` | 同上 |
| pick 工作单 | `/tmp/tw-work-items*.json` | 含全文 |
| 本体 batch | `/tmp/batch-items*.json` | merge-day 输入 |

### 3.3 运行依赖（仓库外）

| 依赖 | 标识 | 备注 |
|------|------|------|
| opencli + Browser Bridge | Chrome 扩展 + daemon | 多 profile 时 `opencli profile use qav5zurq` |
| Twitter 登录 | `@yangcyyang1` | whoami 必须 logged_in |
| Clowder 调度 | `127.0.0.1:3004` | **2026-08-04** runtime 切换曾导致注册丢失；以后切换/重启必须复查 |
| 执行目录 | 主目录 `自动化工作流` | push ≠ 主目录代码已更新 |

---

## 4. 现状（截至 2026-08-09）

### 4.1 系统健康

| 项 | 状态 |
|----|------|
| 双场 cron | **已恢复**：两 dyn task `enabled=true`，最近均为 `RUN_DELIVERED` |
| 自然触发验证 | **通过**（非仅注册成功） |
| 执行账号 | `@yangcyyang1` / profile `qav5zurq` |
| 仓库 HEAD（主目录） | `127b6cc` — noon 2026-08-09（12 items） |
| 线上 | https://wall.yangcyyang.cn/twitter/ 可浏览 |

### 4.2 数据覆盖

| 指标 | 数值 |
|------|------|
| 日刊文件 | **25** 天（`2026-07-13` → `2026-08-09`） |
| 累计 items | **521** |
| 最近双场均有产物日 | **2026-08-08**（noon 14 + midnight 10 = 24）；**注意**：该日 noon 拉流实际约 **00:58–11:58**，首约 1h 因 search 超时未补全，并非理论窗口 00:00–12:00 无缺口 |
| **2026-08-09** | **仅 noon 12 条**；下半场等 **08-10 00:00** midnight 追加 |
| **2026-08-07** | **全日缺刊** |
| 其他缺日 | `2026-07-23`、`2026-07-24`；部分日仅单场（如 08-02/03/06 偏 noon） |

#### 近两周日刊

| 日期 | items | 备注 |
|------|------:|------|
| 2026-08-01 | 13 | midnight 收口 |
| 2026-08-02 | 13 | 偏 noon |
| 2026-08-03 | 13 | 补跑 noon |
| 2026-08-04 | 22 | noon+midnight |
| 2026-08-05 | 22 | noon+midnight |
| 2026-08-06 | 13 | 偏 noon |
| 2026-08-07 | — | **缺刊** |
| 2026-08-08 | 24 | 双场均有产物；noon 窗口约 00:58–11:58（首小时缺口） |
| 2026-08-09 | 12 | noon 已上线 |

### 4.3 最近一场（noon 2026-08-09）快照

| 项 | 证据 |
|----|------|
| 窗口 | 00:00–12:00，Following 覆盖至约 11:59 |
| 池 | hard-filter 候选 **240** |
| 成品 | 人工保留 **12** |
| 文件 | `data/twitter/2026-08-09.json` + `pool/2026-08-09-noon.json` |
| Git | `127b6cc` → `origin/main` |
| 线上 | 「8月9日 · 12 条」；收录约 509→521 |

---

## 5. 已知风险与运维门槛

| 风险 | 表现 | 应对 / 防复发 |
|------|------|----------------|
| **runtime 切换导致调度丢失（曾发）** | 2026-08-04 切换 runtime 后双场静默不 tick（08-03/04 曾整段空窗） | **以后**每次 runtime 切换或重启必须复查两 dyn taskId 仍 enabled；验收用自然 tick 的 `RUN_DELIVERED`，不只信注册成功 |
| **push ≠ 主目录代码** | 定时在主目录跑旧脚本 | 验收要主目录 `git log -1`；开发改动走 worktree |
| **watcher 自动 commit** | main 漂移、派工 commit 对不上 | 场次临近主目录只读；`pgrep watcher.py` |
| **OpenCLI profile / Bridge** | `BROWSER_CONNECT`、多 profile 冲突 | 开 Chrome+扩展；`profile use qav5zurq` |
| **窗口覆盖不足** | timeline 未盖满 12h | 加大 limit / 补 search；报告实际覆盖区间 |
| **429 / search 超时** | 拉流残缺 | 重试；记缺口；不空文件交差 |
| **打分误选** | 营销/吐槽进 Top20 | 本体淘汰；可后续用误选样本调权重 |
| **claim 挂旧票** | message-claim 绑到历史 in_review | `subjectKey: twitter-daily:{slot}:{date}` 单独建票 |
| **缺刊积压** | 08-07 等 | 补跑需铲屎官排期；midnight 过窗一般不硬补 |

---

## 6. 角色分工

| 角色 | 职责 |
|------|------|
| 荧荧 (@grok) | 双场执行、写字段、merge、push、验线上 |
| 脚本 | resolve-slot / hard-filter / pick / merge-day |
| 宪宪等 | 调度注册协调、总览验收、架构边界 |
| 铲屎官 cy | 验收 in_review、缺刊是否补跑、愿景取舍 |

---

## 7. 相关路径速查

```
docs/guides/twitter-daily-collect-sop.md      # 执行 SOP（细则真相源）
docs/guides/twitter-daily-system-overview.md  # 本系统总览
pipeline/twitter_daily_collect.py
pipeline/score_weights.json
data/twitter/YYYY-MM-DD.json
data/twitter/pool/YYYY-MM-DD-{noon|midnight}.json
site/src/pages/twitter.astro
```

线上：https://wall.yangcyyang.cn/twitter/

---

## 8. 文档边界

- **只新增总览**，不复制或替代 `twitter-daily-collect-sop.md`。  
- 操作命令细节、字段细则以 SOP 为准；本文保留系统级结构与现状。  
- 状态数字以落盘当日实测为准；后续场次交付后应更新 §4。
