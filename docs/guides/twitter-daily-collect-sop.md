---
feature_ids: [F001]
topics: [推特日报, opencli, 采集SOP]
doc_kind: guide
created: 2026-07-14
updated: 2026-07-15
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
| 质量优先 | **上限 30、不设保底**；卡片显示实际条数；不为凑数注水 |
| 条数字段 | 写清 `selection.max_count=30`、`min_count=null`、`actual_count` |

## 1. 字段契约（本体必须生成）

对齐前端 `isShortTweet`（**阈值 200 字**，2026-07-15 cy 拍板 A + 宪宪派工）：

| 字段 | 规则 |
|------|------|
| `title`（长推） | 原文 `text` **>200 字** 时：写**中文一句话总概**；禁止原文截断加 `…`；英文推先理解再写中文标题 |
| `title`（短推） | 原文 `text` 字符数 **≤200**：**不要**写 `title` 字段 |
| `summary`（长推） | 中文**摘要**（压缩信息，忠于原文，不编造） |
| `summary`（短推 · 中文原文） | 填**原文全文**（可清理 `https://t.co/…` 尾巴与多余空白），**不是**再压缩摘要 |
| `summary`（短推 · 英文原文） | 填**完整中文翻译**（全文翻译，**不是**摘要/意译压缩）；专有名词可保留必要外文 |
| `recommend_reason` | **每条不同**的人话：说清为什么值得 cy 看，必须与内容对得上 |
| `tags` | 与内容真实相关的短标签；禁止瞎猜 |
| `created_at` | ISO 8601 UTC |
| 头像 | 不采集 |

### 短推判定

- 以 `text` 去掉首尾空白后的 **字符数（Python `len`）** 为准。  
- 阈值常量：`SHORT_TWEET_THRESHOLD = 200`（与 `pipeline/twitter_daily_collect.py`、前端 `site/src/lib/twitter.ts` 对齐）。  
- 前端：短推卡片**不展示标题+摘要双层结构**，只展示 `summary`（中文全文或中文全译）；**禁止**直接露英文 `text`。

### Schema 约定（写入每日 JSON 的 `selection`）

```json
{
  "max_count": 30,
  "min_count": null,
  "actual_count": 20,
  "short_tweet": {
    "threshold_chars": 200,
    "title_optional": true,
    "summary_required_zh": true,
    "summary_semantics": "full_text_or_full_zh_translation"
  }
}
```

## 2. 每日流程

1. `opencli twitter whoami` 确认登录  
2. opencli 拉 Following（live / top / AI 关键词补捞）  
3. `python3 pipeline/twitter_daily_collect.py --mode hard-filter ...` → 候选池  
4. **荧荧逐条读候选**，选出 ≤30 条：  
   - `len(text) ≤ 200` → 无 title；中文 `summary=全文`；英文 `summary=完整中文翻译`  
   - `len(text) > 200` → 有中文 title + 中文摘要  
   - 每条手写 `recommend_reason` + `tags`  
5. 组装写入 `data/twitter/YYYY-MM-DD.json`  
6. commit + push → 验 `wall.yangcyyang.cn/twitter/` 当天区块  

历史已上线 JSON **不回填**（从规则生效后的下一刊开始）。

## 3. 失败

登录态/opencli/候选过少且无法成刊 → thread 报 **今天缺刊 + 原因**，不写残缺灌水文件。

## 4. 验收抽样标准

抽 5 条（含 ≥1 条中文短推、≥1 条英文短推、≥1 条长推）：  
- 短推无 title；英文短推 `summary` 是**全译**不是摘要  
- 中文短推 `summary` 基本等于全文  
- 长推有中文总概 title  
- 理由与内容对齐、无股票娱乐怀旧、tags 说得通  
