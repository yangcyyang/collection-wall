import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const xianyuDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../data/xianyu");
const demandsFile = resolve(xianyuDir, "demands.json");
const missingFile = "/tmp/collection-wall-xianyu-missing.json";

import {
  demandsByLane,
  getDemandById,
  getDemands,
  getDemandsFeed,
  xianyuConfidenceLabel,
  xianyuKindLabel,
  xianyuLane,
  xianyuLaneLabel,
  xianyuLaneSections,
  xianyuStatusClass,
  xianyuStatusLabel,
} from "../src/lib/xianyu.mjs";

const TREND_IDS = [
  "want-kaobei-prompt",
  "want-ai-daizuo",
  "signal-prompt-keyword-blocked",
  "book-ai-duanju-bundle",
  "book-ai-manju",
  "book-ai-jichu-qinghua",
  "book-ai-chuangfu",
  "book-aigc-illustration",
  "mj-prompt-fashion",
];
const HOT_IDS = [
  "mj-prompt-pack-1yuan",
  "mj-daichong-60",
  "mj-daichong-78",
  "mj-daioutu-9p9",
  "mj-pinch-week-15",
  "mj-pinch-month-46",
  "mj-daypass-4",
];

const emptySummary = {
  top_demands: [],
  price_bands: [],
  gaps: [],
  trend_highlights: [],
  hot_highlights: [],
};

test("缺失闲鱼 JSON 时返回空 feed / 空数组 / null，不抛错", async () => {
  const feed = await getDemandsFeed(missingFile);
  assert.deepEqual(feed.items, []);
  assert.equal(feed.count, 0);
  assert.deepEqual(feed.summary, emptySummary);
  assert.deepEqual(await getDemands(missingFile), []);
  assert.equal(await getDemandById("any-id", missingFile), null);
});

test("读取 data/xianyu/demands.json 契约，不硬编码条目", async () => {
  const raw = JSON.parse(await readFile(demandsFile, "utf8"));
  assert.equal(raw.source, "xianyu-ai-demand");
  assert.equal(raw.title, "闲鱼 AI 需求雷达");
  assert.ok(typeof raw.updated_at === "string");
  assert.ok(Array.isArray(raw.items));
  assert.equal(raw.count, raw.items.length);
  assert.ok(raw.summary && typeof raw.summary === "object");
  assert.ok(Array.isArray(raw.summary.top_demands));
  assert.ok(Array.isArray(raw.summary.price_bands));
  assert.ok(Array.isArray(raw.summary.gaps));
  assert.ok(Array.isArray(raw.summary.trend_highlights));
  assert.ok(Array.isArray(raw.summary.hot_highlights));
  assert.ok(raw.items.length > 0);
  assert.ok(raw.items.every((item) => item.lane === "trend" || item.lane === "hot"));
  assert.deepEqual(
    raw.items.filter((item) => item.lane === "trend").map((item) => item.id),
    TREND_IDS,
  );
  assert.deepEqual(
    raw.items.filter((item) => item.lane === "hot").map((item) => item.id),
    HOT_IDS,
  );
  assert.ok(raw.items.filter((item) => item.lane === "trend").every((item) => item.status !== "hot"));
  assert.ok(raw.items.filter((item) => item.lane === "hot").every((item) => item.status === "hot"));

  const feed = await getDemandsFeed(demandsFile);
  assert.equal(feed.source, raw.source);
  assert.equal(feed.title, raw.title);
  assert.equal(feed.count, raw.items.length);
  assert.deepEqual(feed.items, raw.items);
  assert.deepEqual(feed.summary.trend_highlights, raw.summary.trend_highlights);
  assert.deepEqual(feed.summary.hot_highlights, raw.summary.hot_highlights);
});

test("getDemandById 按 id 取需求，未知 id 为 null", async () => {
  const dir = await mkdtemp(join(tmpdir(), "xianyu-"));
  const file = join(dir, "demands.json");
  await writeFile(
    file,
    JSON.stringify({
      source: "xianyu-ai-demand",
      title: "闲鱼 AI 需求雷达",
      updated_at: "2026-09-03T12:00:00+08:00",
      count: 1,
      summary: { top_demands: [], price_bands: [], gaps: [] },
      items: [{ id: "ai-prompt-pack", title: "AI 提示词打包", kind: "goods", score: 80 }],
    }),
    "utf8",
  );
  const item = await getDemandById("ai-prompt-pack", file);
  assert.equal(item?.id, "ai-prompt-pack");
  assert.equal(item?.title, "AI 提示词打包");
  assert.equal(await getDemandById("does-not-exist", file), null);
});

