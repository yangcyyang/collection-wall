import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  isTwitterDayFilename,
  isTwitterDayPayload,
  loadTwitterDays,
} from "../src/lib/twitter-days.mjs";

const realTwitterDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../data/twitter");

/** Test-only watchlist shape: same contract as data/twitter/watchlist.json (no items). */
function watchlistShape() {
  return {
    schema_version: 1,
    updated_at: "2026-09-12T06:10:45+08:00",
    source: "test-fixture",
    policy: { per_run_max: 20 },
    categories: { core: ["example"] },
    handles: ["example"],
    notes: "test-only watchlist fixture; not a daily digest",
    skipped: [],
  };
}

async function writeFixtureDir(files) {
  const dir = await mkdtemp(join(tmpdir(), "twitter-days-"));
  for (const [name, body] of Object.entries(files)) {
    await writeFile(join(dir, name), typeof body === "string" ? body : JSON.stringify(body));
  }
  return dir;
}

function assertDaysIterable(days) {
  for (const day of days) {
    for (const item of day.items) {
      assert.equal(typeof item, "object");
    }
  }
}

test("isTwitterDayFilename 只接受 YYYY-MM-DD.json", () => {
  assert.equal(isTwitterDayFilename("2026-09-12.json"), true);
  assert.equal(isTwitterDayFilename("watchlist.json"), false);
  assert.equal(isTwitterDayFilename("2026-9-12.json"), false);
  assert.equal(isTwitterDayFilename("2026-09-12.json.bak"), false);
  assert.equal(isTwitterDayFilename("notes.json"), false);
});

test("isTwitterDayPayload 要求 items 为数组", () => {
  assert.equal(isTwitterDayPayload({ date: "2026-09-12", items: [] }), true);
  assert.equal(isTwitterDayPayload(watchlistShape()), false);
  assert.equal(isTwitterDayPayload({ date: "2026-09-12" }), false);
  assert.equal(isTwitterDayPayload({ items: {} }), false);
  assert.equal(isTwitterDayPayload(null), false);
});

test("loadTwitterDays 跳过 watchlist 与无 items 的日文件，遍历 items 不抛错", async () => {
  const dir = await writeFixtureDir({
    "watchlist.json": watchlistShape(),
    "notes.json": { hello: "world" },
    "2026-09-11.json": { date: "2026-09-11" },
    "2026-09-12.json": { date: "2026-09-12", generated_at: "2026-09-12T12:00:00+08:00", items: [] },
  });

  const days = await loadTwitterDays(dir);
  assertDaysIterable(days);
  assert.deepEqual(
    days.map((day) => day.date),
    ["2026-09-12"],
  );
});

test("loadTwitterDays 读取真实 data/twitter 时忽略 watchlist.json", async () => {
  const days = await loadTwitterDays(realTwitterDir);
  assert.ok(days.length > 0);
  assert.equal(
    days.some((day) => Array.isArray(day.handles) || day.schema_version === 1 && !day.date),
    false,
  );
  assert.ok(days.every((day) => /^\d{4}-\d{2}-\d{2}$/.test(day.date)));
  assertDaysIterable(days);
});
