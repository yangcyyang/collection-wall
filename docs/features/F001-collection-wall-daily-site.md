---
feature_ids: [F001]
related_features: []
topics: [收藏墙, 日报网站, 自动化管线, obsidian]
doc_kind: spec
created: 2026-07-10
---

# F001: 自动更新收藏墙与日报网站（执行方案）

> Status: spec | Owner: 宪宪（方案/验收） | 主执行: 芝芝 | 知识库盘点: 墨墨 | 跨家族审查: Pi（备选：喵喵） | 决策人: cy
> 注：砚砚（codex）因额度限制暂不参与本 Feature（cy 2026-07-10）

## Why

cy 每天会发现值得收藏的网站/工具，也需要固定来源的 AI 日报和知识库每日总结。目标是把三件事收进**一个自动更新的网站**：

1. **收藏墙**：浏览器一键收藏（⌘D）→ AI 自动分析、截图、分类 → 自动上墙
2. **日报 Tab**：每天定时采集 aihot 热榜、WaytoAGI 7日更新、Product Hunt → AI 总结 → 发布
3. **知识总结 Tab**：Obsidian 知识库定期拆解的产物 → 每日汇总 → 发布

参考实现：[xiaoer-tools-wall](https://xiaoer-tools-wall.vercel.app/)，其采集管线已开源为
[wtf-was-that-site](https://github.com/Jane-xiaoer/wtf-was-that-site)（⌘D → watcher → Playwright 截图 → AI 结构化分析 → 写库 → 自动部署）。

本方案属于《个人AI工作流与个人AI操作系统建设方案 V1.1》的第一条穿透链路（原"日报网站 MVP"的扩展版）。

## 已拍板决策

| 决策 | 结论 | 拍板人 |
|---|---|---|
| 存储 | **不用 Notion**。repo 内 JSON 为单一真相源 | cy 2026-07-10 |
| 项目位置 | `产品项目/自动化工作流/`（本 repo） | cy 2026-07-10 |
| 第一版范围 | 收藏墙先行，日报、知识总结作为后续 Tab 递增 | 宪宪（依据"一点一点来"） |
| 编排 | 第一版不引入 n8n/Supabase；本地 launchd + GitHub Actions | 宪宪 |
| AI 分析模型 | **DeepSeek API**（key 由 cy 后续提供，只放本地 `.env`，绝不进 git） | cy 2026-07-10 |
| 部署 | **Cloudflare Pages**（git push 自动构建；cy 有自有域名，Phase 1 部署时绑定） | cy 2026-07-10 |
| 浏览器 | Chrome（书签监听按 Chrome 书签文件格式做） | cy 2026-07-10 |
| Obsidian 收藏同步 | **不做**。收藏笔记不上传网站，线A 不写 Obsidian，⌘D → JSON → 上墙即可 | cy 2026-07-10 |
| 知识库数据源 | 本机配置的 OrbitOS-CN 知识库（md + YAML frontmatter，四层结构，主要内容单元在 `事实知识库/`） | cy 2026-07-10 |
| 执行分工 | 主执行：芝芝；长文档整理/知识库盘点：墨墨；跨家族代码审查：Pi（备选喵喵）；砚砚因 codex 额度限制暂不参与 | cy 2026-07-10 |

## What（目标架构）

```text
三条数据生产线，一个静态网站：

[线A 收藏] Chrome ⌘D 收藏
  → 本地 watcher（FSEvents 监听 Chrome 书签文件，launchd 常驻）
  → capture：Playwright 打开页面截图 + DeepSeek 结构化分析（分类/用途/关键词）
  → 写入 data/tools/*.json（真相源，不写 Obsidian）
  → git push 触发部署，约 1 分钟上墙

[线B 日报] GitHub Actions 每日定时
  → Product Hunt API + Playwright 抓取 aihot / WaytoAGI
  → 去重、评分、DeepSeek 总结（按 V1.1 §8.4 schema）
  → data/daily/YYYY-MM-DD.json
  → 构建发布 + IM 推送摘要（后置）

[线C 知识] 每日定时（本地，知识库在本机 Obsidian vault）
  → 读取 OrbitOS-CN/400知识库/（重点 事实知识库/）当日新增或变更的 md
  → DeepSeek 汇总 → data/knowledge/YYYY-MM-DD.json
  → 构建发布

[网站] Astro 静态站，三个 Tab：收藏墙 / 每日日报 / 知识总结
  数据全部来自 data/ 下 JSON，构建时读取
  部署：Cloudflare Pages（git push 自动构建，绑定 cy 自有域名）
```

目录规划（在本 repo 内新增）：

```text
自动化工作流/
├── pipeline/          # 采集管线（基于 wtf-was-that-site 改造，去 Notion 化）
├── site/              # Astro 前端（三 Tab）
├── data/
│   ├── tools/         # 线A：收藏卡片 JSON
│   ├── daily/         # 线B：日报 JSON（按日期）
│   └── knowledge/     # 线C：知识总结 JSON（按日期）
├── scripts/           # launchd plist、部署脚本
└── docs/
```

## 阶段拆解

### Phase 0：管线 spike（半天，芝芝）

目标：验证开源管线在 cy 机器上能跑通，摸清去 Notion 化的改造量。

- clone `wtf-was-that-site` 到本 repo 外的临时目录（spike 不进正式代码）
- 装依赖（Python venv + Playwright chromium），跑通 watcher 监听 Chrome 书签变化
- 验证 capture 的 Playwright 截图环节；AI 分析环节暂无 key，mock 跳过
- 读代码，产出 spike 报告：Notion 写入的耦合点在哪、改为纯 JSON 存储的改造量、
  AI 调用层换 DeepSeek 的改造量、launchd 常驻方式
- **AC-0**: spike 报告落在 `docs/discussions/`，明确列出"能直接复用 / 需要改造 / 需要重写"三类清单

### Phase 1：收藏墙 MVP（1–2 天）

- 管线去 Notion 化：纯 JSON 存储；AI 调用层接 DeepSeek（key 放本地 `.env`）
- Astro 站 + 收藏墙 Tab（卡片网格、分类筛选）
- Cloudflare Pages 部署 + push 自动构建（域名绑定，域名由 cy 提供）
- launchd 常驻 watcher
- **AC-1**: Chrome ⌘D 收藏一个新网站，约 6 分钟内卡片出现在线上网站（5 分钟合并去抖 + 构建约 1 分钟；
  去抖是防连续收藏疯狂触发构建的有意设计）✅ 2026-07-13 linux.do 实测通过（commit 9e6ec79，宪宪线上独立抽查确认）
- **AC-2**: 卡片含标题、截图、分类、一句话用途；数据在 `data/tools/` 有对应 JSON ✅ 同上实测通过
- **AC-3**: watcher 常驻，杀进程自动重启、开机自启 ✅ launchd 配置验证通过（真机重启待日常自然验证）

### Phase 2：日报 Tab（2–3 天）

- Product Hunt（官方 API）+ aihot、WaytoAGI（Playwright 抓取）三源采集
- 去重 → 评分 → AI 总结，输出 V1.1 §8.4 结构
- GitHub Actions 每日定时出刊；单源失败不影响出刊（降级出刊并标注缺源）
- 日报 Tab + 按日期归档页
- **AC-4**: 连续 3 天自动出刊无人工干预
- **AC-5**: 任一源失败时当日日报仍发布，并在页面标注该源缺失
- **AC-6**: 每条内容保留原始来源链接

### Phase 3：知识总结 Tab（1–2 天）

- 读取 `OrbitOS-CN/400知识库/`（已确认：md + YAML frontmatter，四层结构，主要内容单元在 `事实知识库/`）
- 每日 AI 汇总当日新增/变更条目 → 知识总结 Tab
- 前置输入：墨墨的知识库盘点报告（条目数量、frontmatter 字段覆盖率、`事实知识库/` 内部结构）
- **AC-7**: 当日有新拆解产物时，次日网站可见汇总；无新增时页面显示"今日无新增"

### Phase 4：打磨（后置，暂不排期）

关键词搜索、标签筛选、单条分享、移动端适配、IM 推送摘要。

优化项（cy 2026-07-13 提出，排在菜单栏开关之后）：
- 卡片 hover 动效对齐参考站：上浮 + 8px 实心硬阴影。实现直接复用本地克隆
  `/Users/cy/Projects/website-clones/xiaoer-tools-wall-clone/app/components/ToolCard.tsx:18`
  （`hover:-translate-y-0.5` + `hover:shadow-[8px_8px_0_var(--card-shadow)]` + hard-card 基础样式），
  移植到 `site/src/styles/global.css` 的 `.tool-card`，替换现有柔和投影。
- 整卡可点击：参考同文件 ToolCard.tsx:14——卡片根元素就是 `<a href={site.url} target="_blank" rel="noreferrer">`，
  咱们站的卡片组件改成同样结构（整卡一个链接、新窗口打开），注意卡内如有其他小链接需阻止冒泡或移出。

## Dependencies（待 cy 提供）

1. **DeepSeek API key**：Phase 1 开始前给到即可（Phase 0 不需要）。给到后写入本地 `.env`，不进 git、不贴聊天记录归档
2. **自有域名**：Phase 1 部署 Cloudflare Pages 时提供，绑定用
3. ~~Obsidian vault 路径~~ 已提供：`OrbitOS-CN/400知识库/`
4. ~~浏览器确认~~ 已确认：Chrome

## Risk

| 风险 | 影响 | 缓解 |
|---|---|---|
| aihot / WaytoAGI 无 API，靠页面抓取 | 日报源脆弱、页面改版即断 | 单源失败降级出刊；Phase 2 优先接 PH API 保底 |
| WaytoAGI 是飞书 wiki，结构复杂可能有访问限制 | 该源可能做不了 | Phase 2 先做 spike，不通就换等价源，不硬啃 |
| 本地 watcher 常驻稳定性（睡眠/重启） | 收藏漏抓 | launchd 自动拉起；watcher 启动时对账书签文件补漏 |
| DeepSeek 对"截图+网页理解"类任务能力弱于多模态模型（无视觉输入） | 卡片分析质量可能下降 | 分析改为基于页面 DOM 文本 + meta 信息，截图仅做展示不做理解；Phase 0 验证质量 |
| AI key 网络可达性 | 分析环节不稳 | 调用层做重试+超时；必要时换模型供应商 |
| 截图/分析成本 | 每条收藏一次调用，成本可控但需监控 | 日报每日一批；成本记入日志，周度回顾 |

## Phase 1 跨家族审查记录（Pi，2026-07-13）

结论：🟡 放行。密钥安全全项通过（.env 未进 git、历史无泄漏）；多 Profile 书签发现覆盖良好（7 个 Profile 在监听）。

整改排期（宪宪定）：
| 编号 | 严重度 | 问题 | 排期 |
|---|---|---|---|
| R-1 | P1 | AI 分析失败时收藏无声丢失、不重试 | **菜单栏 App 之后立即修**（先于卡片动效）：失败时写 `capture_status:"failed"` 占位 JSON + 失败重试队列 |
| R-2 | P3 | watcher 引用了不存在的 feedback_collector.py，后台线程每 30 分钟空转报错 | 与 R-1 同批修（移除引用） |
| R-3 | P3 | git push 失败只记日志不重排 | 与 R-1 同批修（_flush 失败后重新 schedule，一行改动）；单用户风险低 |
| R-4 | P4 | visit_count 只查 Default Profile 的 History | 记入 Phase 2+ backlog |

整改结果：R-1/R-2/R-3 已修复（commit 5e40e9a，含回归测试，10/10 通过），Pi 2026-07-13 复核放行——
失败→占位→30 分钟重试→成功→上墙 闭环无断点，重试上限 5 次不会静默丢失。
复核新增建议（进 Phase 2+ backlog）：R-5(P4) git push 重排无退避上限，远端永久不可用时每 5 分钟重试一次，建议 3 次后降级为本地告警。

## Open Questions

- [x] Obsidian vault 具体路径 → `OrbitOS-CN/400知识库/`
- [x] AI 分析模型 → DeepSeek（key 后续给）
- [x] 部署平台 → Cloudflare Pages + 自有域名
- [ ] 日报是否需要 IM 推送？推到钉钉还是企业微信？（Phase 4 前定）
- [ ] "收藏的笔记不用上传到网站"的解读确认：线A 完全不碰 Obsidian，收藏墙数据只来自 ⌘D 采集管线——如理解有误 cy 纠正
