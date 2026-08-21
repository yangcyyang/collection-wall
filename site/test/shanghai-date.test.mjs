import assert from "node:assert/strict";
import test from "node:test";

import {
  countAddedOnShanghaiDate,
  matchesIntent,
  shanghaiDateKey,
  todayShanghaiDateKey,
  toolSearchBlob,
} from "../src/lib/shanghai-date.mjs";

test("naive added_at is treated as Asia/Shanghai wall clock", () => {
  assert.equal(shanghaiDateKey("2026-07-13T18:09:30"), "2026-07-13");
  assert.equal(shanghaiDateKey("2026-07-13T00:05:07"), "2026-07-13");
});

test("UTC added_at converts to the Shanghai calendar date", () => {
  assert.equal(shanghaiDateKey("2026-07-12T08:05:07.855Z"), "2026-07-12");
  assert.equal(shanghaiDateKey("2026-07-12T16:05:07.855Z"), "2026-07-13");
});

test("invalid or missing added_at does not count as today", () => {
  assert.equal(shanghaiDateKey(""), "");
  assert.equal(shanghaiDateKey("not-a-date"), "");
  assert.equal(countAddedOnShanghaiDate([{ added_at: "nope" }, {}], "2026-08-21"), 0);
});

test("today badge counts only Shanghai calendar matches and hides +0", () => {
  const tools = [
    { added_at: "2026-08-21T01:00:00" },
    { added_at: "2026-08-20T23:30:00Z" },
    { added_at: "2026-08-21T16:00:00Z" },
  ];
  assert.equal(countAddedOnShanghaiDate(tools, "2026-08-21"), 2);
  assert.equal(countAddedOnShanghaiDate(tools, "2026-08-22"), 1);
  assert.equal(countAddedOnShanghaiDate(tools, "2026-08-20"), 0);
});

test("todayShanghaiDateKey follows Asia/Shanghai, not the host offset", () => {
  assert.equal(todayShanghaiDateKey(new Date("2026-08-21T16:30:00Z")), "2026-08-22");
  assert.equal(todayShanghaiDateKey(new Date("2026-08-21T15:59:00Z")), "2026-08-21");
});

test("search blob includes tags and capabilities for intent chips", () => {
  const blob = toolSearchBlob({
    name: "Midjourney",
    headline: "文本生成高质量图像",
    tags: ["AI绘画"],
    capabilities: ["根据文字提示词生成图像"],
  });
  assert.equal(matchesIntent(blob, ["提示词", "prompt"]), true);
  assert.equal(matchesIntent(blob, ["ppt", "演示"]), false);
  assert.equal(matchesIntent(blob, []), true);
});
