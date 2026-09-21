import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const linuxdoDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../data/linuxdo");
const digestFile = resolve(linuxdoDir, "digest.json");
const datedFile = resolve(linuxdoDir, "2026-09-21.json");
const missingFile = "/tmp/collection-wall-linuxdo-missing.json";

import {
  getDigestFeed,
  getItemById,
  getItems,
  getRecentReportDates,
  hasDigestContent,
  itemsByGroup,
  linuxdoLikesLabel,
  linuxdoViewsLabel,
} from "../src/lib/linuxdo.mjs";
import {
  DISMISS_KEY_PREFIX,
  dismissSelected,
  dismissedStorageKey,
  filterVisibleItems,
  hiddenCountLabel,
  readDismissedIds,
  restoreDismissed,
  writeDismissedIds,
} from "../src/lib/linuxdo-dismiss.mjs";

function memoryStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
    keys: () => [...store.keys()],
  };
}

const emptyFeed = {
  source: "",
  title: "",
  date: "",
  updated_at: "",
  count: 0,
  hot: [],
  share: [],
  items: [],
};

test("缺失 linux.do JSON 时返回空 feed / 空数组 / null，不抛错", async () => {
  const feed = await getDigestFeed(missingFile);
  assert.deepEqual(feed, emptyFeed);
  assert.deepEqual(await getItems(missingFile), []);
  assert.equal(await getItemById(2928990, missingFile), null);
  assert.equal(hasDigestContent(feed), false);
});

test("读取 data/linuxdo/digest.json 契约，不硬编码条目", async () => {
  const raw = JSON.parse(await readFile(digestFile, "utf8"));
  assert.equal(raw.source, "linuxdo-frontier");
  assert.equal(raw.title, "linux.do 热门前沿分享");
  assert.equal(raw.date, "2026-09-21");
  assert.ok(typeof raw.updated_at === "string");
  assert.ok(Array.isArray(raw.hot));
  assert.ok(Array.isArray(raw.share));
  assert.ok(Array.isArray(raw.items));
  assert.equal(raw.count, raw.items.length);
  assert.equal(raw.items.length, raw.hot.length + raw.share.length);

  for (const item of raw.items) {
    assert.equal(typeof item.id, "number");
    assert.match(item.group, /^(hot|share)$/);
    assert.equal(typeof item.title, "string");
    assert.ok(item.title.length > 0);
    assert.equal(typeof item.likes, "number");
    assert.equal(typeof item.views, "number");
    assert.equal(typeof item.why, "string");
    assert.match(item.url, /^https:\/\/linux\.do\/t\/topic\/\d+$/);
  }

  const feed = await getDigestFeed(digestFile);
  assert.equal(feed.source, raw.source);
  assert.equal(feed.title, raw.title);
  assert.equal(feed.date, raw.date);
  assert.equal(feed.updated_at, raw.updated_at);
  assert.equal(feed.count, raw.items.length);
  assert.equal(feed.items.length, raw.items.length);
  assert.equal(feed.hot.length, raw.hot.length);
  assert.equal(feed.share.length, raw.share.length);
  assert.equal(hasDigestContent(feed), true);
  assert.equal(String(feed.items[0].id), String(raw.items[0].id));
});

test("按日归档 2026-09-21.json 与 digest 同结构", async () => {
  const digest = JSON.parse(await readFile(digestFile, "utf8"));
  const dated = JSON.parse(await readFile(datedFile, "utf8"));
  assert.equal(dated.date, "2026-09-21");
  assert.equal(dated.source, digest.source);
  assert.equal(dated.count, digest.count);
  assert.equal(dated.items.length, digest.items.length);
});

