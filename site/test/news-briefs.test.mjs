import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { briefForDate, getNewsBriefs, parseNewsBriefs } from "../src/lib/news-briefs.mjs";

const AUG_29 = {
  date: "2026-08-29",
  watch: "行业 + 模型",
  body: "对你最实在的是 OpenAI 断供 Cursor，11 月 12 日生效，编码工作流要提前找替代。对冲看智谱 GLM-5.3 开源权重，自用和中小团队许可比表面松。安全向那三条扫标题就行。",
};

const AUG_28 = {
  date: "2026-08-28",
  watch: "模型 + 语音",
  body: "混元 Hy4 preview 和 GLM-5.3 分差很小，选型看 1M 上下文和能不能私有化。Gemini 3.5 Transcribe 已经能用在实时字幕；做图的看 Midjourney V8.2 多图参考。Cursor 断供当天已经发过，和 29 日是同一条线。",
};

test("parseNewsBriefs 只保留 key 与 date 对齐且 watch/body 齐全的条目", () => {
  const briefs = parseNewsBriefs({
    "2026-08-29": AUG_29,
    "2026-08-28": AUG_28,
    "2026-08-27": { date: "2026-08-27", watch: "", body: "空 watch 应丢" },
    "2026-08-26": { date: "2026-08-26", watch: "模型", body: "" },
    "2026-08-25": { date: "2026-08-24", watch: "错位", body: "key 与 date 不一致" },
    "not-a-date": { date: "not-a-date", watch: "x", body: "y" },
    "2026-08-24": "not-an-object",
  });
  assert.deepEqual(Object.keys(briefs).sort(), ["2026-08-28", "2026-08-29"]);
  assert.equal(briefs["2026-08-29"].body, AUG_29.body);
  assert.equal(briefs["2026-08-28"].watch, AUG_28.watch);
});

test("parseNewsBriefs 不改写 body，也不为缺天编造总结", () => {
  const briefs = parseNewsBriefs({ "2026-08-29": AUG_29 });
  assert.equal(briefs["2026-08-29"].body, AUG_29.body);
  assert.equal(briefForDate(briefs, "2026-08-28"), undefined);
  assert.equal(briefForDate(briefs, "2026-08-29").watch, "行业 + 模型");
});

test("getNewsBriefs 缺文件或坏 JSON 时返回空对象，不编造", async () => {
  const missing = await getNewsBriefs(join(tmpdir(), "news-briefs-missing.json"));
  assert.deepEqual(missing, {});
  assert.equal(briefForDate(missing, "2026-08-29"), undefined);

  const dir = await mkdtemp(join(tmpdir(), "news-briefs-"));
  const bad = join(dir, "briefs.json");
  await writeFile(bad, "{not-json");
  assert.deepEqual(await getNewsBriefs(bad), {});
});

test("seed 的两天每日总结原文原样可读", async () => {
  const seed = resolve(dirname(fileURLToPath(import.meta.url)), "../../data/news/briefs.json");
  const briefs = await getNewsBriefs(seed);
  assert.deepEqual(briefs["2026-08-29"], AUG_29);
  assert.deepEqual(briefs["2026-08-28"], AUG_28);
  assert.equal(briefForDate(briefs, "2026-08-27"), undefined);
});
