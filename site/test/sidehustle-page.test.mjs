import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { HIDE_SIDEHUSTLE_FOR_DEMO } from "../src/lib/sidehustle.mjs";

test("演示期间共用开关隐藏副业导航和机会列表", async () => {
  const page = await readFile(new URL("../src/pages/sidehustle.astro", import.meta.url), "utf8");
  const nav = await readFile(new URL("../src/components/SiteNav.astro", import.meta.url), "utf8");
  const login = await readFile(new URL("../src/pages/login.astro", import.meta.url), "utf8");

  assert.equal(HIDE_SIDEHUSTLE_FOR_DEMO, true);
  assert.match(page, /HIDE_SIDEHUSTLE_FOR_DEMO/);
  assert.match(page, /HIDE_SIDEHUSTLE_FOR_DEMO\s*\?/);
  assert.match(page, /!HIDE_SIDEHUSTLE_FOR_DEMO\s*&&\s*<SidehustleViewer/);
  assert.match(page, /内容暂未开放/);
  assert.match(page, /该列表演示期间暂不展示/);
  assert.match(page, /SiteNav/);
  assert.match(page, /LogoutControl/);
  assert.match(page, /机会列表/);
  assert.match(page, /机会摘要/);
  assert.match(nav, /HIDE_SIDEHUSTLE_FOR_DEMO/);
  assert.match(nav, /id !== ["']sidehustle["']/);
  assert.match(nav, /label: ["']副业["']/);
  assert.match(nav, /\/sidehustle\//);
  assert.match(login, /SiteNav/);
});

test("构建产物顶栏不出现副业 tab，列表页仍是占位", async (t) => {
  const pages = {
    sidehustle: new URL("../dist/sidehustle/index.html", import.meta.url),
    login: new URL("../dist/login/index.html", import.meta.url),
    home: new URL("../dist/index.html", import.meta.url),
  };
  let html;
  try {
    html = {
      sidehustle: await readFile(pages.sidehustle, "utf8"),
      login: await readFile(pages.login, "utf8"),
      home: await readFile(pages.home, "utf8"),
    };
  } catch {
    t.skip("尚未执行 site build");
    return;
  }

  for (const [name, pageHtml] of Object.entries(html)) {
    assert.doesNotMatch(pageHtml, /<a[^>]*href="\/sidehustle\/"[^>]*>副业<\/a>/, name);
  }

  assert.match(html.sidehustle, /内容暂未开放/);
  assert.match(html.sidehustle, /该列表演示期间暂不展示/);
  assert.match(html.sidehustle, /退出登录/);
  assert.doesNotMatch(html.sidehustle, /机会列表/);
  assert.doesNotMatch(html.sidehustle, /机会摘要/);
  assert.doesNotMatch(html.sidehustle, /条机会/);
  assert.doesNotMatch(html.sidehustle, /data-sidehustle-open/);
  assert.doesNotMatch(html.sidehustle, /data-sidehustle-template/);
  assert.doesNotMatch(html.sidehustle, /AI 漫剧创作兼职招人/);
});