test("getItemById 按 topic id 取值，未知 id 为 null", async () => {
  const dir = await mkdtemp(join(tmpdir(), "linuxdo-"));
  const file = join(dir, "digest.json");
  await writeFile(
    file,
    JSON.stringify({
      source: "linuxdo-frontier",
      title: "linux.do 热门前沿分享",
      date: "2026-09-21",
      updated_at: "2026-09-21T10:43:00+08:00",
      count: 1,
      hot: [{ id: 2928990, group: "hot", title: "ZCode", likes: 492, views: 4426, why: "开源", url: "https://linux.do/t/topic/2928990" }],
      share: [],
      items: [{ id: 2928990, group: "hot", title: "ZCode", likes: 492, views: 4426, why: "开源", url: "https://linux.do/t/topic/2928990" }],
    }),
    "utf8",
  );
  const item = await getItemById(2928990, file);
  assert.equal(String(item?.id), "2928990");
  assert.equal(item?.title, "ZCode");
  assert.equal(item?.likes, 492);
  assert.equal(await getItemById("does-not-exist", file), null);
});

test("可选字段缺失时仍能规范化条目；items 空时回退 hot+share", async () => {
  const dir = await mkdtemp(join(tmpdir(), "linuxdo-"));
  const file = join(dir, "digest.json");
  await writeFile(
    file,
    JSON.stringify({
      title: "x",
      hot: [{ id: 1, title: "热门" }],
      share: [{ id: 2, title: "分享" }],
    }),
    "utf8",
  );
  const feed = await getDigestFeed(file);
  assert.equal(feed.items.length, 2);
  assert.equal(feed.hot[0].group, "hot");
  assert.equal(feed.share[0].group, "share");
  assert.equal(feed.items[0].why, "");
  assert.equal(feed.items[0].likes, null);
  assert.equal(feed.items[0].views, null);
  assert.equal(feed.items[0].url, "");
  assert.equal(feed.count, 2);
});

test("损坏的 JSON 与空 items 不让站点崩，空 items 视为整页空状态", async () => {
  const dir = await mkdtemp(join(tmpdir(), "linuxdo-"));
  const broken = join(dir, "broken.json");
  const empty = join(dir, "empty.json");
  await writeFile(broken, "{not-json", "utf8");
  await writeFile(empty, JSON.stringify({ title: "x", hot: [], share: [], items: [] }), "utf8");
  assert.deepEqual(await getItems(broken), []);
  const emptyFeed = await getDigestFeed(empty);
  assert.deepEqual(emptyFeed.items, []);
  assert.equal(hasDigestContent(emptyFeed), false);
});

test("可选按日归档文件按日期倒序列出，不影响主报告", async () => {
  const dir = await mkdtemp(join(tmpdir(), "linuxdo-dates-"));
  await writeFile(join(dir, "digest.json"), JSON.stringify({ title: "latest" }), "utf8");
  await writeFile(join(dir, "2026-09-01.json"), JSON.stringify({ date: "2026-09-01" }), "utf8");
  await writeFile(join(dir, "2026-09-21.json"), JSON.stringify({ date: "2026-09-21" }), "utf8");
  await writeFile(join(dir, "notes.txt"), "ignore", "utf8");
  await mkdir(join(dir, "nested"), { recursive: true });
  assert.deepEqual(await getRecentReportDates(dir), ["2026-09-21", "2026-09-01"]);
  assert.deepEqual(await getRecentReportDates(join(dir, "no-such-dir")), []);
});

test("点赞浏览标签与分组过滤", () => {
  assert.equal(linuxdoLikesLabel(null), "");
  assert.equal(linuxdoLikesLabel(""), "");
  assert.equal(linuxdoLikesLabel(0), "0 赞");
  assert.equal(linuxdoLikesLabel(492), "492 赞");
  assert.equal(linuxdoViewsLabel(4426), "4426 浏览");
  assert.equal(linuxdoViewsLabel(null), "");
  const grouped = itemsByGroup([
    { id: "1", group: "hot" },
    { id: "2", group: "share" },
    { id: "3", group: "hot" },
  ]);
  assert.deepEqual(grouped.hot.map((item) => item.id), ["1", "3"]);
  assert.deepEqual(grouped.share.map((item) => item.id), ["2"]);
});

