import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFeed,
  categoryFilters,
  collectAihot,
  dedupItems,
  emptyFeed,
  formatBeijingClock,
  formatBeijingDateTime,
  formatNewsDayLabel,
  groupNewsDays,
  mapApiItem,
  parseNewsFeed,
} from "../src/lib/news.mjs";

const SAMPLE_API_ITEM = {
  id: "cmtd83hb4018fro667i1tbc34",
  title: "Anthropic 让 Claude 自主训练模型以缓解对齐失败",
  originalTitle: "Automated researchers can reliably mitigate alignment failures",
  summary: "Anthropic 让 Claude 自主训练模型，缓解欺骗、谄媚等 10 类对齐失败。",
  source: { name: "Anthropic：Research（发表成果 · 网页）" },
  links: {
    aihot: "https://aihot.virxact.com/items/cmtd83hb4018fro667i1tbc34",
    original: "https://www.anthropic.com/research/automated-researchers-mitigate-alignment-failures",
  },
  publishedAt: "2026-08-28T17:25:56.912Z",
  discoveredAt: "2026-08-28T17:25:56.912Z",
  category: "paper",
  score: 78,
  selected: true,
  reason: "自动化对齐研究把安全训练从一次性微调变成可迭代搜索。",
  attribution: { name: "AIHOT", url: "https://aihot.virxact.com/items/cmtd83hb4018fro667i1tbc34" },
};

test("mapApiItem 只保留约定字段，原文 summary/reason 不改写", () => {
  const item = mapApiItem(SAMPLE_API_ITEM);
  assert.deepEqual(item, {
    id: "cmtd83hb4018fro667i1tbc34",
    title: "Anthropic 让 Claude 自主训练模型以缓解对齐失败",
    category: "paper",
    source: "Anthropic：Research（发表成果 · 网页）",
    published_at: "2026-08-28T17:25:56.912Z",
    discovered_at: "2026-08-28T17:25:56.912Z",
    summary: "Anthropic 让 Claude 自主训练模型，缓解欺骗、谄媚等 10 类对齐失败。",
    reason: "自动化对齐研究把安全训练从一次性微调变成可迭代搜索。",
    links: {
      aihot: "https://aihot.virxact.com/items/cmtd83hb4018fro667i1tbc34",
      original: "https://www.anthropic.com/research/automated-researchers-mitigate-alignment-failures",
    },
  });
  assert.equal(Object.hasOwn(item, "originalTitle"), false);
  assert.equal(Object.hasOwn(item, "score"), false);
  assert.equal(Object.hasOwn(item, "selected"), false);
  assert.equal(Object.hasOwn(item, "attribution"), false);
});

test("mapApiItem 缺少 id 时丢弃，不编造条目", () => {
  assert.equal(mapApiItem({ title: "无 id 的头条" }), null);
  assert.equal(mapApiItem(null), null);
});

test("dedupItems 按 id 去重，保留先出现的一条", () => {
  const first = mapApiItem(SAMPLE_API_ITEM);
  const second = mapApiItem({
    ...SAMPLE_API_ITEM,
    title: "被去重的重复标题",
    reason: "不应出现",
  });
  const extra = mapApiItem({
    ...SAMPLE_API_ITEM,
    id: "other-id",
    title: "另一条",
  });
  assert.deepEqual(dedupItems([first, second, extra]).map((item) => item.id), [
    "cmtd83hb4018fro667i1tbc34",
    "other-id",
  ]);
  assert.equal(dedupItems([first, second])[0].title, first.title);
});

test("emptyFeed 是明确空态，不含假标题", () => {
  const feed = emptyFeed({ updated_at: "2026-08-28T18:00:00.000Z", error: "AIHOT 请求失败" });
  assert.equal(feed.source, "aihot");
  assert.equal(feed.count, 0);
  assert.deepEqual(feed.items, []);
  assert.equal(feed.error, "AIHOT 请求失败");
  assert.equal(JSON.stringify(feed.items), "[]");
});

test("buildFeed 写入 PromptSource 风格信封并按 id 去重", () => {
  const items = [mapApiItem(SAMPLE_API_ITEM), mapApiItem(SAMPLE_API_ITEM)];
  const feed = buildFeed({
    items,
    updated_at: "2026-08-28T18:00:00.000Z",
    daily: { date: "2026-08-28", title: "日报标题", url: "https://aihot.virxact.com/daily/2026-08-28" },
  });
  assert.equal(feed.source, "aihot");
  assert.equal(feed.title, "AIHOT 精选资讯");
  assert.equal(feed.updated_at, "2026-08-28T18:00:00.000Z");
  assert.equal(feed.count, 1);
  assert.equal(feed.items.length, 1);
  assert.equal(feed.daily.date, "2026-08-28");
});

