---
feature_ids: [F001]
topics: [GitHub, clean history, first push, content policy]
doc_kind: decision
created: 2026-07-13
---

# F001 干净 `main` 首推准备

## 当前事实

- 目标仓库名：`collection-wall`，可见性：Private。
- 本机 GitHub CLI 当前登录账号：`yangcyyang`。
- `Jane-xiaoer/collection-wall` 当前不存在；Jane-xiaoer 是参考项目作者，
  不是本机 GitHub CLI 的登录身份。
- 当前本地分支为 `master`，只有两条旧提交；首发不推旧历史，改用审核后
  当前快照建立新的根提交，生产分支统一为 `main`。
- 当前没有 Git remote，也没有 upstream，自动同步保持关闭。
- `data/tools/` 共 653 条：505 条 `xiaoer-tools-wall`、140 条
  `github-stars`、8 条 `seed`；封面 506 张。
- Git 自动同步硬下限为 300 秒，代码、测试、`.env.example` 与上线指南已统一。

## 公开性选择对首发快照的影响

### a. 仅公开自己的数据

- 线上构建排除 505 条 `xiaoer-tools-wall` 数据及对应封面。
- 保留 140 条 GitHub Stars 与后续自己通过 ⌘D 采集的内容。
- 需先调整站点数据入口或目录分层，保证自动同步不会把本地参考数据重新发布。

### b. 全部公开并显著署名

- 首发包含当前 653 条数据。
- 页面必须显著标注“部分数据源自 xiaoer's 私人弹药库”，并链接原项目或原站。
- 署名属于 UI 主线文件，需与正在实现搜索和左侧栏的 owner 协调，避免写冲突。

## 首推前已完成

- [x] 私密文件、日志、运行游标和一次性导入文件已加入忽略规则。
- [x] 自动同步只提交 `data/tools/`，且无 upstream 时失败关闭。
- [x] Node 与 pnpm 版本已固定。
- [x] Pages 构建参数和 DNS 指引已写入文档。
- [x] GitHub 登录身份与目标仓库是否存在已核查。
- [x] 60/300 秒冲突已统一为 300 秒。

## 等待铲屎官确认

请回复：

```text
a，确认建仓
```

或：

```text
b，确认建仓
```

默认拟创建 `yangcyyang/collection-wall`。如果 Owner 不是 `yangcyyang`，请在
同一条回复中指定。

## 获得确认后的执行顺序

1. 按 a/b 方案锁定公开数据范围与署名。
2. 重新运行测试、构建、凭证扫描及首发文件清单检查。
3. 建立不含旧 `master` 历史的干净 `main` 根提交。
4. 创建 GitHub 私有仓库 `collection-wall`，配置 `origin`。
5. 展示最终提交摘要；执行首次 push。
6. 协助在 Cloudflare Pages 连接私有仓库并完成首构建。
7. 首构建和 upstream 验收后，才启用 `AUTO_GIT_SYNC=1`。

