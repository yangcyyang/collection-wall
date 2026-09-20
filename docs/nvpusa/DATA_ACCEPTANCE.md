# 女菩萨（nvpusa）数据验收报告

> 目录实况复核（数据 agent 收尾）：avatars **493**，covers **445**，HTTPS 残留封面 **5**（Limokkii / QuQi318 / xiaomeicding / Zorayife / isssStarrr），空 cover **43**。以 `data/nvpusa/missing-covers.txt` 与 `MEDIA_GAP_REPORT.json` 为准。

- 验收时间：2026-09-20 15:50 CST
- 交付目录：`/home/box/collection-wall/data/nvpusa/`
- 源镜像：`/workspace/nv-pu-sa/mirror/`
- 线上对照：`https://img.boomboomboom.ggff.net/data/archive.json`（本轮已下载；与本地字节一致）
- **结论：可交接 code Bot**

> 本报告仅做数据验收与补采；**不**推 git、**不**自行交接 code Bot（由主 bot / cy 决定何时交接）。

---

## 结论一句

**可交接 code Bot**（archive 493=493 全重合；头像 493 全齐；封面 446/450，余 4 条 R2 404 + twimg 403 源站不可得，已写入 `missing-covers.txt`；空 cover_url 43 条可接受）。

---

## 1. archive.json 条数

| 项 | 数字 |
|----|------|
| 本地 `/home/box/collection-wall/data/nvpusa/archive.json` | **493** |
| 本地 `/workspace/nv-pu-sa/mirror/data/archive.json` | **493** |
| 线上 R2 `data/archive.json` | **493** |
| 条数差（本地 − 线上） | **0** |
| 字节是否一致 | **是**（SHA-256 相同） |

线上下载路径：`/tmp/nvpusa-accept/archive.online.json`（本轮复检时二次拉取曾遇 403，以首轮成功副本为准；其内容与本地 `archive.json` 字节相同）。

---

## 2. 必填字段与 x.com 跳转

每条需：`screen_name`、`name`、可拼 `https://x.com/{screen_name}`。

| 项 | 数字 |
|----|------|
| 缺 `screen_name` | **0** |
| 缺 `name` | **0** |
| 不可拼 x.com（无 screen_name） | **0** |
| 示例缺字段 handle（最多 20） | （无） |

---

## 3. 头像 / 封面

### 3.1 archive 引用

| 项 | 数字 |
|----|------|
| avatar 引用（每条均有） | **493** |
| cover 非空引用 | **450** |
| cover 空（源站空，可接受） | **43** |

原始形态：484 条 avatar / 22 条 cover 为 `/api/media?key=...`；其余多为 `pbs.twimg.com` HTTPS。补采时对无 R2 key 的条目按约定探测：

- `avatars/{screen_name}_400x400.jpg`
- `covers/{screen_name}_banner.jpg`

### 3.2 本地文件数（交付目录）

| 路径 | 文件数 | 体积 |
|------|--------|------|
| `data/nvpusa/avatars/` | **493** | **13M** |
| `data/nvpusa/covers/` | **446** | **9.6M** |
| mirror `assets/avatars/` | **493** | （已同步） |
| mirror `assets/covers/` | **446** | （已同步） |

### 3.3 引用 vs 本地

| 项 | 数字 |
|----|------|
| avatar：引用 493 − 本地 493 | **缺 0** |
| cover：非空引用 450 − 本地 446 | **缺 4** |

### 3.4 缺失清单

- 头像：无（`missing-avatars.txt` 为空）
- 封面全量：`/workspace/nv-pu-sa/docs/missing-covers.txt`（同份在 `mirror/` 与 `data/nvpusa/`）

| handle | key | 原因 |
|--------|-----|------|
| Limokkii | covers/Limokkii_banner.jpg | R2=404；twimg=403 |
| QuQi318 | covers/QuQi318_banner.jpg | R2=404；twimg=403 |
| xiaomeicding | covers/xiaomeicding_banner.jpg | R2=404；twimg=403 |
| Zorayife | covers/Zorayife_banner.jpg | R2=404；twimg=403 |

`archive.local.json` 中这 4 条仍保留原始 HTTPS，页面需 onerror / placeholder。

### 3.5 本轮补采摘要

| 步骤 | 结果 |
|------|------|
| R2 并发（32）拉缺封面 + 9 头像 | 封面 +217；头像 +8（Limokkii R2 404） |
| twimg 回退（24） | 封面 +208；头像 Limokkii 成功 → 头像全齐 |
| 仍失败 | 封面 4（见上表） |

---

## 4. 与 R2 archive 的 diff

| 项 | 数字 |
|----|------|
| 仅本地有（id） | **0** |
| 仅线上有（id） | **0** |
| 仅本地有（screen_name） | **0** |
| 仅线上有（screen_name） | **0** |
| id 相同但 screen_name 不一致 | **0** |
| 条数差 | **0** |

**handle 全集重合。**

---

## 5. `/nvpusa/` 交付目录

| 项 | 状态 |
|----|------|
| 路径命名 | 已用 **`nvpusa`**（`/home/box/collection-wall/data/nvpusa/`）；墙仓侧无 `nv-pu-sa` |
| 目录树 | `archive.json` · `archive.local.json` · `avatars/` · `covers/` · `README.md` · `missing-*.txt` |
| 总体积 | **24M**（avatars 13M + covers 9.6M + JSON ~0.7M） |
| `archive.local.json` | avatar 本地路径 **493**；cover 本地路径 **446**；cover HTTPS 残留 **4**；cover 空 **43** |

```text
data/nvpusa/
├── README.md
├── archive.json          # 493，与线上一致
├── archive.local.json    # 页面用
├── avatars/              # 493
├── covers/               # 446
├── missing-avatars.txt   # 空
└── missing-covers.txt    # 4 行
```

站点同步约定（供 code Bot）：

```text
data/nvpusa/avatars/*  →  site/public/nvpusa/avatars/*
data/nvpusa/covers/*   →  site/public/nvpusa/covers/*
```

---

## 数字速查（回 cy）

1. archive：**493 = 493**，差 **0**，仅本地/仅线上 **0/0**
2. 缺 screen_name/name/x 链接：**0 / 0 / 0**
3. 头像本地 **493**（缺 **0**）；封面本地 **446** / 引用 **450**（空 **43**，缺 **4**）
4. R2 diff：仅本地 **0** / 仅线上 **0** / 条数差 **0**
5. 交付目录 `data/nvpusa/` 已整理，**24M**

**结论：可交接 code Bot**
