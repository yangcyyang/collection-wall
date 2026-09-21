export const DISMISS_KEY_PREFIX = "linuxdo-frontier-dismissed";

export function dismissedStorageKey(date) {
  return `${DISMISS_KEY_PREFIX}:${date}`;
}

export function hiddenCountLabel(count) {
  return `已隐藏 ${Number(count) || 0} 条`;
}

function uniqueIds(ids) {
  return [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id)).filter(Boolean))];
}

export function parseDismissedIds(raw) {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return uniqueIds(parsed);
  } catch {
    return [];
  }
}

export function readDismissedIds(storage, date) {
  try {
    return parseDismissedIds(storage?.getItem(dismissedStorageKey(date)));
  } catch {
    return [];
  }
}

export function writeDismissedIds(storage, date, ids) {
  const unique = uniqueIds(ids);
  storage?.setItem(dismissedStorageKey(date), JSON.stringify(unique));
  return unique;
}

export function dismissSelected(storage, date, selectedIds) {
  return writeDismissedIds(storage, date, [...readDismissedIds(storage, date), ...uniqueIds(selectedIds)]);
}

export function restoreDismissed(storage, date) {
  storage?.removeItem(dismissedStorageKey(date));
  return [];
}

export function filterVisibleItems(items, dismissedIds) {
  const hidden = new Set(uniqueIds(dismissedIds));
  return (Array.isArray(items) ? items : []).filter((item) => !hidden.has(String(item?.id ?? "")));
}

function selectedIds(root) {
  return [...root.querySelectorAll("[data-linuxdo-check]")].flatMap((input) => {
    const card = input.closest("[data-linuxdo-card]");
    if (!input.checked || card?.hidden) return [];
    return [input.value];
  });
}

function applyWorkbench(root, storage, date) {
  const dismissed = readDismissedIds(storage, date);
  const hidden = new Set(dismissed);
  root.querySelectorAll("[data-linuxdo-card]").forEach((card) => {
    const gone = hidden.has(card.getAttribute("data-linuxdo-id") ?? "");
    card.hidden = gone;
    if (gone) {
      const check = card.querySelector("[data-linuxdo-check]");
      if (check) check.checked = false;
    }
  });
  root.querySelectorAll("[data-linuxdo-section]").forEach((section) => {
    const visible = [...section.querySelectorAll("[data-linuxdo-card]")].filter((card) => !card.hidden).length;
    const empty = section.querySelector("[data-linuxdo-section-empty]");
    if (empty) empty.hidden = visible > 0;
    const countEl = section.querySelector("[data-linuxdo-section-count]");
    if (countEl) countEl.textContent = `${visible} 条`;
  });
  const hiddenCountEl = root.querySelector("[data-linuxdo-hidden-count]");
  if (hiddenCountEl) hiddenCountEl.textContent = hiddenCountLabel(dismissed.length);
  const removeBtn = root.querySelector("[data-linuxdo-remove]");
  if (removeBtn) removeBtn.disabled = selectedIds(root).length === 0;
  const restoreBtn = root.querySelector("[data-linuxdo-restore]");
  if (restoreBtn) restoreBtn.disabled = dismissed.length === 0;
}

export function bindLinuxdoWorkbench(root, options = {}) {
  if (!root) return null;
  const storage = options.storage ?? globalThis.localStorage;
  const date = options.date
    ?? root.getAttribute("data-linuxdo-date")
    ?? root.querySelector("[data-linuxdo-date]")?.getAttribute("data-linuxdo-date")
    ?? "";

  const refresh = () => applyWorkbench(root, storage, date);
  root.querySelectorAll("[data-linuxdo-check]").forEach((input) => {
    input.addEventListener("change", refresh);
  });
  root.querySelector("[data-linuxdo-remove]")?.addEventListener("click", () => {
    dismissSelected(storage, date, selectedIds(root));
    refresh();
  });
  root.querySelector("[data-linuxdo-restore]")?.addEventListener("click", () => {
    restoreDismissed(storage, date);
    refresh();
  });
  root.querySelector("[data-linuxdo-select-all]")?.addEventListener("click", () => {
    root.querySelectorAll("[data-linuxdo-check]").forEach((input) => {
      const card = input.closest("[data-linuxdo-card]");
      if (card && !card.hidden) input.checked = true;
    });
    refresh();
  });
  root.querySelector("[data-linuxdo-select-none]")?.addEventListener("click", () => {
    root.querySelectorAll("[data-linuxdo-check]").forEach((input) => {
      input.checked = false;
    });
    refresh();
  });
  refresh();
  return { refresh };
}
