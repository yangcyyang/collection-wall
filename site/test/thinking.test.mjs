import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  categoryFilters,
  getThinkingFeed,
  getThinkingMethods,
  matchesThinking,
  thinkingSearchBlob,
} from "../src/lib/thinking.mjs";

const missingFile = "/tmp/collection-wall-thinking-missing.json";
const catalogFile = resolve(dirname(fileURLToPath(import.meta.url)), "../../data/thinking/catalog.json");

function sampleItem(overrides = {}) {
  return {
    id: "ontology",
    name: "本体论",
    name_en: "Ontology",
    category: "哲学基础",
    one_liner: "先问事物是什么",
    how: "列出对象、属性和关系",
    example: "先定义「需求」再谈方案",
    tags: ["哲学", "建模"],
    ...overrides,
  };
}

test("缺失思维方法 JSON 时返回空数组 / 空 feed，不抛错", async () => {
  assert.deepEqual(await getThinkingMethods(missingFile), []);
  const feed = await getThinkingFeed(missingFile);
  assert.equal(feed.count, 0);
  assert.deepEqual(feed.items, []);
  assert.deepEqual(feed.categories, []);
});

test("损坏的 JSON 与空 items 不让站点崩", async () => {
  const dir = await mkdtemp(join(tmpdir(), "thinking-"));
  const broken = join(dir, "broken.json");
  const empty = join(dir, "empty.json");
  await writeFile(broken, "{not-json", "utf8");
  await writeFile(empty, JSON.stringify({ title: "x" }), "utf8");
  assert.deepEqual(await getThinkingMethods(broken), []);
  assert.deepEqual(await getThinkingMethods(empty), []);
});

test("读取 feed 时只认 items，count 跟 items 对齐，保留 catalog 分类顺序", async () => {
  const dir = await mkdtemp(join(tmpdir(), "thinking-"));
  const file = join(dir, "catalog.json");
  await writeFile(file, JSON.stringify({
    source: "thinking-catalog",
    title: "思维方法",
    description: "可检索的思维方法目录",
    updated_at: "2026-09-17T00:00:00Z",
    count: 99,
    categories: ["个人效能", "哲学基础"],
    items: [sampleItem()],
  }), "utf8");
  const feed = await getThinkingFeed(file);
  assert.equal(feed.source, "thinking-catalog");
  assert.equal(feed.title, "思维方法");
  assert.equal(feed.description, "可检索的思维方法目录");
  assert.equal(feed.count, 1);
  assert.deepEqual(feed.categories, ["个人效能", "哲学基础"]);
  assert.equal(feed.items[0].id, "ontology");
  assert.equal(feed.items[0].name, "本体论");
  assert.equal(feed.items[0].name_en, "Ontology");
  assert.equal(feed.items[0].one_liner, "先问事物是什么");
});

test("目录路径默认读 catalog.json", async () => {
  const dir = await mkdtemp(join(tmpdir(), "thinking-dir-"));
  await writeFile(join(dir, "catalog.json"), JSON.stringify({
    source: "thinking-catalog",
    categories: ["哲学基础"],
    items: [sampleItem()],
  }), "utf8");
  const feed = await getThinkingFeed(dir);
  assert.equal(feed.count, 1);
  assert.equal(feed.items[0].id, "ontology");
});

test("搜索匹配中文名、英文名、一句话、用法、例子与标签", () => {
  const item = sampleItem();
  assert.equal(matchesThinking(item, "本体论", ""), true);
  assert.equal(matchesThinking(item, "ontology", ""), true);
  assert.equal(matchesThinking(item, "事物是什么", ""), true);
  assert.equal(matchesThinking(item, "属性和关系", ""), true);
  assert.equal(matchesThinking(item, "需求", ""), true);
  assert.equal(matchesThinking(item, "建模", ""), true);
  assert.equal(matchesThinking(item, "安装量", ""), false);
});

