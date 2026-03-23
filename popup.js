async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function fmtTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString();
}

function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2200);
}

function parseChapterNumber(ch) {
  return parseFloat(ch) || 0;
}

async function bgMessage(payload) {
  return await chrome.runtime.sendMessage(payload);
}

const SORT_MODES = [
  { key: "recent", label: "Recent" },
  { key: "alpha", label: "A\u2013Z" },
  { key: "chapter", label: "Ch \u2191" }
];

(async function init() {
  const statusEl = document.getElementById("status");
  const latestBadgeEl = document.getElementById("latestBadge");
  const forceSaveBtn = document.getElementById("forceSaveBtn");
  const recentEl = document.getElementById("recent");
  const searchInput = document.getElementById("searchInput");
  const sortBtn = document.getElementById("sortBtn");
  const exportBtn = document.getElementById("exportBtn");
  const importBtn = document.getElementById("importBtn");
  const importFile = document.getElementById("importFile");
  const importModal = document.getElementById("importModal");
  const importTextarea = document.getElementById("importTextarea");
  const importCancel = document.getElementById("importCancel");
  const importConfirm = document.getElementById("importConfirm");
  const continueBanner = document.getElementById("continueBanner");
  const continueTitle = document.getElementById("continueTitle");
  const continueBtn = document.getElementById("continueBtn");

  let allRecords = [];
  let sortIndex = 0;

  const tab = await getActiveTab();
  if (!tab?.url) {
    statusEl.textContent = "No tab";
    forceSaveBtn.disabled = true;
  }

  // Badge
  const lastRes = await bgMessage({ type: "GET_LAST" });
  latestBadgeEl.textContent = lastRes?.lastBadgeText ? `Ch ${lastRes.lastBadgeText}` : "--";

  // Status + continue reading
  if (tab?.url) {
    const parsedRes = await bgMessage({ type: "PARSE_URL", url: tab.url });
    if (parsedRes?.parsed) {
      statusEl.textContent = "Chapter detected";
      statusEl.classList.add("detected");

      // Check if we have a saved record for this series that's ahead
      const allRes = await bgMessage({ type: "GET_ALL" });
      const records = allRes?.records || [];
      const match = records.find(r => r.seriesKey === parsedRes.parsed.seriesKey);
      if (match && parseChapterNumber(match.lastChapter) > parseChapterNumber(parsedRes.parsed.chapter)) {
        const name = match.seriesName.replace(/\b\w/g, c => c.toUpperCase());
        continueTitle.textContent = `${name} — Ch ${match.lastChapter}`;
        continueBanner.classList.add("visible");
        continueBtn.onclick = async () => {
          await chrome.tabs.update(tab.id, { url: match.lastUrl });
          window.close();
        };
      }
    } else {
      statusEl.textContent = "Not a chapter URL";
    }
  }

  // Force save
  forceSaveBtn.onclick = async () => {
    forceSaveBtn.disabled = true;
    const res = await bgMessage({ type: "FORCE_SAVE", url: tab.url });
    if (res?.ok) {
      latestBadgeEl.textContent = `Ch ${res.record.lastChapter}`;
      toast(`Saved ${res.record.seriesName} — Ch ${res.record.lastChapter}`);
    } else {
      toast(res?.error || "Could not save.");
    }
    forceSaveBtn.disabled = false;
    await renderRecent();
  };

  // Search
  searchInput.addEventListener("input", () => {
    renderFilteredList(searchInput.value.trim().toLowerCase());
  });

  // Sort toggle
  sortBtn.onclick = () => {
    sortIndex = (sortIndex + 1) % SORT_MODES.length;
    sortBtn.textContent = SORT_MODES[sortIndex].label;
    renderFilteredList(searchInput.value.trim().toLowerCase());
  };

  // Export
  exportBtn.onclick = async () => {
    const allRes = await bgMessage({ type: "GET_ALL" });
    const records = allRes?.records || [];
    if (!records.length) {
      toast("Nothing to export.");
      return;
    }
    const blob = new Blob([JSON.stringify(records, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `manga-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast(`Exported ${records.length} series.`);
  };

  // Import — open modal
  importBtn.onclick = () => {
    importTextarea.value = "";
    importModal.classList.add("open");
  };

  // Also support file picker
  importFile.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      importTextarea.value = reader.result;
      importModal.classList.add("open");
    };
    reader.readAsText(file);
    importFile.value = "";
  });

  importCancel.onclick = () => importModal.classList.remove("open");

  importConfirm.onclick = async () => {
    const text = importTextarea.value.trim();
    if (!text) {
      toast("Paste JSON data first.");
      return;
    }
    let records;
    try {
      records = JSON.parse(text);
    } catch {
      toast("Invalid JSON.");
      return;
    }
    if (!Array.isArray(records)) {
      toast("Expected a JSON array.");
      return;
    }

    const res = await bgMessage({ type: "IMPORT", records });
    if (res?.ok) {
      toast(`Imported ${res.count} series.`);
      importModal.classList.remove("open");
      const lastRes2 = await bgMessage({ type: "GET_LAST" });
      latestBadgeEl.textContent = lastRes2?.lastBadgeText ? `Ch ${lastRes2.lastBadgeText}` : "--";
      await renderRecent();
    } else {
      toast(res?.error || "Import failed.");
    }
  };

  // Close modal on overlay click
  importModal.addEventListener("click", (e) => {
    if (e.target === importModal) importModal.classList.remove("open");
  });

  // Sort helper
  function sortRecords(records) {
    const mode = SORT_MODES[sortIndex].key;
    const sorted = [...records];
    if (mode === "recent") {
      sorted.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    } else if (mode === "alpha") {
      sorted.sort((a, b) => a.seriesName.localeCompare(b.seriesName));
    } else if (mode === "chapter") {
      sorted.sort((a, b) => parseChapterNumber(b.lastChapter) - parseChapterNumber(a.lastChapter));
    }
    return sorted;
  }

  // Render list
  function renderFilteredList(query) {
    let filtered = query
      ? allRecords.filter(r => r.seriesName.toLowerCase().includes(query) || r.host.toLowerCase().includes(query))
      : allRecords;

    filtered = sortRecords(filtered);

    if (!filtered.length) {
      recentEl.textContent = "";
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = query ? "No matches found." : "No history yet.";
      recentEl.appendChild(empty);
      return;
    }

    recentEl.textContent = "";

    for (const r of filtered) {
      const name = r.seriesName.replace(/\b\w/g, c => c.toUpperCase());

      const item = document.createElement("div");
      item.className = "series-item";

      const info = document.createElement("div");
      info.className = "series-info";
      info.style.cursor = "pointer";
      info.title = `Open Ch ${r.lastChapter}`;

      const nameEl = document.createElement("div");
      nameEl.className = "series-name";
      nameEl.textContent = name;

      const metaEl = document.createElement("div");
      metaEl.className = "series-meta";
      metaEl.textContent = `${r.host} \u00b7 ${fmtTime(r.updatedAt)}`;

      info.append(nameEl, metaEl);
      info.addEventListener("click", async () => {
        await chrome.tabs.create({ url: r.lastUrl });
      });

      const tag = document.createElement("span");
      tag.className = "chapter-tag";
      tag.textContent = `Ch ${r.lastChapter}`;

      const del = document.createElement("button");
      del.className = "del-btn";
      del.title = "Remove";
      del.textContent = "\u2715";
      del.addEventListener("click", async (e) => {
        e.stopPropagation();
        del.disabled = true;
        const res = await bgMessage({ type: "DELETE_SERIES", seriesKey: r.seriesKey });
        if (res?.ok) {
          latestBadgeEl.textContent = res.newBadge ? `Ch ${res.newBadge}` : "--";
          toast("Removed.");
        } else {
          toast(res?.error || "Delete failed.");
        }
        await renderRecent();
      });

      item.append(info, tag, del);
      recentEl.appendChild(item);
    }
  }

  async function renderRecent() {
    const allRes = await bgMessage({ type: "GET_ALL" });
    allRecords = allRes?.records || [];
    renderFilteredList(searchInput.value.trim().toLowerCase());
  }

  await renderRecent();
})();
