import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const radarDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../data/radar");
const signalsFile = resolve(radarDir, "signals.json");
const productsFile = resolve(radarDir, "products.json");
const watchlistFile = resolve(radarDir, "watchlist.json");

import {
  emergingSignals,
  getProductById,
  getProducts,
  getSignalById,
  getSignals,
  getWatchlist,
  getWatchlistById,
  homepageProducts,
  homepageSignals,
  radarConfidenceLabel,
  radarStatusLabel,
  relatedSignalLabels,
  sortEvidenceByDate,
} from "../src/lib/radar.mjs";

const missingFile = "/tmp/collection-wall-radar-missing.json";

test("缺失雷达 JSON 时返回空数组 / null，不抛错", async () => {
  assert.deepEqual(await getSignals(missingFile), []);
  assert.deepEqual(await getProducts(missingFile), []);
  assert.deepEqual(await getWatchlist(missingFile), []);
  assert.equal(await getSignalById("agent-persistent-computer", missingFile), null);
  assert.equal(await getProductById("beafk", missingFile), null);
});

test("读取 data/radar 契约文件，不硬编码条目", async () => {
  const signals = await getSignals(signalsFile);
  const products = await getProducts(productsFile);
  const watchlist = await getWatchlist(watchlistFile);
  assert.equal(signals.length, 7);
  assert.equal(products.length, 7);
  assert.equal(watchlist.length, 7);
  assert.ok(signals.every((item) => item.id && item.title && Array.isArray(item.evidence)));
  assert.ok(products.every((item) => item.id && item.name));
  assert.ok(watchlist.every((item) => item.id && item.title));
});

test("getSignalById 按 id 取信号，未知 id 为 null", async () => {
  const item = await getSignalById("agent-persistent-computer", signalsFile);
  assert.equal(item?.id, "agent-persistent-computer");
  assert.ok((item?.evidence?.length ?? 0) >= 1);
  assert.equal(await getSignalById("does-not-exist", signalsFile), null);
});

test("getWatchlistById 返回观察项本身，不是 related_signals[0]", async () => {
  const item = await getWatchlistById("agent-computer-category", watchlistFile);
  assert.equal(item?.id, "agent-computer-category");
  assert.equal(item?.title, "beafk、useagent、vicoa 谁先做出离开后还在跑");
  assert.ok(item?.why);
  assert.deepEqual(item?.related_signals, ["agent-persistent-computer"]);
  assert.notEqual(item?.id, item?.related_signals?.[0]);
  assert.equal(await getWatchlistById("does-not-exist", watchlistFile), null);
  assert.equal(await getWatchlistById("agent-computer-category", missingFile), null);
});

test("relatedSignalLabels 用信号标题展示，不生成详情路由", () => {
  const labels = relatedSignalLabels(
    ["agent-persistent-computer", "missing-id"],
    [{ id: "agent-persistent-computer", title: "智能体正在拥有自己的长期计算环境" }],
  );
  assert.deepEqual(labels, ["智能体正在拥有自己的长期计算环境", "missing-id"]);
  assert.ok(labels.every((label) => !String(label).includes("/radar/")));
});

test("雷达列表页用按钮打开弹层，不链到 /radar/{id}/", async () => {
  const page = await readFile(new URL("../src/pages/radar.astro", import.meta.url), "utf8");
  assert.match(page, /data-radar-open/);
  assert.doesNotMatch(page, /href=\{`\/radar\/\$\{item\.id\}\/`\}/);
  assert.doesNotMatch(page, /related_signals\?\.\[0\]/);
  assert.match(page, /今日强信号/);
  assert.match(page, /新产品/);
  assert.match(page, /新兴信号/);
  assert.match(page, /观察名单/);
});

test("homepageSignals 只保留 homepage===true，按 score 降序", () => {
  const ranked = homepageSignals([
    { id: "low", homepage: true, score: 10 },
    { id: "hidden", homepage: false, score: 99 },
    { id: "high", homepage: true, score: 80 },
  ]);
  assert.deepEqual(ranked.map((item) => item.id), ["high", "low"]);
});

