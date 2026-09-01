import assert from "node:assert/strict";
import test from "node:test";

import {
  ASK_AI_DAILY_LIMIT,
  consumeQuota,
  readQuotaState,
  remainingQuota,
} from "../src/lib/ask-ai-quota.mjs";

const monday = new Date("2026-09-01T04:00:00Z");
const tuesday = new Date("2026-09-02T04:00:00Z");

test("新访客当天额度为 20", () => {
  const state = readQuotaState(null, monday);
  assert.equal(remainingQuota(state), ASK_AI_DAILY_LIMIT);
  assert.equal(ASK_AI_DAILY_LIMIT, 20);
});

test("第 20 次仍可用，第 21 次用尽", () => {
  let state = readQuotaState({ d: "2026-09-01", n: 19 }, monday);
  assert.equal(remainingQuota(state), 1);
  state = consumeQuota(state);
  assert.equal(remainingQuota(state), 0);
  assert.equal(state.n, 20);
});

test("跨上海自然日重置计数", () => {
  const stale = readQuotaState({ d: "2026-09-01", n: 20 }, tuesday);
  assert.equal(remainingQuota(stale), 20);
  assert.equal(stale.n, 0);
});
