import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const sidehustleDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../data/sidehustle");
const radarFile = resolve(sidehustleDir, "radar.json");
const missingFile = "/tmp/collection-wall-sidehustle-missing.json";

import {
  getRecentReportDates,
  getSectionItems,
  getSidehustleFeed,
  getSidehustleItemById,
  hasReportContent,
  SECTION_KEYS,
  SECTION_LABELS,
  sidehustleIndexLabel,
  sidehustleLevelClass,
  sidehustleLevelLabel,
  sidehustleModelClass,
  sidehustleModelLabel,
  sidehustleSignalClass,
  sidehustleSignalLabel,
} from "../src/lib/sidehustle.mjs";

const SECTION_KEY_LIST = [
  "opportunities",
  "new_demands",
  "pay_signals",
  "ai_leverage",
  "digital_products",
  "services",
  "content",
  "to_validate",
];

function emptySections() {
  return Object.fromEntries(SECTION_KEY_LIST.map((key) => [key, []]));
}

test("缺失副业 JSON 时返回空 feed / 空数组 / null，不抛错", async () => {
  const feed = await getSidehustleFeed(missingFile);
  assert.deepEqual(feed.sections.opportunities, []);
  assert.deepEqual(feed.sections.to_validate, []);
  assert.equal(feed.count, 0);
  assert.deepEqual(feed.summary, { today_judgement: [], top_signals: [] });
  assert.deepEqual(await getSectionItems("opportunities", missingFile), []);
  assert.equal(await getSidehustleItemById("any-id", missingFile), null);
  assert.equal(hasReportContent(feed), false);
});

test("读取 data/sidehustle/radar.json 契约，不硬编码条目", async () => {
  const raw = JSON.parse(await readFile(radarFile, "utf8"));
  assert.equal(raw.source, "xiaohongshu-sidehustle");
  assert.equal(raw.title, "小红书副业机会雷达");
  assert.ok(typeof raw.date === "string");
  assert.ok(typeof raw.updated_at === "string");
  assert.ok(raw.summary && typeof raw.summary === "object");
  assert.ok(Array.isArray(raw.summary.today_judgement));
  assert.ok(Array.isArray(raw.summary.top_signals));
  for (const key of SECTION_KEY_LIST) {
    assert.ok(Array.isArray(raw.sections[key]), key);
  }
  const feed = await getSidehustleFeed(radarFile);
  assert.equal(feed.source, raw.source);
  assert.equal(feed.title, raw.title);
  assert.equal(feed.date, raw.date);
  const total = SECTION_KEY_LIST.reduce((sum, key) => sum + raw.sections[key].length, 0);
  assert.equal(feed.count, total);
  assert.equal(raw.count, total);
});

test("getSidehustleItemById 按 id 取条目，未知 id 为 null", async () => {
  const dir = await mkdtemp(join(tmpdir(), "side-"));
  const file = join(dir, "radar.json");
  await writeFile(
    file,
    JSON.stringify({
      source: "xiaohongshu-sidehustle",
      title: "小红书副业机会雷达",
      date: "2026-09-03",
      updated_at: "2026-09-03T21:30:00+08:00",
      count: 1,
      summary: { today_judgement: [], top_signals: [] },
      sections: {
        ...emptySections(),
        opportunities: [{ id: "ai-ppt-service", title: "AI 做 PPT 代做", summary: "询价增多" }],
      },
    }),
    "utf8",
  );
  const item = await getSidehustleItemById("ai-ppt-service", file);
  assert.equal(item?.id, "ai-ppt-service");
  assert.equal(item?.title, "AI 做 PPT 代做");
  assert.equal(await getSidehustleItemById("does-not-exist", file), null);
  const feed = await getSidehustleFeed(file);
  assert.equal(hasReportContent(feed), true);
});

test("可选字段缺失时仍能规范化条目，不抛错", async () => {
  const dir = await mkdtemp(join(tmpdir(), "side-"));
  const file = join(dir, "radar.json");
  await writeFile(
    file,
    JSON.stringify({
      title: "x",
      sections: { opportunities: [{ id: "bare", title: "只有标题" }] },
    }),
    "utf8",
  );
  const item = await getSidehustleItemById("bare", file);
  assert.equal(item?.id, "bare");
  assert.equal(item?.title, "只有标题");
  assert.equal(item?.summary, "");
  assert.equal(item?.why, "");
  assert.equal(item?.result, "");
  assert.equal(item?.offer, "");
  assert.equal(item?.model, "");
  assert.equal(item?.ai_help, "");
  assert.equal(item?.start_cost, "");
  assert.equal(item?.delivery, "");
  assert.equal(item?.competition, "");
  assert.equal(item?.index, "");
  assert.deepEqual(item?.tags, []);
  assert.deepEqual(item?.evidence, []);
  const feed = await getSidehustleFeed(file);
  assert.deepEqual(feed.summary.today_judgement, []);
  assert.equal(feed.sections.to_validate.length, 0);
});

