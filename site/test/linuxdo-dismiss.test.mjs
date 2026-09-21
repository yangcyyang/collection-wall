import assert from "node:assert/strict";
import test from "node:test";

import {
  DISMISS_KEY_PREFIX,
  bindLinuxdoWorkbench,
  dismissSelected,
  dismissedStorageKey,
  filterVisibleItems,
  hiddenCountLabel,
  readDismissedIds,
  restoreDismissed,
  writeDismissedIds,
} from "../src/lib/linuxdo-dismiss.mjs";

function memoryStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
    keys: () => [...store.keys()],
  };
}

function fakeNode(extra = {}) {
  return {
    hidden: false,
    checked: false,
    disabled: false,
    value: "",
    textContent: "",
    listeners: {},
    children: {},
    attrs: {},
    addEventListener(type, fn) { this.listeners[type] = fn; },
    getAttribute(name) { return this.attrs[name] ?? null; },
    querySelector(sel) { return this.children[sel] ?? null; },
    querySelectorAll(sel) { return this.children[sel] ? [this.children[sel]] : []; },
    closest() { return null; },
    ...extra,
  };
}

function fakeWorkbenchRoot() {
  const makeCard = (id) => {
    const check = fakeNode({ value: id });
    const card = fakeNode({
      attrs: { "data-linuxdo-id": id },
      children: { "[data-linuxdo-check]": check },
    });
    check.closest = (sel) => (sel === "[data-linuxdo-card]" ? card : null);
    return { card, check };
  };
  const a = makeCard("2928990");
  const b = makeCard("2925970");
  const c = makeCard("2925213");
  const cards = [a.card, b.card, c.card];
  const checks = [a.check, b.check, c.check];
  const hiddenCount = fakeNode({ textContent: "" });
  const sectionCount = fakeNode({ textContent: "3 条" });
  const empty = fakeNode({ hidden: true });
  const removeBtn = fakeNode({ disabled: true });
  const restoreBtn = fakeNode({ disabled: true });
  const selectAll = fakeNode();
  const selectNone = fakeNode();
  const section = {
    hidden: false,
    querySelector(sel) {
      if (sel === "[data-linuxdo-section-empty]") return empty;
      if (sel === "[data-linuxdo-section-count]") return sectionCount;
      return null;
    },
    querySelectorAll(sel) {
      return sel === "[data-linuxdo-card]" ? cards : [];
    },
  };
  const root = {
    attrs: { "data-linuxdo-date": "2026-09-21", "data-linuxdo-dismiss-prefix": DISMISS_KEY_PREFIX },
    getAttribute(name) { return this.attrs[name] ?? null; },
    querySelector(sel) {
      if (sel === "[data-linuxdo-remove]") return removeBtn;
      if (sel === "[data-linuxdo-restore]") return restoreBtn;
      if (sel === "[data-linuxdo-select-all]") return selectAll;
      if (sel === "[data-linuxdo-select-none]") return selectNone;
      if (sel === "[data-linuxdo-hidden-count]") return hiddenCount;
      if (sel === "[data-linuxdo-date]") return root;
      return null;
    },
    querySelectorAll(sel) {
      if (sel === "[data-linuxdo-card]") return cards;
      if (sel === "[data-linuxdo-check]") return checks;
      if (sel === "[data-linuxdo-section]") return [section];
      return [];
    },
  };
  return { root, cards, checks, hiddenCount, removeBtn, restoreBtn, selectAll, selectNone };
}

test("dismiss 按日期写入 localStorage，刷新后仍过滤", () => {
  const storage = memoryStorage();
  assert.equal(dismissedStorageKey("2026-09-21"), `${DISMISS_KEY_PREFIX}:2026-09-21`);
  assert.deepEqual(readDismissedIds(storage, "2026-09-21"), []);

  const after = dismissSelected(storage, "2026-09-21", [2928990, "2925970"]);
  assert.deepEqual(after, ["2928990", "2925970"]);
  assert.deepEqual(readDismissedIds(storage, "2026-09-21"), ["2928990", "2925970"]);
  assert.deepEqual(readDismissedIds(storage, "2026-09-22"), []);

  const merged = dismissSelected(storage, "2026-09-21", ["2928990", 2927016]);
  assert.deepEqual(merged, ["2928990", "2925970", "2927016"]);

  const items = [
    { id: 2928990, title: "a" },
    { id: "2925970", title: "b" },
    { id: 2927016, title: "c" },
    { id: 2925213, title: "d" },
  ];
  assert.deepEqual(filterVisibleItems(items, merged).map((item) => String(item.id)), ["2925213"]);
  assert.equal(hiddenCountLabel(merged.length), "已隐藏 3 条");

  assert.deepEqual(restoreDismissed(storage, "2026-09-21"), []);
  assert.deepEqual(readDismissedIds(storage, "2026-09-21"), []);
  assert.equal(storage.keys().includes(`${DISMISS_KEY_PREFIX}:2026-09-21`), false);
});

test("损坏或非数组的 dismiss 记录视为空，不抛错", () => {
  const storage = memoryStorage({
    [`${DISMISS_KEY_PREFIX}:2026-09-21`]: "{not-json",
  });
  assert.deepEqual(readDismissedIds(storage, "2026-09-21"), []);
  writeDismissedIds(storage, "2026-09-21", ["1"]);
  storage.setItem(`${DISMISS_KEY_PREFIX}:2026-09-21`, JSON.stringify({ id: 1 }));
  assert.deepEqual(readDismissedIds(storage, "2026-09-21"), []);
});

test("工作台勾选移除后写入当日 localStorage，重绑仍隐藏，恢复后回来", () => {
  const storage = memoryStorage();
  const first = fakeWorkbenchRoot();
  bindLinuxdoWorkbench(first.root, { storage });
  assert.equal(first.hiddenCount.textContent, "已隐藏 0 条");
  assert.equal(first.restoreBtn.disabled, true);

  first.checks[0].checked = true;
  first.checks[1].checked = true;
  first.checks[0].listeners.change();
  assert.equal(first.removeBtn.disabled, false);
  first.removeBtn.listeners.click();

  assert.equal(first.cards[0].hidden, true);
  assert.equal(first.cards[1].hidden, true);
  assert.equal(first.cards[2].hidden, false);
  assert.equal(first.hiddenCount.textContent, "已隐藏 2 条");
  assert.deepEqual(readDismissedIds(storage, "2026-09-21"), ["2928990", "2925970"]);

  const reloaded = fakeWorkbenchRoot();
  bindLinuxdoWorkbench(reloaded.root, { storage });
  assert.equal(reloaded.cards[0].hidden, true);
  assert.equal(reloaded.cards[1].hidden, true);
  assert.equal(reloaded.cards[2].hidden, false);
  assert.equal(reloaded.hiddenCount.textContent, "已隐藏 2 条");
  assert.equal(reloaded.restoreBtn.disabled, false);

  reloaded.restoreBtn.listeners.click();
  assert.equal(reloaded.cards[0].hidden, false);
  assert.equal(reloaded.cards[1].hidden, false);
  assert.equal(reloaded.hiddenCount.textContent, "已隐藏 0 条");
  assert.deepEqual(readDismissedIds(storage, "2026-09-21"), []);
});

test("storage 写入失败时 dismiss 不抛错", () => {
  const storage = {
    getItem() { return null; },
    setItem() { throw new Error("quota"); },
    removeItem() { throw new Error("denied"); },
  };
  assert.deepEqual(writeDismissedIds(storage, "2026-09-21", ["1"]), ["1"]);
  assert.deepEqual(restoreDismissed(storage, "2026-09-21"), []);
});
