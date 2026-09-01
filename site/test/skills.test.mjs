import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  categoryFilters,
  formatGithubStars,
  getSkills,
  getSkillsFeed,
  matchesSkill,
  skillSearchBlob,
} from "../src/lib/skills.mjs";

const missingFile = "/tmp/collection-wall-skills-missing.json";

test("缺失技能 JSON 时返回空数组 / 空 feed，不抛错", async () => {
  assert.deepEqual(await getSkills(missingFile), []);
  const feed = await getSkillsFeed(missingFile);
  assert.equal(feed.count, 0);
  assert.deepEqual(feed.items, []);
});

test("损坏的 JSON 与空 items 不让站点崩", async () => {
  const dir = await mkdtemp(join(tmpdir(), "skills-"));
  const broken = join(dir, "broken.json");
  const empty = join(dir, "empty.json");
  await writeFile(broken, "{not-json", "utf8");
  await writeFile(empty, JSON.stringify({ title: "x" }), "utf8");
  assert.deepEqual(await getSkills(broken), []);
  assert.deepEqual(await getSkills(empty), []);
});

test("读取 feed 时只认 items，count 跟 items 对齐", async () => {
  const dir = await mkdtemp(join(tmpdir(), "skills-"));
  const file = join(dir, "colaskill.json");
  await writeFile(file, JSON.stringify({
    source: "colaskill",
    title: "Cola Skill",
    updated_at: "2026-09-01T00:00:00Z",
    count: 99,
    items: [
      { id: "mono-color-skill", title: "单色", headline: "印刷", author: "yanliudesign", categories: ["创作设计"], github_stars: 926 },
    ],
  }), "utf8");
  const feed = await getSkillsFeed(file);
  assert.equal(feed.source, "colaskill");
  assert.equal(feed.count, 1);
  assert.equal(feed.items[0].id, "mono-color-skill");
});

test("formatGithubStars 只格式化整数，空值不编造", () => {
  assert.equal(formatGithubStars(926), "926");
  assert.equal(formatGithubStars(3309), "3309");
  assert.equal(formatGithubStars(0), "0");
  assert.equal(formatGithubStars(null), "");
  assert.equal(formatGithubStars(undefined), "");
  assert.equal(formatGithubStars("3.3K"), "");
});

test("搜索匹配名称、一句话、作者、slug 与分类", () => {
  const skill = {
    id: "mono-color-skill",
    slug: "mono-color-skill",
    title: "单色编辑印刷图像设计技能",
    headline: "获得风格统一的社论印刷图像",
    author: "yanliudesign",
    categories: ["创作设计"],
  };
  assert.equal(matchesSkill(skill, "印刷", ""), true);
  assert.equal(matchesSkill(skill, "yanliu", ""), true);
  assert.equal(matchesSkill(skill, "mono-color", ""), true);
  assert.equal(matchesSkill(skill, "创作设计", ""), true);
  assert.equal(matchesSkill(skill, "安装量", ""), false);
});

test("分类与搜索取交集，空分类不过滤", () => {
  const skill = {
    title: "求职Offer全流程工具包",
    headline: "求职六件套",
    author: "yanliudesign",
    categories: ["调研分析"],
  };
  assert.equal(matchesSkill(skill, "求职", "调研分析"), true);
  assert.equal(matchesSkill(skill, "求职", "创作设计"), false);
  assert.equal(matchesSkill(skill, "", ""), true);
});

test("categoryFilters 按站点分类顺序，只露出有卡片的类", () => {
  const skills = [
    { categories: ["创作设计", "增长营销"] },
    { categories: ["创作设计"] },
    { categories: ["产品技术"] },
  ];
  assert.deepEqual(categoryFilters(skills), [
    { category: "创作设计", count: 2 },
    { category: "增长营销", count: 1 },
    { category: "产品技术", count: 1 },
  ]);
});

test("skillSearchBlob 不含安装量或 download_count", () => {
  const blob = skillSearchBlob({
    title: "Ego Lite",
    headline: "浏览器",
    author: "citrolabs",
    download_count: 99999,
    github_stars: 10035,
  });
  assert.equal(blob.includes("99999"), false);
  assert.equal(blob.includes("安装"), false);
});

test("data/skills 契约：有 slug/title，星数为整数，不含安装量", async () => {
  const catalog = resolve(dirname(fileURLToPath(import.meta.url)), "../../data/skills/colaskill.json");
  let raw;
  try {
    raw = JSON.parse(await readFile(catalog, "utf8"));
  } catch {
    return;
  }
  const items = raw.items ?? [];
  if (!items.length) return;
  assert.equal(raw.source, "colaskill");
  assert.equal(raw.count, items.length);
  for (const item of items) {
    assert.ok(item.id && item.slug && item.title, `${item.id} missing identity`);
    assert.equal("download_count" in item, false, `${item.id} leaked download_count`);
    assert.ok(Number.isInteger(item.github_stars) && item.github_stars >= 0, `${item.id} stars`);
    assert.match(item.detail_url ?? "", /colaskill\.com/);
  }
});

test("导航与技能页用 GitHub stars，不写安装量", async () => {
  const nav = await readFile(new URL("../src/components/SiteNav.astro", import.meta.url), "utf8");
  const page = await readFile(new URL("../src/pages/skills.astro", import.meta.url), "utf8");
  assert.match(nav, /技能/);
  assert.match(nav, /\/skills\//);
  assert.match(page, /GitHub ★/);
  assert.match(page, /不是 Cola 安装量/);
  assert.doesNotMatch(page, /status common">安装量/);
  assert.match(page, /data-skill-search/);
  assert.match(page, /data-category-filter/);
});