test("分类与搜索取交集，空分类不过滤", () => {
  const item = sampleItem();
  assert.equal(matchesThinking(item, "本体", "哲学基础"), true);
  assert.equal(matchesThinking(item, "本体", "个人效能"), false);
  assert.equal(matchesThinking(item, "", ""), true);
});

test("categoryFilters 沿用 catalog 分类顺序，只露出有卡片的类", () => {
  const items = [
    sampleItem({ category: "哲学基础" }),
    sampleItem({ id: "gtd", name: "GTD", category: "个人效能" }),
    sampleItem({ id: "stoic", name: "斯多葛", category: "哲学基础" }),
  ];
  assert.deepEqual(categoryFilters(items, ["个人效能", "哲学基础", "空分类"]), [
    { category: "个人效能", count: 1 },
    { category: "哲学基础", count: 2 },
  ]);
});

test("thinkingSearchBlob 不含无关字段", () => {
  const blob = thinkingSearchBlob({
    ...sampleItem(),
    download_count: 99999,
  });
  assert.equal(blob.includes("99999"), false);
  assert.match(blob, /本体论/);
  assert.match(blob, /ontology/);
});

test("data/thinking 契约：字段名固定，不改条目原文", async (t) => {
  let raw;
  try {
    raw = JSON.parse(await readFile(catalogFile, "utf8"));
  } catch {
    t.skip("catalog.json 尚未入库");
    return;
  }
  const items = raw.items ?? [];
  assert.ok(Array.isArray(items));
  assert.ok(items.length >= 130 && items.length <= 140, `expected ~132 items, got ${items.length}`);
  assert.equal(raw.count, items.length);
  assert.ok(Array.isArray(raw.categories));
  for (const item of items) {
    assert.ok(item.id && item.name && item.category, `${item.id} missing identity`);
    assert.equal("name_zh" in item, false, `${item.id} used cy alternate name_zh`);
    assert.equal("headline" in item, false, `${item.id} used cy alternate headline`);
    assert.equal(typeof item.one_liner, "string");
    assert.equal(typeof item.how, "string");
    assert.equal(typeof item.example, "string");
  }
  const ontology = items.find((item) => item.id === "ontology");
  if (ontology) {
    assert.equal(ontology.name, "本体论");
    assert.equal(ontology.name_en, "Ontology");
  }
});

test("构建产物 /thinking/ 能渲染目录卡片", async (t) => {
  const distFile = new URL("../dist/thinking/index.html", import.meta.url);
  let html;
  try {
    html = await readFile(distFile, "utf8");
  } catch {
    t.skip("尚未执行 site build");
    return;
  }
  assert.match(html, /思维方法/);
  if (html.includes("还没有思维方法")) {
    assert.match(html, /data\/thinking\/catalog\.json/);
    return;
  }
  const cards = html.match(/data-thinking/g) ?? [];
  assert.ok(cards.length >= 130, `expected ~132 cards, got ${cards.length}`);
  assert.match(html, /data-thinking-search/);
  assert.match(html, /data-category-filter/);
});

test("导航与思维方法页有搜索、分类筛选和卡内展开，不是外链技能卡", async () => {
  const nav = await readFile(new URL("../src/components/SiteNav.astro", import.meta.url), "utf8");
  const page = await readFile(new URL("../src/pages/thinking.astro", import.meta.url), "utf8");
  const login = await readFile(new URL("../src/pages/login.astro", import.meta.url), "utf8");
  assert.match(nav, /思维方法/);
  assert.match(nav, /\/thinking\//);
  assert.match(nav, /current: .*thinking/);
  assert.match(login, /思维方法/);
  assert.match(page, /data-thinking-search/);
  assert.match(page, /data-category-filter/);
  assert.match(page, /name_en/);
  assert.match(page, /one_liner/);
  assert.match(page, /item\.how/);
  assert.match(page, /item\.example/);
  assert.match(page, /<details/);
  assert.doesNotMatch(page, /colaskill\.com/);
  assert.doesNotMatch(page, /card-link/);
});
