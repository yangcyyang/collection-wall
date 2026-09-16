import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  isZsxqDayFilename,
  isZsxqDayPayload,
  loadZsxqDays,
} from "../src/lib/zsxq-days.mjs";

const realZsxqDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../data/zsxq");

function seedShape(overrides = {}) {
  return {
    schema_version: 1,
    source: "zsxq-changgong",
    title: "长弓小子设计思享 · 问答",
    planet: "长弓小子设计思享",
    group_url: "https://wx.zsxq.com/group/88511822141542",
    date: "2026-09-15",
    updated_at: "2026-09-15T20:00:00+08:00",
    count: 1,
    items: [
      {
        id: "zsxq-20260915-1",
        date: "2026-09-15",
        question: "怎样把评审从好看不好看拉回问题本身？",
        answer_summary: "先写清要验证的用户问题与成功标准，再对照方案讲取舍。",
        tags: ["设计思维"],
        url: "https://wx.zsxq.com/group/88511822141542",
        rank: 1,
      },
    ],
    ...overrides,
  };
}

async function writeFixtureDir(files) {
  const dir = await mkdtemp(join(tmpdir(), "zsxq-days-"));
  for (const [name, body] of Object.entries(files)) {
    await writeFile(join(dir, name), typeof body === "string" ? body : JSON.stringify(body));
  }
  return dir;
}

test("isZsxqDayFilename 只接受 YYYY-MM-DD.json，忽略 README", () => {
  assert.equal(isZsxqDayFilename("2026-09-15.json"), true);
  assert.equal(isZsxqDayFilename("README.md"), false);
  assert.equal(isZsxqDayFilename("readme.md"), false);
  assert.equal(isZsxqDayFilename("2026-9-15.json"), false);
  assert.equal(isZsxqDayFilename("2026-09-15.json.bak"), false);
  assert.equal(isZsxqDayFilename("notes.json"), false);
});

test("isZsxqDayPayload 要求 items 为数组", () => {
  assert.equal(isZsxqDayPayload(seedShape()), true);
  assert.equal(isZsxqDayPayload({ date: "2026-09-15", items: [] }), true);
  assert.equal(isZsxqDayPayload({ date: "2026-09-15" }), false);
  assert.equal(isZsxqDayPayload({ items: {} }), false);
  assert.equal(isZsxqDayPayload(null), false);
});

test("loadZsxqDays 跳过 README 与无 items 的文件，能加载种子形状 payload", async () => {
  const dir = await writeFixtureDir({
    "README.md": "# zsxq\n",
    "notes.json": { hello: "world" },
    "2026-09-14.json": { date: "2026-09-14" },
    "2026-09-15.json": seedShape(),
  });

  const days = await loadZsxqDays(dir);
  assert.equal(days.length, 1);
  assert.equal(days[0].date, "2026-09-15");
  assert.equal(days[0].source, "zsxq-changgong");
  assert.equal(days[0].items.length, 1);
  assert.equal(days[0].items[0].question, "怎样把评审从好看不好看拉回问题本身？");
  assert.deepEqual(days[0].items[0].tags, ["设计思维"]);
});

test("loadZsxqDays 空目录或缺失目录返回 []", async () => {
  const empty = await mkdtemp(join(tmpdir(), "zsxq-empty-"));
  assert.deepEqual(await loadZsxqDays(empty), []);
  assert.deepEqual(await loadZsxqDays(join(empty, "missing")), []);
});

test("读取真实 data/zsxq 时忽略 README.md，种子日文件可遍历 items", async () => {
  const days = await loadZsxqDays(realZsxqDir);
  assert.ok(days.length > 0);
  assert.ok(days.every((day) => /^\d{4}-\d{2}-\d{2}$/.test(day.date)));
  assert.ok(days.every((day) => Array.isArray(day.items)));
  assert.ok(days.some((day) => day.date === "2026-09-15" && day.items.length >= 1));
});

test("知识星球页有导航、登录文案、空状态与按日组件，无推特标签浏览器", async () => {
  const page = await readFile(new URL("../src/pages/zsxq.astro", import.meta.url), "utf8");
  const group = await readFile(new URL("../src/components/ZsxqDayGroup.astro", import.meta.url), "utf8");
  const nav = await readFile(new URL("../src/components/SiteNav.astro", import.meta.url), "utf8");
  const login = await readFile(new URL("../src/pages/login.astro", import.meta.url), "utf8");

  assert.match(nav, /知识星球/);
  assert.match(nav, /\/zsxq\//);
  assert.match(nav, /current: .*zsxq/);
  assert.match(login, /知识星球/);
  assert.match(page, /还没有问答/);
  assert.match(page, /data\/zsxq/);
  assert.match(page, /splitRecentAndArchive/);
  assert.match(page, /ZsxqDayGroup/);
  assert.match(page, /长弓小子设计思享/);
  assert.doesNotMatch(page, /tag-browser/);
  assert.doesNotMatch(page, /data-category-tab/);
  assert.match(group, /question/);
  assert.match(group, /answer_summary/);
  assert.match(group, /tag-list/);
  assert.match(group, /item\.url/);
});

test("构建产物 /zsxq/ 能渲染种子问答卡", async (t) => {
  const distFile = new URL("../dist/zsxq/index.html", import.meta.url);
  let html;
  try {
    html = await readFile(distFile, "utf8");
  } catch {
    t.skip("尚未执行 site build");
    return;
  }
  assert.match(html, /知识星球/);
  if (html.includes("还没有问答")) {
    assert.match(html, /data\/zsxq/);
    return;
  }
  assert.match(html, /tweet-card|zsxq/);
  assert.match(html, /设计/);
});
