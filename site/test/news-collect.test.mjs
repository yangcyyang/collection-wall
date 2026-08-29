import assert from "node:assert/strict";
import test from "node:test";

import { collectAihot, mapApiItem, mergeNewsItems } from "../src/lib/news.mjs";

const SAMPLE_API_ITEM = {
  id: "cmtd83hb4018fro667i1tbc34",
  title: "Anthropic 让 Claude 自主训练模型以缓解对齐失败",
  summary: "Anthropic 让 Claude 自主训练模型，缓解欺骗、谄媚等 10 类对齐失败。",
  source: { name: "Anthropic：Research（发表成果 · 网页）" },
  links: {
    aihot: "https://aihot.virxact.com/items/cmtd83hb4018fro667i1tbc34",
    original: "https://www.anthropic.com/research/automated-researchers-mitigate-alignment-failures",
  },
  publishedAt: "2026-08-28T17:25:56.912Z",
  discoveredAt: "2026-08-28T17:25:56.912Z",
  category: "paper",
  reason: "自动化对齐研究把安全训练从一次性微调变成可迭代搜索。",
};

test("mergeNewsItems 按 id 合并：窗口内覆盖同 id，窗口外旧条目保留，无数量上限", () => {
  const incoming = Array.from({ length: 60 }, (_, i) => ({
    id: `new-${i}`,
    title: `incoming ${i}`,
    summary: `摘要 ${i}`,
    reason: `理由 ${i}`,
  }));
  incoming[0] = { id: "shared", title: "新窗口标题", summary: "新摘要", reason: "新理由" };
  const existing = [
    { id: "shared", title: "旧标题", summary: "旧摘要", reason: "旧理由" },
    { id: "legacy", title: "窗口外旧条", summary: "保留摘要", reason: "保留理由" },
    ...Array.from({ length: 20 }, (_, i) => ({ id: `old-${i}`, title: `old ${i}` })),
  ];
  const merged = mergeNewsItems(incoming, existing);
  assert.equal(merged.length, 81);
  const shared = merged.find((item) => item.id === "shared");
  assert.equal(shared.title, "新窗口标题");
  assert.equal(shared.summary, "新摘要");
  assert.equal(shared.reason, "新理由");
  const legacy = merged.find((item) => item.id === "legacy");
  assert.equal(legacy.title, "窗口外旧条");
  assert.equal(legacy.reason, "保留理由");
  assert.equal(merged.some((item) => item.id === "old-19"), true);
});

test("collectAihot 跟随 page.nextCursor 拉完 selected 7d，不设条数上限", async () => {
  const page1 = Array.from({ length: 50 }, (_, i) => ({
    ...SAMPLE_API_ITEM,
    id: `p1-${i}`,
    title: `page1 ${i}`,
  }));
  const page2 = Array.from({ length: 11 }, (_, i) => ({
    ...SAMPLE_API_ITEM,
    id: `p2-${i}`,
    title: `page2 ${i}`,
  }));
  const urls = [];
  const fetchFn = async (url) => {
    urls.push(String(url));
    if (String(url).includes("/dailies")) {
      return { ok: true, json: async () => ({ items: [] }) };
    }
    if (String(url).includes("cursor=")) {
      assert.match(String(url), /cursor=cursor-page-2/);
      return {
        ok: true,
        json: async () => ({ items: page2, page: { hasMore: false, nextCursor: null } }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        items: page1,
        page: { hasMore: true, nextCursor: "cursor-page-2" },
      }),
    };
  };

  const feed = await collectAihot({ fetchFn, now: new Date("2026-08-28T18:33:00Z") });
  assert.equal(feed.count, 61);
  assert.equal(feed.items.length, 61);
  assert.equal(urls.some((url) => url.includes("window=7d") && !url.includes("cursor=")), true);
  assert.equal(urls.some((url) => url.includes("cursor=cursor-page-2")), true);
  assert.equal(urls.some((url) => url.includes("window=24h")), false);
  assert.equal(feed.items[0].reason, SAMPLE_API_ITEM.reason);
});

test("collectAihot 把本轮拉取与已有 JSON 按 id 合并，不覆盖历史", async () => {
  const previous = {
    items: [
      mapApiItem(SAMPLE_API_ITEM),
      mapApiItem({ ...SAMPLE_API_ITEM, id: "legacy-id", title: "窗口外旧条", reason: "应保留" }),
    ],
  };
  const incoming = {
    ...SAMPLE_API_ITEM,
    id: "fresh-id",
    title: "新窗口条目",
    reason: "新理由原文",
  };
  const fetchFn = async (url) => {
    if (String(url).includes("/items")) {
      return { ok: true, json: async () => ({ items: [incoming], page: { hasMore: false } }) };
    }
    if (String(url).includes("/dailies")) {
      return { ok: true, json: async () => ({ items: [] }) };
    }
    throw new Error(`unexpected url ${url}`);
  };

  const feed = await collectAihot({
    fetchFn,
    now: new Date("2026-08-28T18:33:00Z"),
    previous,
  });
  const ids = feed.items.map((item) => item.id).sort();
  assert.deepEqual(ids, ["cmtd83hb4018fro667i1tbc34", "fresh-id", "legacy-id"]);
  assert.equal(feed.items.find((item) => item.id === "legacy-id").reason, "应保留");
  assert.equal(feed.items.find((item) => item.id === "fresh-id").reason, "新理由原文");
  assert.equal(feed.count, 3);
});

test("collectAihot 后续分页失败时仍合并已拉到的页与已有条目", async () => {
  const previous = {
    items: [mapApiItem({ ...SAMPLE_API_ITEM, id: "legacy-id", title: "旧条" })],
  };
  let itemsCalls = 0;
  const fetchFn = async (url) => {
    if (String(url).includes("/dailies")) {
      return { ok: true, json: async () => ({ items: [] }) };
    }
    if (String(url).includes("/items")) {
      itemsCalls += 1;
      if (itemsCalls === 1) {
        return {
          ok: true,
          json: async () => ({
            items: [{ ...SAMPLE_API_ITEM, id: "page1-id", title: "第一页" }],
            page: { hasMore: true, nextCursor: "next" },
          }),
        };
      }
      throw new Error("cursor page failed");
    }
    throw new Error(`unexpected url ${url}`);
  };

  const feed = await collectAihot({
    fetchFn,
    now: new Date("2026-08-28T18:33:00Z"),
    previous,
  });
  assert.equal(feed.items.some((item) => item.id === "page1-id"), true);
  assert.equal(feed.items.some((item) => item.id === "legacy-id"), true);
  assert.equal(feed.count, 2);
  assert.match(feed.error ?? "", /cursor page failed/);
});

test("collectAihot 首页失败时保留已有条目，不写空态覆盖历史", async () => {
  const previous = {
    items: [mapApiItem(SAMPLE_API_ITEM)],
    daily: { date: "2026-08-27", title: "旧日报", url: "https://aihot.virxact.com/daily/2026-08-27" },
  };
  const fetchFn = async () => {
    throw new Error("403 from edge");
  };
  const feed = await collectAihot({
    fetchFn,
    now: new Date("2026-08-28T18:33:00Z"),
    previous,
  });
  assert.equal(feed.count, 1);
  assert.equal(feed.items[0].id, SAMPLE_API_ITEM.id);
  assert.equal(feed.daily.date, "2026-08-27");
  assert.match(feed.error, /403 from edge/);
});
