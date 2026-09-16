# 知识星球日文件

`data/zsxq/` 只收录按日问答精选。站点构建时读取 `YYYY-MM-DD.json`，忽略本 README 与其它非日文件。

## 日文件

- 文件名：`YYYY-MM-DD.json`
- `source` 固定 `zsxq-changgong`
- `items` 必须是数组；没有问答就不要写日文件，或写空数组（页面按空状态处理）

字段：`schema_version` / `source` / `title` / `planet` / `group_url` / `date` / `updated_at` / `count` / `items[]`

条目：`id` / `date` / `question` / `answer_summary` / `tags` / `url` / `rank`
