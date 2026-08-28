#!/usr/bin/env node
/**
 * 从 AIHOT 公开 v1 API 拉取近 24h 精选，写入 data/news/aihot.json。
 * 不抓首页 HTML，不改写 summary/reason，失败时写空态而不是假头条。
 *
 *   node scripts/aihot-collect.mjs
 *   node scripts/aihot-collect.mjs --out data/news/aihot.json
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { collectAihot } from "../site/src/lib/news.mjs";

const DEFAULT_OUT = resolve("data/news/aihot.json");

function parseOut(argv) {
  const flag = argv.indexOf("--out");
  if (flag >= 0 && argv[flag + 1]) return resolve(argv[flag + 1]);
  return DEFAULT_OUT;
}

const out = parseOut(process.argv.slice(2));
const feed = await collectAihot();
await mkdir(dirname(out), { recursive: true });
await writeFile(out, `${JSON.stringify(feed, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ out, count: feed.count, error: feed.error ?? null })}\n`);
if (feed.error && feed.count === 0) process.exit(1);
