import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { importToolSources } from "../scripts/import-tool-sources.mjs";

test("导入器统一三路记录、保留来源并迁移封面", async () => {
  const root = await mkdtemp(join(tmpdir(), "wall-import-"));
  const arsenalPath = join(root, "arsenal.json");
  const starsPath = join(root, "stars.jsonl");
  const sourceCovers = join(root, "source-covers");
  const outputDir = join(root, "tools");

  await mkdir(sourceCovers);
  await writeFile(join(sourceCovers, "cover.jpg"), "cover-bytes");
  await writeFile(arsenalPath, JSON.stringify([{
    name: "工具甲",
    url: "https://example.com/tool-a",
    headline: "用于测试的工具",
    category: "🎨 视觉创作",
    subcategory: "图像生成",
    status: "⭐ 高频",
    visitCount: 31,
    tags: ["测试"],
    cover: "/covers/cover.jpg",
  }]));
  await writeFile(starsPath, JSON.stringify({
    name: "owner/repo",
    html_url: "https://github.com/owner/repo",
    description: "Agent framework",
    language: "TypeScript",
    topics: ["agent", "ai"],
    starred_at: "2026-07-11T00:00:00Z",
    stargazers_count: 12,
  }) + "\n");

  const result = await importToolSources({
    arsenalPath,
    starsPath,
    sourceCovers,
    outputDir,
    importedAt: "2026-07-12T00:00:00.000Z",
  });

  assert.equal(result.arsenalCount, 1);
  assert.equal(result.githubStarsCount, 1);
  assert.equal(result.records.length, 2);
  assert.deepEqual(result.records.map((record) => record.source).sort(), [
    "github-stars",
    "xiaoer-tools-wall",
  ]);
  assert.equal(result.records[0].cover?.startsWith("covers/"), true);
  assert.equal(result.records[1].category, "🤖 AI 大模型");
  assert.equal(result.records[1].status, "🆕 待试");
});