test("homepageProducts 保留 homepage===true 或 status===new", () => {
  const shown = homepageProducts([
    { id: "home", homepage: true, status: "watching", score: 1 },
    { id: "fresh", homepage: false, status: "new", score: 2 },
    { id: "skip", homepage: false, status: "watching", score: 3 },
  ]);
  assert.deepEqual(shown.map((item) => item.id), ["fresh", "home"]);
});

test("emergingSignals 只保留 new / watching", () => {
  const shown = emergingSignals([
    { id: "n", status: "new" },
    { id: "w", status: "watching" },
    { id: "s", status: "strengthening" },
    { id: "c", status: "closed" },
  ]);
  assert.deepEqual(shown.map((item) => item.id), ["n", "w"]);
});

test("sortEvidenceByDate 按 date 升序，缺日期放最后", () => {
  const sorted = sortEvidenceByDate([
    { url: "b", date: "2026-08-30T00:00:00+08:00" },
    { url: "c" },
    { url: "a", date: "2026-08-29T00:00:00+08:00" },
  ]);
  assert.deepEqual(sorted.map((item) => item.url), ["a", "b", "c"]);
});

test("雷达状态展示映射为中文，未知值原样返回", () => {
  assert.equal(radarStatusLabel("new"), "新发现");
  assert.equal(radarStatusLabel("watching"), "观察中");
  assert.equal(radarStatusLabel("strengthening"), "加强中");
  assert.equal(radarStatusLabel("weakening"), "减弱中");
  assert.equal(radarStatusLabel("confirmed_trend"), "已成趋势");
  assert.equal(radarStatusLabel("closed"), "已关闭");
  assert.equal(radarStatusLabel("unexpected"), "unexpected");
  assert.equal(radarStatusLabel(""), "");
});

test("雷达置信度展示映射为中文，未知值原样返回", () => {
  assert.equal(radarConfidenceLabel("high"), "高");
  assert.equal(radarConfidenceLabel("medium"), "中");
  assert.equal(radarConfidenceLabel("low"), "低");
  assert.equal(radarConfidenceLabel("unknown"), "unknown");
});

test("data/radar JSON 状态与置信度仍是英文枚举", async () => {
  const allowedStatus = new Set(["new", "watching", "strengthening", "weakening", "confirmed_trend", "closed"]);
  const allowedConfidence = new Set(["high", "medium", "low"]);
  const signals = await getSignals(signalsFile);
  const products = await getProducts(productsFile);
  const watchlist = await getWatchlist(watchlistFile);
  for (const item of [...signals, ...products, ...watchlist]) {
    assert.ok(allowedStatus.has(item.status), `${item.id} status ${item.status}`);
    if (item.confidence) {
      assert.ok(allowedConfidence.has(item.confidence), `${item.id} confidence ${item.confidence}`);
    }
  }
});

test("构建产物 /radar/ 用弹层展示详情，证据为外链", async (t) => {
  const distFile = new URL("../dist/radar/index.html", import.meta.url);
  let html;
  try {
    html = await readFile(distFile, "utf8");
  } catch {
    t.skip("尚未执行 site build");
    return;
  }
  assert.match(html, /data-radar-viewer/);
  assert.match(html, /data-radar-key="signal:agent-persistent-computer"/);
  assert.match(html, /data-radar-key="watch:agent-computer-category"/);
  assert.match(html, /https:\/\/beafk\.app/);
  assert.match(html, /加强中/);
  assert.match(html, /今日强信号/);
  assert.match(html, /新产品/);
  assert.match(html, /新兴信号/);
  assert.match(html, /观察名单/);
  assert.doesNotMatch(html, /href="\/radar\/[^"]+"/);
});

test("损坏的 JSON 与空 items 不让站点崩", async () => {
  const dir = await mkdtemp(join(tmpdir(), "radar-"));
  const broken = join(dir, "broken.json");
  const empty = join(dir, "empty.json");
  await writeFile(broken, "{not-json", "utf8");
  await writeFile(empty, JSON.stringify({ title: "x" }), "utf8");
  assert.deepEqual(await getSignals(broken), []);
  assert.deepEqual(await getSignals(empty), []);
});