test("闲鱼列表页用按钮打开弹层，不链到 /xianyu/{id}/", async () => {
  const page = await readFile(new URL("../src/pages/xianyu.astro", import.meta.url), "utf8");
  const lib = await readFile(new URL("../src/lib/xianyu.mjs", import.meta.url), "utf8");
  const viewer = await readFile(new URL("../src/components/XianyuViewer.astro", import.meta.url), "utf8");
  const nav = await readFile(new URL("../src/components/SiteNav.astro", import.meta.url), "utf8");
  const login = await readFile(new URL("../src/pages/login.astro", import.meta.url), "utf8");
  assert.match(nav, /闲鱼/);
  assert.match(nav, /\/xianyu\//);
  assert.match(login, /闲鱼/);
  assert.match(page, /data-xianyu-open/);
  assert.match(page, /暂时没有闲鱼需求/);
  assert.match(page, /xianyuLaneSections/);
  assert.match(lib, /趋势/);
  assert.match(lib, /热门/);
  assert.match(lib, /暂时没有趋势信号/);
  assert.match(lib, /暂时没有热门商品/);
  assert.match(page, /data\/xianyu/);
  assert.doesNotMatch(page, /href=\{`\/xianyu\/\$\{item\.id\}\/`\}/);
  assert.match(viewer, /data-xianyu-viewer/);
  assert.match(viewer, /data-xianyu-template/);
});

test("lane 以显式字段为准，缺省时按 emerging/want → 趋势、hot → 热门", () => {
  assert.equal(xianyuLane({ lane: "trend", status: "hot", kind: "goods" }), "trend");
  assert.equal(xianyuLane({ lane: "hot", status: "emerging", kind: "want" }), "hot");
  assert.equal(xianyuLane({ status: "emerging", kind: "goods" }), "trend");
  assert.equal(xianyuLane({ status: "hot", kind: "want" }), "trend");
  assert.equal(xianyuLane({ status: "hot", kind: "account" }), "hot");
  assert.equal(xianyuLane({ status: "stable", kind: "goods" }), "trend");
  assert.equal(xianyuLane({}), "trend");
  assert.equal(xianyuLaneLabel("trend"), "趋势");
  assert.equal(xianyuLaneLabel("hot"), "热门");
  assert.equal(xianyuLaneLabel("other"), "other");
});

test("xianyuLaneSections 始终返回趋势/热门两节，空栏 items 为空", () => {
  const onlyHot = [{ id: "a", lane: "hot", score: 90 }];
  const sections = xianyuLaneSections(onlyHot, {
    trend_highlights: ["求购起来了"],
    hot_highlights: ["代充爆了"],
  });
  assert.deepEqual(
    sections.map((section) => ({ id: section.id, title: section.title, ids: section.items.map((item) => item.id) })),
    [
      { id: "trend", title: "趋势", ids: [] },
      { id: "hot", title: "热门", ids: ["a"] },
    ],
  );
  assert.deepEqual(sections[0].highlights, ["求购起来了"]);
  assert.deepEqual(sections[1].highlights, ["代充爆了"]);
  assert.deepEqual(xianyuLaneSections([]).map((section) => section.items.length), [0, 0]);
});

test("demandsByLane 按 lane 分组，保持原顺序", () => {
  const items = [
    { id: "a", lane: "hot", score: 1 },
    { id: "b", lane: "trend", score: 2 },
    { id: "c", status: "emerging", score: 3 },
    { id: "d", status: "hot", kind: "account", score: 4 },
  ];
  assert.deepEqual(
    demandsByLane(items, "trend").map((item) => item.id),
    ["b", "c"],
  );
  assert.deepEqual(
    demandsByLane(items, "hot").map((item) => item.id),
    ["a", "d"],
  );
  assert.deepEqual(demandsByLane([], "trend"), []);
  assert.deepEqual(demandsByLane(undefined, "hot"), []);
});

test("闲鱼状态 / 置信度 / 类目展示映射为中文，未知值原样返回", () => {
  assert.equal(xianyuStatusLabel("emerging"), "新兴");
  assert.equal(xianyuStatusLabel("hot"), "热门");
  assert.equal(xianyuStatusLabel("stable"), "稳定");
  assert.equal(xianyuStatusLabel("cooling"), "降温");
  assert.equal(xianyuStatusLabel("unexpected"), "unexpected");
  assert.equal(xianyuStatusLabel(""), "");
  assert.equal(xianyuConfidenceLabel("high"), "高");
  assert.equal(xianyuConfidenceLabel("medium"), "中");
  assert.equal(xianyuConfidenceLabel("low"), "低");
  assert.equal(xianyuConfidenceLabel("unknown"), "unknown");
  assert.equal(xianyuKindLabel("want"), "求购");
  assert.equal(xianyuKindLabel("service"), "服务");
  assert.equal(xianyuKindLabel("account"), "账号");
  assert.equal(xianyuKindLabel("course"), "课程");
  assert.equal(xianyuKindLabel("goods"), "商品");
  assert.equal(xianyuKindLabel("other"), "其他");
  assert.equal(xianyuKindLabel("weird"), "weird");
});

test("闲鱼状态样式复用雷达徽章语义", () => {
  assert.equal(xianyuStatusClass("emerging"), "new");
  assert.equal(xianyuStatusClass("hot"), "frequent");
  assert.equal(xianyuStatusClass("stable"), "common");
  assert.equal(xianyuStatusClass("cooling"), "occasional");
  assert.equal(xianyuStatusClass("other"), "occasional");
});

test("损坏的 JSON 与空 items 不让站点崩", async () => {
  const dir = await mkdtemp(join(tmpdir(), "xianyu-"));
  const broken = join(dir, "broken.json");
  const empty = join(dir, "empty.json");
  await writeFile(broken, "{not-json", "utf8");
  await writeFile(empty, JSON.stringify({ title: "x" }), "utf8");
  assert.deepEqual(await getDemands(broken), []);
  const emptyFeed = await getDemandsFeed(empty);
  assert.deepEqual(emptyFeed.items, []);
  assert.deepEqual(emptyFeed.summary.top_demands, []);
});

test("构建产物 /xianyu/ 空状态可用，详情走弹层", async (t) => {
  const distFile = new URL("../dist/xianyu/index.html", import.meta.url);
  let html;
  try {
    html = await readFile(distFile, "utf8");
  } catch {
    t.skip("尚未执行 site build");
    return;
  }
  assert.match(html, /闲鱼/);
  assert.match(html, /趋势/);
  assert.match(html, /热门/);
  assert.match(html, /data-xianyu-viewer/);
  assert.doesNotMatch(html, /href="\/xianyu\/[^"/]+\/"/);
  assert.match(html, /data-xianyu-open/);
  assert.match(html, /id="xianyu-trend-title"/);
  assert.match(html, /id="xianyu-hot-title"/);
});
