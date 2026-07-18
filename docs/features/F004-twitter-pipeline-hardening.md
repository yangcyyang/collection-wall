---
feature_ids: [F004]
topics: [twitter, pipeline, hardening, observability]
doc_kind: spec
created: 2026-07-17
---

# F004 推特日报管线加固（四项优化）

> 立项来源：2026-07-17 铲屎官与 Fable 5 在 Claude Code 会话中评审管线后定稿。
> 分工沿用 F001 惯例：方案已定稿（本文档）/ 执行：芝芝 / 审查：墨墨（原 Pi，因账户余额停用改派，2026-07-18）。

## What（做什么）

四个相互独立的小改动，按优先级排列，可分批交付：

### P1 场次回执 + 兜底告警（不与平台 F003 重复）
- 每场定时刊（noon / midnight）跑完后，执行猫在频道回帖一条**结构化回执**，
  固定格式：`【日报回执】date=YYYY-MM-DD slot=noon|midnight added=N dup=N
  rejected=N day_total=N`。数据直接取自 merge-day 的 stdout JSON，不许手写。
- 新增 `--mode verify-day`（twitter_daily_collect.py）：给定 `--date --slot`，
  校验日文件存在、items 非空、generated_at 晚于本场窗口结束时间。
  不满足则 exit 2 并输出人话原因。定时任务在每场结束后 30 分钟调用一次，
  失败时执行猫在频道 @铲屎官 告警。
- 边界：心跳、租约、改派是 Clowder 平台职责（平台仓 F003），本项只管
  「数据到底写没写成功」这一层。

### P2 硬过滤规则外置 + 拒绝样本留痕
- 把 `PROMO / STOCK_TRADE / ENTERTAINMENT / NOSTALGIA / AI_SIGNAL / NON_AI_NEWS`
  六组正则从代码里挪到 `pipeline/filter_rules.json`（结构：`{组名: [pattern, ...]}`），
  脚本启动时加载；文件不存在时回退内置默认并 WARN。
- hard-filter 每次运行把被拒推文写入 `pipeline/logs/rejected/YYYY-MM-DD-slot.json`
  （仅 id/author/text 前 200 字/拒绝原因），供周期性人工回看误杀。
  该目录加入 .gitignore（本地留痕即可，不进库）。

### P3 排序信号补充 views
- `mode_hard_filter` 排序键从 `(likes, len(text))` 改为
  `(likes*W + views_parsed, len(text))`；views 需解析字符串（"1.2K"/"233"/"1M"），
  解析失败按 0。W 取 20（一个赞约等于 20 次浏览的信号强度，可在规则文件里配）。
- 不改变任何过滤语义，只影响候选池内排序。

### P4 短推契约机器校验
- `mode_merge_day` 增加逐条校验，违约即整批拒收（exit 3，输出违约明细）：
  - `char_len <= 200` 的条目：`title` 必须为 null/缺省，`summary` 非空；
  - `char_len > 200` 的条目：`title` 与 `summary` 均非空；
  - 所有条目：`recommend_reason` 非空、`tags` 为非空数组。
- 拒收时不写日文件，保证坏数据永远到不了网站。

## Why（为什么）
- P1：2026-07-17 实测发现猫调用可静默失败（点点 pi CLI 无日志死亡）；
  定时刊挂掉当前无人知晓，网站会无声缺半天数据。
- P2：黑名单正则已出现逐事件打补丁痕迹（「旱稻」「减脂餐」等一次性词条进代码），
  维护成本与误杀风险都在涨，且无误杀审计手段。
- P3：12h 窗口内新推点赞普遍为 0（2026-07-17 rank1 即 0 赞），
  现排序实际退化为按字数排；views 已采集但闲置。
- P4：短推契约（阈值 200，全文/全译）目前仅靠 Agent 自觉，换模型即可能静默破约。

## Tradeoff（取舍）
- P1 选「管线层数据校验」而非「平台层心跳」：平台已有 F003，重复实现会造成双真相源。
- P2 规则仍是正则黑名单而非模型打分：保持零成本、可解释、可离线跑；
  等拒绝样本积累一个月后再评估是否需要升级打分制。
- P3 的 W=20 是拍脑袋初值：先上线收集两周数据再调，不追求一步到位。
- P4 整批拒收（而非丢弃违约单条）：宁可这一场空跑，也要让违约暴露出来被修，
  避免「悄悄丢数据」这种更难查的行为。

## Open Questions（待定）
- verify-day 的定时检查用平台 scheduled task 还是并入现有定时刊任务尾部？
  （建议前者，隔离故障域；执行时与铲屎官确认平台配置入口。）
- P2 拒绝样本回看节奏：建议每周日报 review 时顺带看一眼，暂不做自动化。

## Next Action（下一步）
1. 芝芝按 SOP 六步走：worktree → 实现（含单测，红后绿）→ quality-gate →
   request-review 给墨墨 → merge-gate → 合并。
2. 交付顺序 P1 → P4 → P2 → P3（P1/P4 保数据安全优先，P2/P3 提质量其次）。
3. 每项完成的证据标准：单测通过 + 一次真实场次的回执/日志截图贴回频道。

## 验收标准（AC）
- AC-1：人为把某日文件改空后跑 `verify-day`，exit 2 且原因可读；正常日 exit 0。
- AC-2：filter_rules.json 删除任意一组规则后 hard-filter 行为随之变化；
  删除整个文件后回退内置默认并打印 WARN。
- AC-3：构造含 "1.2K"/"233"/"1M"/非法值的 views 样本，排序位次符合公式预期。
- AC-4：构造短推带 title 的违约批次，merge-day exit 3、日文件未被修改。
- AC-5：连续两个真实场次在频道看到格式正确的【日报回执】。
