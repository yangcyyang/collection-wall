---
feature_ids: [F001]
related_features: []
topics: [收藏墙, UX spec, 六层框架]
doc_kind: spec
created: 2026-07-12
---

# F001 收藏墙页面 · 六层 UX Spec（草稿）

> Status: 定稿 | 2026-07-12 铲屎官 + 宪宪确认
> 参考：Playbook 附录 00-ux-spec-skill / 01-agent-dashboard-spec；工程侧总纲见 `docs/features/F001-collection-wall-daily-site.md`

## L1 目标与非目标

- Q1 给谁看：**B 自己为主，顺手分享**（默认公开可读，不做自我介绍和策展门面）
- Q2 首版范围：**B 首版只做收藏墙 Tab**，日报/知识总结 Tab 占位
- Q3 墙上放什么：**B 精选内容**（指定文件夹/分类），具体文件夹清单待勾选：见 `docs/discussions/2026-07-12-F001-精选文件夹清单.md`

**已确定非目标**（2026-07-12 二轮迭代修订）：不做后端全文搜索引擎（不搜 intro/scenarios 等长文本正文、不做搜索排序算法）、不做评论、不做登录。**范围收窄说明**：前端"搜索框"是在场的——按名称/一句话定位/标签做纯前端实时字符匹配，与"全文搜索"是两回事，属于筛选交互的自然延伸（见 L4）

## L2 页面/信息结构

- **布局改版**（2026-07-12 二轮迭代，参照 `xiaoer-tools-wall` 弹药库站，kimi 本地复刻站 `xiaoer-tools-wall-clone` 提供实现参考）：
  - 左侧分类列表：12 个一级类（见 `capture.py` TAXONOMY），每项显示该分类记录数
  - 顶部搜索框：替代原顶部分类按钮筛选区的位置
  - 主卡片区：右侧/下方，随左侧分类选择 + 搜索词联动过滤
- 主卡片流分两段（信息架构变体 C，cy 2026-07-12 拍板，归档见 `my-craft.md`）：
  - 常用精华区：最多展示 12 条 `status` 为 ⭐高频/📦常用 的记录，按 `visit_count` 倒序、`added_at` 倒序、`id` 升序稳定排列（不需人工挑选）
  - 最近收藏区：其余记录按 `added_at` 倒序展示（包括未进入精华区的高频/常用记录）
  - **冷启动降级**：常用精华区记录数 < 3 条时整区隐藏，页面退化为纯时间流（数据全新、访问计数基本为零时避免精华区常年空着）
- 卡片含封面截图/标题/一句话定位/分类 Tag/状态 Badge
- 空态区：零书签时的引导文案 + 同步按钮
- 移动端：单列布局（分享场景下别人多半用手机打开）

## L3 状态与数据流

- 数据来源：`data/tools/*.json`（`capture.py` 写入）
- 页面状态：加载中 → 有数据 / 空 / 同步失败
- 单卡状态：正常展示 / 抓取失败占位
- **精选过滤机制**（Q3=B 的落地方式，宪宪拍板）：`capture` 阶段不过滤，watcher 全量抓取、数据全量保全在 `data/tools/`；过滤发生在**站点构建时**，按"精选文件夹清单"只挑选清单内的记录渲染上墙。清单可随时改，不用动 pipeline。

## L4 交互细节

- 卡片点击标题跳转原文（新标签页）
- 左侧分类列表点选过滤，纯前端过滤（数据量小，构建时全量读入）
- **搜索框**：输入即时过滤（无需回车/提交按钮），匹配范围限定 name/headline/tags 三个短字段，不匹配 intro/scenarios 等长文本；与左侧分类、精华/时间流分区可同时生效（交集过滤）
- hover 效果克制（仅 transform，遵 craft.md 动效规则）

## L5 边界条件

