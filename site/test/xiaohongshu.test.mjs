import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const xiaohongshuDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../data/xiaohongshu");
const radarFile = resolve(xiaohongshuDir, "radar.json");
const missingFile = "/tmp/collection-wall-xiaohongshu-missing.json";

import {
  getRadarFeed,
  getRecentReportDates,
  getSectionItems,
  getXiaohongshuItemById,
  hasReportContent,
  SECTION_LABELS,
  xiaohongshuDirectionClass,
  xiaohongshuDirectionLabel,
  xiaohongshuSignalClass,
  xiaohongshuSignalLabel,
} from "../src/lib/xiaohongshu.mjs";

test("缺失小红书 JSON 时返回空 feed / 空数组 / null，不抛错", async () => {
  const feed = await getRadarFeed(missingFile);
  assert.deepEqual(feed.sections.hot, []);
  assert.deepEqual(feed.sections.trends, []);
  assert.equal(feed.count, 0);
  assert.deepEqual(feed.summary, { today_judgement: [], top_signals: [] });
  assert.deepEqual(feed.awareness, { dominant_level: "", fastest_growing: "", note: "" });
  assert.deepEqual(await getSectionItems("hot", missingFile), []);
  assert.equal(await getXiaohongshuItemById("any-id", missingFile), null);
  assert.equal(hasReportContent(feed), false);
});

test("读取 data/xiaohongshu/radar.json 契约，不硬编码条目", async () => {
  const raw = JSON.parse(await readFile(radarFile, "utf8"));
  assert.equal(raw.source, "xiaohongshu-ai-radar");
  assert.equal(raw.title, "小红书 AI 用户雷达");
  assert.ok(typeof raw.date === "string");
  assert.ok(typeof raw.updated_at === "string");
  assert.ok(raw.summary && typeof raw.summary === "object");
  assert.ok(Array.isArray(raw.summary.today_judgement));
  assert.ok(Array.isArray(raw.summary.top_signals));
  const keys = ["hot", "trends", "needs", "pains", "scenarios", "products", "content_opps", "product_opps", "biz_opps", "quotes"];
  for (const key of keys) {
    assert.ok(Array.isArray(raw.sections[key]), key);
  }
  assert.ok(raw.awareness && typeof raw.awareness === "object");

  const feed = await getRadarFeed(radarFile);
  assert.equal(feed.source, raw.source);
  assert.equal(feed.title, raw.title);
  assert.equal(feed.date, raw.date);
  const total = keys.reduce((sum, key) => sum + raw.sections[key].length, 0);
  assert.equal(feed.count, total);
  assert.equal(raw.count, total);
});

test("getXiaohongshuItemById 按 id 取条目，未知 id 为 null", async () => {
  const dir = await mkdtemp(join(tmpdir(), "xhs-"));
  const file = join(dir, "radar.json");
  await writeFile(
    file,
    JSON.stringify({
      source: "xiaohongshu-ai-radar",
      title: "小红书 AI 用户雷达",
      date: "2026-09-03",
      updated_at: "2026-09-03T21:30:00+08:00",
      count: 1,
      summary: { today_judgement: [], top_signals: [] },
      sections: {
        hot: [{ id: "ai-face-filter", title: "AI 修图滤镜", summary: "修图需求升温" }],
        trends: [],
        needs: [],
        pains: [],
        scenarios: [],
        products: [],
        content_opps: [],
        product_opps: [],
        biz_opps: [],
        quotes: [],
      },
      awareness: { dominant_level: "L2", fastest_growing: "", note: "" },
    }),
    "utf8",
  );
  const item = await getXiaohongshuItemById("ai-face-filter", file);
  assert.equal(item?.id, "ai-face-filter");
  assert.equal(item?.title, "AI 修图滤镜");
  assert.equal(await getXiaohongshuItemById("does-not-exist", file), null);
  const feed = await getRadarFeed(file);
  assert.equal(hasReportContent(feed), true);
});

test("可选字段缺失时仍能规范化条目，不抛错", async () => {
  const dir = await mkdtemp(join(tmpdir(), "xhs-"));
  const file = join(dir, "radar.json");
  await writeFile(
    file,
    JSON.stringify({
      title: "x",
      sections: { hot: [{ id: "bare", title: "只有标题" }] },
    }),
    "utf8",
  );
  const item = await getXiaohongshuItemById("bare", file);
  assert.equal(item?.id, "bare");
  assert.equal(item?.title, "只有标题");
  assert.equal(item?.summary, "");
  assert.deepEqual(item?.tags, []);
  assert.deepEqual(item?.evidence, []);
  const feed = await getRadarFeed(file);
  assert.deepEqual(feed.summary.today_judgement, []);
  assert.equal(feed.sections.trends.length, 0);
});

