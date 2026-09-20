# nvpusa Tab 验收清单（页面上线后勾选）

线上参考：https://nv-pu-sa.pages.dev/  
墙路径：`/nvpusa/` · 导航文案：`nvpusa`  
数据：`data/nvpusa/archive.local.json`（493）+ `site/public/nvpusa/{avatars,covers}/`

数据侧已通过：见 `DATA_ACCEPTANCE.md`。下列为 **code 接入后** 验收。

## 数据（构建侧）

- [ ] 读入 493 条
- [ ] 头像静态资源约 493；封面约 445
- [ ] 5 条 HTTPS 封面 / 43 条空封面有 fallback，不白屏

## 导航与登录

- [ ] SiteNav「nvpusa」→ `/nvpusa/`
- [ ] 未登录 302 → `/login/?next=...`
- [ ] **未**把 `/nvpusa` 加入 `functions/auth.js` 的 `PUBLIC_EXACT`

## 交互

- [ ] 搜索 / 筛选（all/hot/verified/top/100k/recent/lost）/ 排序
- [ ] 随机探索
- [ ] 外链 `https://x.com/{screen_name}`

## 部署

- [ ] `pnpm build`（含 sync covers）成功；CF Pages 通过