test("规范化保留副业扩展字段，evidence 裸字符串变成对象", async () => {
  const dir = await mkdtemp(join(tmpdir(), "side-"));
  const file = join(dir, "radar.json");
  await writeFile(
    file,
    JSON.stringify({
      title: "x",
      sections: {
        opportunities: [
          {
            id: "full-item",
            title: "AI 做 PPT 代做",
            summary: "职场汇报周高峰",
            why: "搜索与私信同时上涨",
            audience: "不会做 PPT 的职场人",
            result: "可编辑 PPT 源文件",
            offer: "24 小时出 20 页",
            model: "service",
            ai_help: "用 Skill 套模板",
            start_cost: "low",
            delivery: "mid",
            competition: "high",
            index: 22,
            tags: ["PPT", "代做"],
            signal_strength: "strong",
            evidence: ["裸字符串不应保留", { url: "https://x.com/a", title: "笔记", note: "询价" }],
            first_detected: "2026-09-01T12:00:00+08:00",
            last_updated: "2026-09-03T21:30:00+08:00",
          },
        ],
      },
    }),
    "utf8",
  );
  const item = await getSidehustleItemById("full-item", file);
  assert.equal(item?.why, "搜索与私信同时上涨");
  assert.equal(item?.audience, "不会做 PPT 的职场人");
  assert.equal(item?.result, "可编辑 PPT 源文件");
  assert.equal(item?.offer, "24 小时出 20 页");
  assert.equal(item?.model, "service");
  assert.equal(item?.ai_help, "用 Skill 套模板");
  assert.equal(item?.start_cost, "low");
  assert.equal(item?.delivery, "mid");
  assert.equal(item?.competition, "high");
  assert.equal(item?.index, 22);
  assert.deepEqual(item?.tags, ["PPT", "代做"]);
  assert.equal(item?.signal_strength, "strong");
  assert.equal(item?.evidence.length, 2);
  assert.deepEqual(item?.evidence[0], { url: "", title: "", note: "裸字符串不应保留" });
  assert.deepEqual(item?.evidence[1], { url: "https://x.com/a", title: "笔记", note: "询价" });
  for (const entry of item.evidence) {
    assert.equal(typeof entry, "object");
    assert.ok(!Array.isArray(entry));
    assert.equal(typeof entry.url, "string");
  }
});