test("小红书列表页用按钮打开弹层，不链到 /xiaohongshu/{id}/", async () => {
  const page = await readFile(new URL("../src/pages/xiaohongshu.astro", import.meta.url), "utf8");
  const viewer = await readFile(new URL("../src/components/XiaohongshuViewer.astro", import.meta.url), "utf8");
  const nav = await readFile(new URL("../src/components/SiteNav.astro", import.meta.url), "utf8");
  const login = await readFile(new URL("../src/pages/login.astro", import.meta.url), "utf8");
  assert.match(nav, /小红书/);
  assert.match(nav, /\/xiaohongshu\//);
  assert.match(login, /小红书/);
  assert.match(page, /data-xhs-open/);
  assert.match(page, /暂时没有小红书雷达条目/);
  assert.match(page, /data\/xiaohongshu/);
  assert.match(page, /今日判断/);
  assert.match(page, /认知层级/);
  assert.match(page, /SECTION_LABELS/);
  assert.match(page, /\{section\.title\}/);
  assert.match(page, /is-hot/);
  assert.match(page, /is-trend/);
  assert.deepEqual(SECTION_LABELS, {
    hot: "热门",
    trends: "趋势",
    needs: "用户需求",
    pains: "用户痛点",
    scenarios: "使用场景",
    products: "AI 产品",
    content_opps: "内容机会",
    product_opps: "产品机会",
    biz_opps: "商业机会",
    quotes: "用户原话",
  });
  assert.doesNotMatch(page, /href=\{`\/xiaohongshu\/\$\{item\.id\}\/`\}/);
  assert.match(viewer, /data-xhs-viewer/);
  assert.match(viewer, /data-xhs-template/);
});

test("趋势方向与信号强度展示映射为中文，未知值原样返回", () => {
  assert.equal(xiaohongshuDirectionLabel("up_fast"), "快速上升");
  assert.equal(xiaohongshuDirectionLabel("up"), "缓慢上升");
  assert.equal(xiaohongshuDirectionLabel("flat"), "稳定");
  assert.equal(xiaohongshuDirectionLabel("down"), "下降");
  assert.equal(xiaohongshuDirectionLabel("new"), "新出现");
  assert.equal(xiaohongshuDirectionLabel("unexpected"), "unexpected");
  assert.equal(xiaohongshuDirectionLabel(""), "");
  assert.equal(xiaohongshuSignalLabel("strong"), "强");
  assert.equal(xiaohongshuSignalLabel("mid"), "中");
  assert.equal(xiaohongshuSignalLabel("weak"), "弱");
  assert.equal(xiaohongshuSignalLabel("unknown"), "unknown");
});

test("趋势方向与信号强度样式复用雷达徽章语义", () => {
  assert.equal(xiaohongshuDirectionClass("up_fast"), "frequent");
  assert.equal(xiaohongshuDirectionClass("up"), "new");
  assert.equal(xiaohongshuDirectionClass("flat"), "common");
  assert.equal(xiaohongshuDirectionClass("down"), "occasional");
  assert.equal(xiaohongshuDirectionClass("new"), "new");
  assert.equal(xiaohongshuDirectionClass("other"), "occasional");
  assert.equal(xiaohongshuSignalClass("strong"), "frequent");
  assert.equal(xiaohongshuSignalClass("mid"), "common");
  assert.equal(xiaohongshuSignalClass("weak"), "occasional");
  assert.equal(xiaohongshuSignalClass("other"), "occasional");
});

test("损坏的 JSON 与空 sections 不让站点崩", async () => {
  const dir = await mkdtemp(join(tmpdir(), "xhs-"));
  const broken = join(dir, "broken.json");
  const empty = join(dir, "empty.json");
  await writeFile(broken, "{not-json", "utf8");
  await writeFile(empty, JSON.stringify({ title: "x" }), "utf8");
  assert.deepEqual(await getSectionItems("hot", broken), []);
  const emptyFeed = await getRadarFeed(empty);
  assert.deepEqual(emptyFeed.sections.hot, []);
  assert.deepEqual(emptyFeed.summary.today_judgement, []);
  assert.equal(hasReportContent(emptyFeed), false);
});

test("可选按日归档文件按日期倒序列出，不影响主报告", async () => {
  const dir = await mkdtemp(join(tmpdir(), "xhs-dates-"));
  await writeFile(join(dir, "radar.json"), JSON.stringify({ title: "latest" }), "utf8");
  await writeFile(join(dir, "2026-09-01.json"), JSON.stringify({ date: "2026-09-01" }), "utf8");
  await writeFile(join(dir, "2026-09-03.json"), JSON.stringify({ date: "2026-09-03" }), "utf8");
  await writeFile(join(dir, "notes.txt"), "ignore", "utf8");
  await mkdir(join(dir, "nested"), { recursive: true });
  assert.deepEqual(await getRecentReportDates(dir), ["2026-09-03", "2026-09-01"]);
  const missing = await getRecentReportDates(join(dir, "no-such-dir"));
  assert.deepEqual(missing, []);
});

test("构建产物 /xiaohongshu/ 空状态可用，详情走弹层", async (t) => {
  const distFile = new URL("../dist/xiaohongshu/index.html", import.meta.url);
  let html;
  try {
    html = await readFile(distFile, "utf8");
  } catch {
    t.skip("尚未执行 site build");
    return;
  }
  assert.match(html, /小红书/);
  assert.match(html, /暂时没有小红书雷达条目/);
  assert.match(html, /data-xhs-viewer/);
  assert.doesNotMatch(html, /href="\/xiaohongshu\/[^"/]+\/"/);
});
