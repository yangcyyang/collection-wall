---
feature_ids: [F001]
topics: [security, git, deployment]
doc_kind: audit
created: 2026-07-12
---

# F001 首次 GitHub 推送前安全清查

## 结论

首次推送前不发现可提交的私钥或供应商 token。实际 API key 仅存在于被忽略的 `pipeline/.env`；自动同步只会暂存 `data/tools/`，不会自动提交工作区其他内容。

## 已排除的本地文件

- `pipeline/.env`、根 `.env`：密钥与本机配置。
- `pipeline/logs/`、`.bookmark-baseline.json`、`.last-processed.json`、`.git-sync-state.json`：运行日志与本机游标。
- `pipeline/.venv/`、`node_modules/`、`site/dist/`、`.astro/`：可再生成依赖和构建物。
- `data/imports/`：一次性原始导入文件；站点只消费已规范化的 `data/tools/`。
- `.cat-cafe/`、各 Agent 本地配置目录、讨论和 review 临时材料：协作运行态与含本机路径的历史材料。

## 已处理的可提交路径

- 导入脚本不再内置本机绝对路径；重新导入必须显式提供 `ARSENAL_SOURCE` 与 `ARSENAL_COVERS`。
- 决策和功能文档仅保留抽象的本机配置说明，不再写入用户目录绝对路径。
- watcher 的自动同步仅提交 `data/tools/`，且最短合并窗口固定为 300 秒。

## 首推门禁

在创建私有仓库及首次 `git push` 前重新执行：

```bash
git status --short
git check-ignore -v pipeline/.env pipeline/logs/watcher.log pipeline/.last-processed.json
rg -n -i '(-----BEGIN [A-Z ]*PRIVATE KEY-----|gh[pous]_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,})' \
  --glob '!node_modules/**' --glob '!pipeline/.venv/**' --glob '!.git/**' .
```

命中密钥则停止首推、先轮换或移出；只命中被忽略的本地 `.env` 时不打印其内容。
