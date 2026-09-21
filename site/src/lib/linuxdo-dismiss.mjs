export const DISMISS_KEY_PREFIX = "linuxdo-frontier-dismissed";

export function dismissedStorageKey(date, prefix = DISMISS_KEY_PREFIX) {
  return `${prefix}:${date}`;
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

export function readDismissedIds(storage, date, prefix = DISMISS_KEY_PREFIX) {
  try {
    return parseDismissedIds(storage?.getItem(dismissedStorageKey(date, prefix)));
  } catch {
    return [];
  }
}

export function writeDismissedIds(storage, date, ids, prefix = DISMISS_KEY_PREFIX) {
  const unique = uniqueIds(ids);
  try {
    storage?.setItem(dismissedStorageKey(date, prefix), JSON.stringify(unique));
  } catch {
    return unique;
  }
  return unique;
}

export function dismissSelected(storage, date, selectedIds, prefix = DISMISS_KEY_PREFIX) {
  return writeDismissedIds(storage, date, [...readDismissedIds(storage, date, prefix), ...uniqueIds(selectedIds)], prefix);
}

export function restoreDismissed(storage, date, prefix = DISMISS_KEY_PREFIX) {
  try {
    storage?.removeItem(dismissedStorageKey(date, prefix));
  } catch {
    return [];
  }
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

function applyWorkbench(root, storage, date, prefix) {
  const dismissed = readDismissedIds(storage, date, prefix);
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
  const hiddenOnPage = [...root.querySelectorAll("[data-linuxdo-card]")].filter((card) => card.hidden).length;
  const hiddenCountEl = root.querySelector("[data-linuxdo-hidden-count]");
  if (hiddenCountEl) hiddenCountEl.textContent = hiddenCountLabel(hiddenOnPage);
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
  const prefix = options.prefix
    ?? root.getAttribute("data-linuxdo-dismiss-prefix")
    ?? DISMISS_KEY_PREFIX;

  const refresh = () => applyWorkbench(root, storage, date, prefix);
  root.querySelectorAll("[data-linuxdo-check]").forEach((input) => {
    input.addEventListener("change", refresh);
  });
  root.querySelector("[data-linuxdo-remove]")?.addEventListener("click", () => {
    dismissSelected(storage, date, selectedIds(root), prefix);
    refresh();
  });
  root.querySelector("[data-linuxdo-restore]")?.addEventListener("click", () => {
    restoreDismissed(storage, date, prefix);
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
