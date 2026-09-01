import assert from "node:assert/strict";
import test from "node:test";

import {
  COLASKILL_HOME,
  buildSkillFeed,
  collectColaskill,
  githubUrlFrom,
  mapApiSkill,
  marketplaceCategories,
  parseGithubStars,
} from "../src/lib/colaskill.mjs";

const SAMPLE = {
  id: "6a955b6ab483c688ebab8c99",
  slug: "mono-color-skill",
  title: "单色编辑印刷图像设计技能",
  name: "mono-color-skill",
  author: "yanliudesign",
  description: "生成单/双色社论印刷风格原创图像",
  result_teaser: "获得风格统一、符合社论印刷美学的原创设计图像",
  source_url: "https://github.com/yanliudesign/mono-color-skill",
  homepage_url: "https://github.com/yanliudesign/mono-color-skill",
  preview_image_url: "https://files.meetcola.com/skill-hub/previews/mono-color-skill/cover.png",
  guide_prompts: ["帮我生成一张钴蓝海报", "生成沙丁鱼包装"],
  license_type: "mit",
  categories: ["design_video"],
  user_tags: ["designer"],
  task_tags: ["image_design"],
  stars: 926,
  download_count: 935,
  featured: true,
  homepage_section: "featured",
};

test("marketplaceCategories 复用 Cola 站点公开分类规则，不猜类", () => {
  assert.deepEqual(
    marketplaceCategories({ categories: ["design_video"], tasks: ["image_design"], audiences: [] }),
    ["创作设计"],
  );
  assert.deepEqual(
    marketplaceCategories({ categories: ["marketing_growth"], tasks: [], audiences: [] }),
    ["增长营销"],
  );
  assert.deepEqual(
    marketplaceCategories({ categories: ["engineering"], tasks: [], audiences: [] }),
    ["产品技术"],
  );
  assert.deepEqual(
    marketplaceCategories({ categories: ["finance_services"], tasks: [], audiences: ["founder"] }),
    ["一人公司"],
  );
  assert.deepEqual(
    marketplaceCategories({ categories: ["documents_slides"], tasks: [], audiences: [] }),
    ["职场办公"],
  );
  assert.deepEqual(
    marketplaceCategories({ categories: ["writing_research"], tasks: [], audiences: [] }),
    ["调研分析"],
  );
  assert.deepEqual(
    marketplaceCategories({ categories: ["content_knowledge"], tasks: ["knowledge_management"], audiences: [] }),
    ["自我提升"],
  );
  assert.deepEqual(
    marketplaceCategories({ categories: [], tasks: ["teaching_research"], audiences: ["educator"] }),
    ["教学讲课"],
  );
  assert.deepEqual(
    marketplaceCategories({ categories: ["marketing_growth"], tasks: ["publishing"], audiences: [] }),
    ["增长营销", "电商运营"],
  );
  assert.deepEqual(
    marketplaceCategories({ categories: ["other"], tasks: [], audiences: [] }),
    [],
  );
});

test("mapApiSkill 用 GitHub stars，绝不把 download_count 当星数", () => {
  const item = mapApiSkill(SAMPLE);
  assert.equal(item.id, "mono-color-skill");
  assert.equal(item.slug, "mono-color-skill");
  assert.equal(item.title, "单色编辑印刷图像设计技能");
  assert.equal(item.headline, "获得风格统一、符合社论印刷美学的原创设计图像");
  assert.equal(item.author, "yanliudesign");
  assert.equal(item.github_url, "https://github.com/yanliudesign/mono-color-skill");
  assert.equal(item.github_stars, 926);
  assert.notEqual(item.github_stars, SAMPLE.download_count);
  assert.equal("download_count" in item, false);
  assert.deepEqual(item.categories, ["创作设计"]);
  assert.equal(item.license, "mit");
  assert.equal(item.detail_url, `${COLASKILL_HOME}mono-color-skill`);
  assert.equal(item.install_url, "colaos://skills/install?slug=mono-color-skill");
  assert.deepEqual(item.example_prompts, ["帮我生成一张钴蓝海报", "生成沙丁鱼包装"]);
  assert.equal(item.cover_source, SAMPLE.preview_image_url);
  assert.equal(item.featured, true);
});

test("没有 slug 的记录丢弃；非 GitHub 源不编造 github_url", () => {
  assert.equal(mapApiSkill({ title: "x" }), null);
  const item = mapApiSkill({
    slug: "ego-lite",
    title: "Ego Lite",
    source_url: "https://citrolabs.com/ego",
    stars: 10035,
    categories: ["engineering"],
  });
  assert.equal(item.github_url, "");
  assert.equal(item.github_stars, 10035);
});

test("parseGithubStars 只接受整数，缩写不估成精确值", () => {
  assert.equal(parseGithubStars(926), 926);
  assert.equal(parseGithubStars(0), 0);
  assert.equal(parseGithubStars("3.3K"), null);
  assert.equal(parseGithubStars("42K"), null);
  assert.equal(parseGithubStars("926"), 926);
  assert.equal(parseGithubStars(null), null);
});

test("githubUrlFrom 只保留 github.com 链接", () => {
  assert.equal(githubUrlFrom("https://github.com/op7418/guizang-ppt-skill"), "https://github.com/op7418/guizang-ppt-skill");
  assert.equal(githubUrlFrom("https://github.com/yanliudesign/mono-color-skill.git"), "https://github.com/yanliudesign/mono-color-skill");
  assert.equal(githubUrlFrom("https://colaskill.com/zh/mono-color-skill"), "");
});

test("collectColaskill 跟随 next_cursor 拉完目录，不设条数上限", async () => {
  const page1 = Array.from({ length: 50 }, (_, i) => ({ ...SAMPLE, slug: `p1-${i}`, stars: i }));
  const page2 = Array.from({ length: 11 }, (_, i) => ({ ...SAMPLE, slug: `p2-${i}`, stars: 100 + i }));
  const urls = [];
  const fetchFn = async (url) => {
    urls.push(String(url));
    if (String(url).includes("cursor=")) {
      return {
        ok: true,
        json: async () => ({ ok: true, data: { items: page2, next_cursor: null } }),
      };
    }
    return {
      ok: true,
      json: async () => ({ ok: true, data: { items: page1, next_cursor: "cursor-page-2" } }),
    };
  };

  const feed = await collectColaskill({ fetchFn, now: new Date("2026-09-01T03:38:00Z") });
  assert.equal(feed.count, 61);
  assert.equal(feed.source, "colaskill");
  assert.equal(new Set(feed.items.map((item) => item.id)).size, 61);
  assert.ok(feed.items.some((item) => item.id === "p1-0"));
  assert.ok(feed.items.some((item) => item.id === "p2-10"));
  assert.equal(urls.length, 2);
  assert.match(urls[0], /\/v1\/skill-directory\/skills\?/);
  assert.equal(feed.items.every((item) => item.github_stars !== 935), true);
});

test("buildSkillFeed 按 id 去重，featured 优先再按星数", () => {
  const feed = buildSkillFeed({
    items: [
      { id: "b", featured: false, github_stars: 50, title: "B" },
      { id: "a", featured: true, github_stars: 1, title: "A" },
      { id: "b", featured: false, github_stars: 99, title: "B2" },
      { id: "c", featured: false, github_stars: 80, title: "C" },
    ],
    updated_at: "2026-09-01T00:00:00Z",
  });
  assert.deepEqual(feed.items.map((item) => item.id), ["a", "c", "b"]);
  assert.equal(feed.count, 3);
});
