import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { inferPromptType, promptTypeFilters, sourceLinkLabel, promptFacets } from "../src/lib/prompt-type.mjs";

test("标题关键词按格式优先：海报压过品牌和人像", () => {
  assert.equal(inferPromptType("几何留白·明亮清爽·品牌海报", "", ""), "海报");
  assert.equal(inferPromptType("竖条群像·暖色明快·会议海报", "", ""), "海报");
  assert.equal(inferPromptType("日本复古半色调抗议海报", "", ""), "海报");
});

test("标题命中单一类型", () => {
  assert.equal(inferPromptType("斑点羽色鸟类插画", "", ""), "插画");
  assert.equal(inferPromptType("波普半色调印刷人像", "", ""), "人像");
  assert.equal(inferPromptType("第35期 · 饮料云雾清透", "", ""), "静物");
  assert.equal(inferPromptType("GPT2 x 中式美学 x 窗景 x 朦胧", "", ""), "风景");
  assert.equal(inferPromptType("第38期 · 巨字留白冷静信息", "", ""), "字体");
  assert.equal(inferPromptType("GPT2 x 包装 x 思路 发散", "", ""), "品牌");
});

test("标题同时命中字体和风景时取字体", () => {
  assert.equal(inferPromptType("第36期 · 婚礼巨字风景", "", ""), "字体");
});

test("短标题没有类型时回落到 prompt 的强格式词", () => {
  assert.equal(inferPromptType("GPT2 x 蜡笔 x 松弛感", "请将照片制作成一张独立的高级设计海报", ""), "海报");
  assert.equal(inferPromptType("风格试验", "Full body illustration of an owl", ""), "插画");
});

test("URL 路径里的 portrait / poster / beverage 可补标题", () => {
  assert.equal(inferPromptType("第38期 · 故障光影信息", "", "https://vip.xiaoxiaodong.ai/#style/portrait__foo"), "人像");
  assert.equal(inferPromptType("苹果巨物通透", "", "https://vip.xiaoxiaodong.ai/#style/poster"), "海报");
  assert.equal(inferPromptType("清透构图", "", "https://vip.xiaoxiaodong.ai/#style/beverage"), "静物");
});

test("新类型：信息图 / UI / 产品 / 场景", () => {
  assert.equal(inferPromptType("塔可爆炸拆解信息图", "", ""), "信息图");
  assert.equal(inferPromptType("一张中文健身信息图", "Make a clean infographic", ""), "信息图");
  assert.equal(inferPromptType("Netflix 首页主视觉 UI", "", ""), "UI");
  assert.equal(inferPromptType("Bichon Shop 拟物 App 图标", "", ""), "UI");
  assert.equal(inferPromptType("直播界面设计图", "", ""), "UI");
  assert.equal(inferPromptType("薄荷玫瑰香水电商图", "", ""), "产品");
  assert.equal(inferPromptType("全自动咖啡机产品展示", "studio product photography", ""), "产品");
  assert.equal(inferPromptType("综合应用场景图", "", ""), "场景");
  assert.equal(inferPromptType("冬季生存惊悚 Storyboard", "", ""), "场景");
});

test("海报仍压过信息图和产品，品牌仍压过 UI 套话", () => {
  assert.equal(inferPromptType("品牌信息图海报", "", ""), "海报");
  assert.equal(inferPromptType("包装电商海报", "", ""), "海报");
});

test("长正文不当标题，无关键词则为未分类", () => {
  const street = "围绕任意主题对象生成一张具有街拍纪实感的高速瞬间画面，把主题转化为正在穿越画面的运动主形体";
  assert.equal(inferPromptType(street, street, "https://x.com/i/status/1"), "未分类");
  assert.equal(inferPromptType("GPT2 x 灵魂出窍 x 创意", "生成一张有镜像惊喜的摄影感视觉", ""), "未分类");
});

test("零计数类型不出现在 chips 里，其他改未分类", () => {
  const filters = promptTypeFilters([
    { type: "未分类" },
    { type: "海报" },
    { type: "海报" },
    { type: "人像" },
    { type: "UI" },
  ]);
  assert.deepEqual(filters, [
    { type: "海报", count: 2 },
    { type: "人像", count: 1 },
    { type: "UI", count: 1 },
    { type: "未分类", count: 1 },
  ]);
});

test("现有语料里未分类不再是第二大桶，新芯片有真实计数", async () => {
  const dir = resolve(import.meta.dirname, "../../data/prompts");
  const files = (await readdir(dir)).filter((file) => file.endsWith(".json"));
  const sets = [];
  for (const file of files) {
    const data = JSON.parse(await readFile(resolve(dir, file), "utf8"));
    for (const item of data.items ?? []) {
      sets.push({ type: inferPromptType(item.text, item.prompt, item.url) });
    }
  }
  assert.ok(sets.length > 0);
  const filters = promptTypeFilters(sets);
  const counts = Object.fromEntries(filters.map((item) => [item.type, item.count]));
  const other = counts["未分类"] ?? 0;
  const ranked = [...filters].sort((a, b) => b.count - a.count);
  assert.ok(other / sets.length <= 0.4, `未分类占比过高：${other}/${sets.length}`);
  assert.notEqual(ranked[1]?.type, "未分类", `未分类仍是第二大桶：${JSON.stringify(counts)}`);
  for (const type of ["海报", "插画", "人像", "静物", "风景", "字体", "品牌", "信息图", "UI", "产品", "场景", "未分类"]) {
    assert.ok((counts[type] ?? 0) > 0, `${type} 没有落到卡片`);
  }
  assert.deepEqual(filters.map((item) => item.type), [
    "海报", "插画", "人像", "静物", "风景", "字体", "品牌", "信息图", "UI", "产品", "场景", "未分类",
  ]);
});

test("多图与来源可当标签", () => {
  assert.deepEqual(promptFacets({ source: "xiaoxiaodong01", images: ["a", "b"] }), ["小小东", "多图"]);
  assert.deepEqual(promptFacets({ source: "aiartdaily", images: ["a"] }), ["AI Art Daily"]);
});

test("推特链接写原推，其余来源写原文", () => {
  assert.equal(sourceLinkLabel("https://x.com/i/status/123"), "原推");
  assert.equal(sourceLinkLabel("https://twitter.com/foo/status/1"), "原推");
  assert.equal(sourceLinkLabel("https://www.twitter.com/foo"), "原推");
  assert.equal(sourceLinkLabel("https://aiartdaily.substack.com/p/1075"), "原文");
  assert.equal(sourceLinkLabel("https://vip.xiaoxiaodong.ai/#style/poster"), "原文");
});