test("formatBeijingDateTime 把 UTC 转成北京时间", () => {
  assert.equal(formatBeijingDateTime("2026-08-28T17:25:56.912Z"), "2026年8月29日 01:25");
  assert.equal(formatBeijingDateTime("2026-08-28T00:04:47.737Z"), "2026年8月28日 08:04");
  assert.equal(formatBeijingDateTime(""), "");
  assert.equal(formatBeijingDateTime("not-a-date"), "");
});

test("categoryFilters 按出现次数计数，未知分类保留原文", () => {
  const items = [
    { category: "paper" },
    { category: "paper" },
    { category: "ai-models" },
    { category: "brand-new" },
  ];
  assert.deepEqual(categoryFilters(items), [
    { category: "paper", label: "论文", count: 2 },
    { category: "ai-models", label: "模型", count: 1 },
    { category: "brand-new", label: "brand-new", count: 1 },
  ]);
});

test("collectAihot 映射精选条目并附带最新日报索引", async () => {
  const fetchFn = async (url) => {
    if (String(url).includes("/items")) {
      return {
        ok: true,
        json: async () => ({ items: [SAMPLE_API_ITEM] }),
      };
    }
    if (String(url).includes("/dailies?")) {
      return {
        ok: true,
        json: async () => ({
          items: [{
            date: "2026-08-28",
            leadTitle: "Gemini Omni 1.1 Flash 发布",
            links: { aihot: "https://aihot.virxact.com/daily/2026-08-28" },
          }],
        }),
      };
    }
    throw new Error(`unexpected url ${url}`);
  };

  const feed = await collectAihot({ fetchFn, now: new Date("2026-08-28T18:33:00Z") });
  assert.equal(feed.count, 1);
  assert.equal(feed.items[0].id, SAMPLE_API_ITEM.id);
  assert.equal(feed.items[0].reason, SAMPLE_API_ITEM.reason);
  assert.deepEqual(feed.daily, {
    date: "2026-08-28",
    title: "Gemini Omni 1.1 Flash 发布",
    url: "https://aihot.virxact.com/daily/2026-08-28",
  });
  assert.equal(feed.updated_at, "2026-08-28T18:33:00.000Z");
});

test("parseNewsFeed 遇到无效 JSON 结构时回落空态", () => {
  const feed = parseNewsFeed({ title: "不是列表" });
  assert.equal(feed.count, 0);
  assert.deepEqual(feed.items, []);
  assert.match(feed.error, /格式无效/);
});

test("collectAihot 在 items API 失败时返回空态而不是假头条", async () => {
  const fetchFn = async () => {
    throw new Error("403 from edge");
  };
  const feed = await collectAihot({ fetchFn, now: new Date("2026-08-28T18:33:00Z") });
  assert.equal(feed.count, 0);
  assert.deepEqual(feed.items, []);
  assert.match(feed.error, /403 from edge/);
  assert.equal(feed.items.some((item) => item?.title), false);
});

test("groupNewsDays 按上海日历日分组，新的一天在前，日内按时间倒序", () => {
  const days = groupNewsDays([
    { id: "late-28", published_at: "2026-08-28T15:04:44.000Z" },
    { id: "early-29", published_at: "2026-08-28T17:25:56.912Z" },
    { id: "noon-28", published_at: "2026-08-28T04:00:00.000Z" },
    { id: "via-discovered", published_at: "", discovered_at: "2026-08-27T10:52:31.000Z" },
  ]);
  assert.deepEqual(days.map((day) => day.date), ["2026-08-29", "2026-08-28", "2026-08-27"]);
  assert.deepEqual(days[0].items.map((item) => item.id), ["early-29"]);
  assert.deepEqual(days[1].items.map((item) => item.id), ["late-28", "noon-28"]);
  assert.deepEqual(days[2].items.map((item) => item.id), ["via-discovered"]);
});

test("groupNewsDays 丢弃没有有效时间的条目，不编造日期", () => {
  assert.deepEqual(groupNewsDays([{ id: "no-time", title: "空" }]), []);
});

test("formatNewsDayLabel 与推特日报同一套 月日 星期", () => {
  assert.equal(formatNewsDayLabel("2026-08-28"), "8月28日 周五");
  assert.equal(formatNewsDayLabel("2026-08-29"), "8月29日 周六");
});

test("formatBeijingClock 只报北京时分", () => {
  assert.equal(formatBeijingClock("2026-08-28T17:25:56.912Z"), "01:25");
  assert.equal(formatBeijingClock("2026-08-28T00:04:47.737Z"), "08:04");
  assert.equal(formatBeijingClock(""), "");
});
