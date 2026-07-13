import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compareFeaturedTools, compareRecentTools, selectFeaturedTools } from "../src/lib/tool-order.mjs";

function tool(id, visit_count, added_at) {
  return { id, visit_count, added_at };
}

test("精华临界并列时按加入时间稳定取前 12 条", () => {
  const tools = [
    ...Array.from({ length: 11 }, (_, index) => tool(`top-${index}`, 400 - index, "2026-07-01T00:00:00Z")),
    tool("older-225", 225, "2026-06-01T00:00:00Z"),
    tool("latest-225", 225, "2026-07-04T00:00:00Z"),
    tool("middle-225", 225, "2026-07-03T00:00:00Z"),
    tool("newer-225", 225, "2026-07-05T00:00:00Z"),
  ];

  const featured = selectFeaturedTools(tools);

  assert.equal(featured.length, 12);
  assert.deepEqual(featured.slice(-1).map((item) => item.id), ["newer-225"]);
  assert.deepEqual(featured.filter((item) => item.visit_count === 225).map((item) => item.id), ["newer-225"]);
  assert.equal(tools.filter((item) => !featured.includes(item)).length, 3);
});

test("访问与加入时间均相同时按 id 排序", () => {
  const tools = [
    tool("tool-c", 225, "2026-07-05T00:00:00Z"),
    tool("tool-a", 225, "2026-07-05T00:00:00Z"),
    tool("tool-b", 225, "2026-07-05T00:00:00Z"),
  ];

  assert.deepEqual([...tools].sort(compareFeaturedTools).map((item) => item.id), ["tool-a", "tool-b", "tool-c"]);
});

test("精华排序将非法访问次数归零，再以加入时间和 id 稳定排序", () => {
  const tools = [
    tool("negative", -20, "2026-07-04T00:00:00Z"),
    tool("text", "400", "2026-07-05T00:00:00Z"),
    tool("nan", Number.NaN, "2026-07-03T00:00:00Z"),
    tool("missing", undefined, "2026-07-05T00:00:00Z"),
    tool("alpha", undefined, "not-a-date"),
    tool("beta", undefined, "not-a-date"),
  ];

  assert.deepEqual(
    [...tools].sort(compareFeaturedTools).map((item) => item.id),
    ["missing", "text", "negative", "nan", "alpha", "beta"],
  );
});

test("最近收藏将非法时间归零，并在同一时间按 id 稳定排序", () => {
  const tools = [
    tool("same-c", 0, "2026-07-05T00:00:00Z"),
    tool("invalid", 0, "not-a-date"),
    tool("same-a", 0, "2026-07-05T00:00:00Z"),
    tool("missing", 0, undefined),
    tool("same-b", 0, "2026-07-05T00:00:00Z"),
  ];

  assert.deepEqual(
    [...tools].sort(compareRecentTools).map((item) => item.id),
    ["same-a", "same-b", "same-c", "invalid", "missing"],
  );
});

test("当前数据集固定展示 12 条精华，其余 641 条保留在最近收藏", async () => {
  const siteDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const toolsDirectory = resolve(siteDirectory, "../data/tools");
  const files = (await readdir(toolsDirectory)).filter((file) => file.endsWith(".json"));
  const tools = await Promise.all(files.map(async (file) => JSON.parse(await readFile(resolve(toolsDirectory, file), "utf8"))));
  const eligible = tools.filter((item) => ["⭐ 高频", "📦 常用"].includes(item.status ?? ""));
  const featured = selectFeaturedTools(eligible);

  assert.equal(tools.length, 653);
  assert.equal(featured.length, 12);
  assert.equal(tools.filter((item) => !featured.includes(item)).length, 641);
});