- 零书签：显示空态引导文案，不白屏
- 单条抓取失败（`capture.py` 报错/超时）：显示占位卡 + 重试入口，不影响其他卡片渲染
- 同步进行中（watcher 正在跑但还未写入 JSON）：不假装完成，允许"待同步"提示
- 封面截图缺失（`is_uniform_image` 判定失败或截图为空）：卡片仍渲染，用分类图标兜底，不留空白/裂图
- 极端数据：name/headline 超长截断（`capture.py` 已做 80/300 字符上限）；tags 超过 8 个不再显示更多
- 原文失效链接：不做预检测（首版范围内），点击后由浏览器自然报错，不阻断卡片展示
- 移动端可看性：单列布局下卡片、筛选区不溢出、不遮挡，正常可浏览（视觉细节归 design 层，spec 只锁"可看"这条边界）
- 常用精华区冷启动：区内记录 < 3 条时整区隐藏，不展示"半空"的精华区
- **移动端左侧分类栏策略**：不允许固定宽度左栏挤压卡片区导致横向溢出。二选一实现（视觉细节归 design 层，spec 只锁"不横向溢出"这条边界）：折叠为可展开抽屉，或收起为顶部横向滚动条/下拉；搜索框始终保留在可见首屏

## L6 验收标准

沿用工程侧既有 AC（`docs/features/F001-collection-wall-daily-site.md` Phase 1）：

- AC-1：Chrome ⌘D 收藏一个新网站，2 分钟内卡片出现在线上网站
- AC-2：卡片含标题、截图、分类、一句话用途；数据在 `data/tools/` 有对应 JSON
- AC-3：watcher 重启电脑后自动恢复运行

补充 UX 验收（本 spec 新增）：

- AC-U1：给定零书签，页面显示空态引导，不白屏
- AC-U2：给定一条抓取失败记录，卡片显示"重试"入口，不裂图不留空白
- AC-U3：给定封面截图缺失的记录，卡片用分类图标兜底展示
- AC-U4：移动端单列布局下卡片正常可浏览，不溢出不遮挡
- AC-U5：给定常用精华区记录数 < 3 条，该区隐藏，页面显示纯时间流
- AC-U6：搜索框输入关键词，卡片按 name/headline/tags 实时过滤，无需提交；与左侧分类选择同时生效时取交集
- AC-U7：移动端下左侧分类栏不造成横向溢出（抽屉或顶部收起二选一），搜索框在首屏可见可用

## 现状核实（准备工作三件事）

1. **书签数据现状**：watcher 已实测跑通（2026-07-10 22:10 启动日志确认监听到 Chrome Profile 7/1/3/Guest + Edge + Doubao 共 6 个 Bookmarks 文件），但**当前未在后台常驻运行**（无对应进程），`data/tools/` 目录**零条记录**——Phase 0 spike 验证过链路可跑通，但还没有真实收藏数据。数据格式：`capture.py` 写入 `data/tools/{uuid}.json`，字段含 `id/url/name/headline/intro/category/subcategory/tags/capabilities/scenarios/cover(封面相对路径)/status/visit_count/added_at/my_notes` 等，封面图另存 `data/tools/covers/{id}.jpg`。
2. **Astro 脚手架**：**未建**。`产品项目/自动化工作流/` 下没有 `site/` 目录，与决策文档"尚未完成"清单一致。
3. 以上均来自 `产品项目/自动化工作流/` 仓库实地核查（`pipeline/watcher.py`、`pipeline/capture.py`、`pipeline/logs/watcher.log`、`pipeline/.last-processed.json`、`docs/features/F001-collection-wall-daily-site.md`），非猜测。

## 种子数据（供 UI 开发/验收用）

`data/tools/seed-01.json` ~ `seed-08.json`（8 条，`seed-` 前缀，真实数据到位后按前缀清理）：
- seed-01~05、seed-08：正常记录，含封面图（`data/tools/covers/seed-*.jpg`，占位色块图）
- seed-06：**无封面**记录（`cover: null`），对应 AC-U3
- seed-07：**抓取失败**记录，对应 AC-U2

**开放问题**：`capture.py` 目前抓取失败时直接退出、不写 JSON，没有"失败态"持久化能力——seed-07 用了一个 schema 之外的临时字段 `capture_status: "failed"` 来让 UI 有东西可渲染。真实的失败态持久化（watcher/capture 失败后写一条最小占位记录）是工程侧的待办，不在本 spec 范围内，建议后续单独开一张工程票跟进，UI 侧先按这个临时字段接。