test("dismiss 按日期写入 localStorage，刷新后仍过滤", () => {
  const storage = memoryStorage();
  assert.equal(dismissedStorageKey("2026-09-21"), `${DISMISS_KEY_PREFIX}:2026-09-21`);
  assert.deepEqual(readDismissedIds(storage, "2026-09-21"), []);

  const after = dismissSelected(storage, "2026-09-21", [2928990, "2925970"]);
  assert.deepEqual(after, ["2928990", "2925970"]);
  assert.deepEqual(readDismissedIds(storage, "2026-09-21"), ["2928990", "2925970"]);
  assert.deepEqual(readDismissedIds(storage, "2026-09-22"), []);

  const merged = dismissSelected(storage, "2026-09-21", ["2928990", 2927016]);
  assert.deepEqual(merged, ["2928990", "2925970", "2927016"]);

  const items = [
    { id: 2928990, title: "a" },
    { id: "2925970", title: "b" },
    { id: 2927016, title: "c" },
    { id: 2925213, title: "d" },
  ];
  assert.deepEqual(filterVisibleItems(items, merged).map((item) => String(item.id)), ["2925213"]);
  assert.equal(hiddenCountLabel(merged.length), "已隐藏 3 条");

  assert.deepEqual(restoreDismissed(storage, "2026-09-21"), []);
  assert.deepEqual(readDismissedIds(storage, "2026-09-21"), []);
  assert.equal(storage.keys().includes(`${DISMISS_KEY_PREFIX}:2026-09-21`), false);
});

test("损坏或非数组的 dismiss 记录视为空，不抛错", () => {
  const storage = memoryStorage({
    [`${DISMISS_KEY_PREFIX}:2026-09-21`]: "{not-json",
  });
  assert.deepEqual(readDismissedIds(storage, "2026-09-21"), []);
  writeDismissedIds(storage, "2026-09-21", ["1"]);
  storage.setItem(`${DISMISS_KEY_PREFIX}:2026-09-21`, JSON.stringify({ id: 1 }));
  assert.deepEqual(readDismissedIds(storage, "2026-09-21"), []);
});

test("列表页有两组分区、勾选移除工具条，不生成子路由", async () => {
  const page = await readFile(new URL("../src/pages/linuxdo.astro", import.meta.url), "utf8");
  const nav = await readFile(new URL("../src/components/SiteNav.astro", import.meta.url), "utf8");
  const login = await readFile(new URL("../src/pages/login.astro", import.meta.url), "utf8");
  assert.match(nav, /linux\.do/);
  assert.match(nav, /\/linuxdo\//);
  assert.match(nav, /current: .*linuxdo/);
  assert.match(login, /linux\.do/);
  assert.match(page, /今日热门/);
  assert.match(page, /值得看的分享/);
  assert.match(page, /移除所选/);
  assert.match(page, /恢复已移除/);
  assert.match(page, /data-linuxdo-card/);
  assert.match(page, /data-linuxdo-check/);
  assert.match(page, /data-linuxdo-remove/);
  assert.match(page, /data-linuxdo-restore/);
  assert.match(page, /linuxdo-frontier-dismissed/);
  assert.match(page, /data\/linuxdo/);
  assert.match(page, /digest\.json/);
  assert.match(page, /getRecentReportDates/);
  assert.match(page, /LogoutControl/);
  assert.doesNotMatch(page, /getStaticPaths/);
  assert.doesNotMatch(page, /href=\{`\/linuxdo\/\$\{item\.id\}\/`\}/);
});

test("构建产物 /linuxdo/ 展示 9/21 digest，无按日子页", async (t) => {
  const distFile = new URL("../dist/linuxdo/index.html", import.meta.url);
  let html;
  try {
    html = await readFile(distFile, "utf8");
  } catch {
    t.skip("尚未执行 site build");
    return;
  }
  assert.match(html, /linux\.do 热门前沿分享/);
  assert.match(html, /今日热门/);
  assert.match(html, /值得看的分享/);
  assert.match(html, /ZCode已在Github开源/);
  assert.match(html, /加州理工团队把Qwen3\.8/);
  assert.match(html, /移除所选/);
  assert.match(html, /https:\/\/linux\.do\/t\/topic\/2928990/);
  assert.doesNotMatch(html, /href="\/linuxdo\/[^"/]+\/"/);
});