test("副业列表页用按钮打开弹层，不链到 /sidehustle/{id}/", async () => {
  const page = await readFile(new URL("../src/pages/sidehustle.astro", import.meta.url), "utf8");
  const viewer = await readFile(new URL("../src/components/SidehustleViewer.astro", import.meta.url), "utf8");
  const nav = await readFile(new URL("../src/components/SiteNav.astro", import.meta.url), "utf8");
  const login = await readFile(new URL("../src/pages/login.astro", import.meta.url), "utf8");
  assert.match(nav, /副业/);
  assert.match(nav, /\/sidehustle\//);
  assert.match(login, /副业/);
  assert.match(page, /data-side-open/);
  assert.match(page, /暂时没有副业雷达条目/);
  assert.match(page, /data\/sidehustle/);
  assert.match(page, /今日判断/);
  assert.match(page, /SECTION_LABELS/);
  assert.match(page, /\{section\.title\}/);
  assert.match(page, /is-opportunity/);
  assert.match(page, /is-validate/);
  assert.deepEqual(SECTION_KEYS, SECTION_KEY_LIST);
  assert.deepEqual(SECTION_LABELS, {
    opportunities: "今日副业机会",
    new_demands: "新增需求",
    pay_signals: "付费信号",
    ai_leverage: "AI 可提效的传统服务",
    digital_products: "数字产品",
    services: "接单服务",
    content: "内容账号",
    to_validate: "值得验证",
  });
  assert.doesNotMatch(page, /href=\{`\/sidehustle\/\$\{item\.id\}\/`\}/);
  assert.match(viewer, /data-side-viewer/);
  assert.match(viewer, /data-side-template/);
});

test("弹层与卡片展示副业扩展字段中文标签", async () => {
  const page = await readFile(new URL("../src/pages/sidehustle.astro", import.meta.url), "utf8");
  const viewer = await readFile(new URL("../src/components/SidehustleViewer.astro", import.meta.url), "utf8");
  assert.match(page, /sidehustleModelLabel/);
  assert.match(page, /sidehustleIndexLabel/);
  assert.match(page, /sidehustleLevelLabel/);
  assert.match(viewer, /为何值得关注/);
  assert.match(viewer, /目标人群/);
  assert.match(viewer, /交付结果/);
  assert.match(viewer, /卖点/);
  assert.match(viewer, /AI 如何提效/);
  assert.match(viewer, /起步成本/);
  assert.match(viewer, /交付难度/);
  assert.match(viewer, /竞争/);
  assert.match(viewer, /副业机会指数/);
  assert.match(viewer, /证据/);
  assert.match(viewer, /sidehustleModelLabel/);
  assert.match(viewer, /sidehustleIndexLabel/);
});

test("模式 / 成本等级 / 信号强度 / 指数展示映射为中文，未知值原样返回", () => {
  assert.equal(sidehustleModelLabel("service"), "卖服务");
  assert.equal(sidehustleModelLabel("digital"), "卖数字产品");
  assert.equal(sidehustleModelLabel("traffic"), "做流量");
  assert.equal(sidehustleModelLabel("unexpected"), "unexpected");
  assert.equal(sidehustleModelLabel(""), "");
  assert.equal(sidehustleLevelLabel("low"), "低");
  assert.equal(sidehustleLevelLabel("mid"), "中");
  assert.equal(sidehustleLevelLabel("high"), "高");
  assert.equal(sidehustleLevelLabel("unknown"), "unknown");
  assert.equal(sidehustleSignalLabel("strong"), "强");
  assert.equal(sidehustleSignalLabel("mid"), "中");
  assert.equal(sidehustleSignalLabel("weak"), "弱");
  assert.equal(sidehustleSignalLabel("unknown"), "unknown");
  assert.equal(sidehustleIndexLabel(22), "副业机会指数 22");
  assert.equal(sidehustleIndexLabel(""), "");
  assert.equal(sidehustleIndexLabel(0), "");
});

test("模式 / 成本等级 / 信号强度样式复用雷达徽章语义", () => {
  assert.equal(sidehustleModelClass("service"), "frequent");
  assert.equal(sidehustleModelClass("digital"), "common");
  assert.equal(sidehustleModelClass("traffic"), "new");
  assert.equal(sidehustleModelClass("other"), "occasional");
  assert.equal(sidehustleLevelClass("high"), "frequent");
  assert.equal(sidehustleLevelClass("mid"), "common");
  assert.equal(sidehustleLevelClass("low"), "occasional");
  assert.equal(sidehustleLevelClass("other"), "occasional");
  assert.equal(sidehustleSignalClass("strong"), "frequent");
  assert.equal(sidehustleSignalClass("mid"), "common");
  assert.equal(sidehustleSignalClass("weak"), "occasional");
  assert.equal(sidehustleSignalClass("other"), "occasional");
});

test("损坏的 JSON 与空 sections 不让站点崩", async () => {
  const dir = await mkdtemp(join(tmpdir(), "side-"));
  const broken = join(dir, "broken.json");
  const empty = join(dir, "empty.json");
  await writeFile(broken, "{not-json", "utf8");
  await writeFile(empty, JSON.stringify({ title: "x" }), "utf8");
  assert.deepEqual(await getSectionItems("opportunities", broken), []);
  const emptyFeed = await getSidehustleFeed(empty);
  assert.deepEqual(emptyFeed.sections.opportunities, []);
  assert.deepEqual(emptyFeed.summary.today_judgement, []);
  assert.equal(hasReportContent(emptyFeed), false);
});

test("可选按日归档文件按日期倒序列出，不影响主报告", async () => {
  const dir = await mkdtemp(join(tmpdir(), "side-dates-"));
  await writeFile(join(dir, "radar.json"), JSON.stringify({ title: "latest" }), "utf8");
  await writeFile(join(dir, "2026-09-01.json"), JSON.stringify({ date: "2026-09-01" }), "utf8");
  await writeFile(join(dir, "2026-09-03.json"), JSON.stringify({ date: "2026-09-03" }), "utf8");
  await writeFile(join(dir, "notes.txt"), "ignore", "utf8");
  await mkdir(join(dir, "nested"), { recursive: true });
  assert.deepEqual(await getRecentReportDates(dir), ["2026-09-03", "2026-09-01"]);
  const missing = await getRecentReportDates(join(dir, "no-such-dir"));
  assert.deepEqual(missing, []);
});

test("构建产物 /sidehustle/ 空状态可用，详情走弹层", async (t) => {
  const distFile = new URL("../dist/sidehustle/index.html", import.meta.url);
  let html;
  try {
    html = await readFile(distFile, "utf8");
  } catch {
    t.skip("尚未执行 site build");
    return;
  }
  assert.match(html, /副业/);
  assert.match(html, /暂时没有副业雷达条目/);
  assert.match(html, /data-side-viewer/);
  assert.doesNotMatch(html, /href="\/sidehustle\/[^"/]+\/"/);
});
