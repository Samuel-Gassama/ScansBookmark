const STORAGE = chrome.storage.sync;

// -------------------------
// URL parsing (generic)
// -------------------------
function normalizeHost(hostname) {
  return hostname
    .replace(/^ww\d+\./i, "")
    .replace(/^www\./i, "")
    .replace(/^m\./i, "");
}

function normalizeChapter(ch) {
  if (!ch) return null;
  ch = ch.replace(/^0+(?=\d)/, "");
  if (/^\d+-\d+$/.test(ch)) return ch.replace("-", ".");
  return ch;
}

function slugToName(slug) {
  return slug.replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
}

// Each pattern returns { seriesSlug, chapter } or null
const URL_PATTERNS = [
  // ---- Site-specific patterns ----

  // MangaDex: /chapter/{uuid} — no series info in URL, use title page ref
  // We handle MangaDex via title pattern: /title/{uuid}/{slug}/...
  {
    test: (host) => host.includes("mangadex"),
    parse: (_host, path) => {
      // /chapter/{uuid} — can't extract series from this alone
      // /title/{id}/{slug} pages aren't chapters
      return null;
    }
  },

  // Asura Scans / Asuratoon: /series/{slug}/{chapter-slug}/ or /{slug}-chapter-{N}
  {
    test: (host) => /asura|asuratoon|asuracomic/.test(host),
    parse: (_host, path) => {
      const m = path.match(/^\/series\/([^/]+)\/chapter-([0-9]+(?:[-.][0-9]+)?)\/?$/i);
      if (m) return { seriesSlug: m[1], chapter: m[2] };
      return null;
    }
  },

  // Flame Scans: /series/{slug}/chapter-{N} or /{slug}-chapter-{N}
  {
    test: (host) => /flame|flamecomic/.test(host),
    parse: (_host, path) => {
      const m = path.match(/^\/series\/([^/]+)\/chapter-([0-9]+(?:[-.][0-9]+)?)\/?$/i)
           || path.match(/^\/([^/]+)-chapter-([0-9]+(?:[-.][0-9]+)?)\/?$/i);
      if (m) return { seriesSlug: m[1], chapter: m[2] };
      return null;
    }
  },

  // Reaper Scans: /series/{slug}/chapter-{N}
  {
    test: (host) => /reaper|reapercomic|reaperscans/.test(host),
    parse: (_host, path) => {
      const m = path.match(/^\/series\/([^/]+)\/chapter-([0-9]+(?:[-.][0-9]+)?)\/?$/i);
      if (m) return { seriesSlug: m[1], chapter: m[2] };
      return null;
    }
  },

  // Webtoons: /eps-viewer?titleNo=X&episode_no=Y  or  /{lang}/{genre}/{slug}/viewer?episode_no=N
  {
    test: (host) => host.includes("webtoon"),
    parse: (_host, path, searchParams) => {
      const ep = searchParams.get("episode_no");
      if (!ep) return null;
      // Try to get slug from path like /en/action/some-title/viewer
      const m = path.match(/\/([^/]+)\/(?:viewer|list)/i);
      const slug = m ? m[1] : (searchParams.get("titleNo") || "webtoon");
      return { seriesSlug: slug, chapter: ep };
    }
  },

  // Tapas: /episode/{id}  or  /series/{slug}/episode/{N}
  {
    test: (host) => host.includes("tapas"),
    parse: (_host, path) => {
      const m = path.match(/^\/series\/([^/]+)\/episode\/([0-9]+)\/?$/i);
      if (m) return { seriesSlug: m[1], chapter: m[2] };
      // /episode/{id} — no series info
      return null;
    }
  },

  // MangaKakalot / Chapmanganato / MangaNato: /manga-{slug}/chapter-{N} or /{slug}/chapter-{N}
  {
    test: (host) => /kakalot|manganato|chapmanganato|manganelo|natomanga/.test(host),
    parse: (_host, path) => {
      const m = path.match(/^\/(?:manga-)?([^/]+)\/chapter[-_]([0-9]+(?:[-.][0-9]+)?)\/?$/i);
      if (m) return { seriesSlug: m[1], chapter: m[2] };
      return null;
    }
  },

  // MangaBuddy / MangaMirror / MangaForest: /{slug}/chapter-{N}
  {
    test: (host) => /mangabuddy|mangamirror|mangaforest|mangapill/.test(host),
    parse: (_host, path) => {
      const m = path.match(/^\/([^/]+)\/chapter[-_]([0-9]+(?:[-.][0-9]+)?)\/?$/i);
      if (m) return { seriesSlug: m[1], chapter: m[2] };
      return null;
    }
  },

  // MangaReader / MangaFire: /{slug}/chapter-{N}  or /read/{slug}/chapter-{N}
  {
    test: (host) => /mangareader|mangafire/.test(host),
    parse: (_host, path) => {
      const m = path.match(/^\/(?:read\/)?([^/]+)\/(?:en\/)?chapter[-_]([0-9]+(?:[-.][0-9]+)?)\/?$/i);
      if (m) return { seriesSlug: m[1], chapter: m[2] };
      return null;
    }
  },

  // TCBScans: /mangas/{slug}/{chapter-slug}
  {
    test: (host) => /tcb/.test(host),
    parse: (_host, path) => {
      const m = path.match(/^\/mangas\/([^/]+)\/chapter[-_]([0-9]+(?:[-.][0-9]+)?)\/?$/i);
      if (m) return { seriesSlug: m[1], chapter: m[2] };
      return null;
    }
  },

  // VoidScans / LuminousScans / Reset Scans / Night Scans / Drake Scans / Omega Scans / etc
  // Common WordPress manga reader pattern: /series/{slug}/chapter-{N}/ or /{slug}-chapter-{N}/
  {
    test: (host) => /void|luminous|reset|night|drake|omega|cosmic|zero|alpha|immortal|manga|scans|comic|toon/.test(host),
    parse: (_host, path) => {
      const m = path.match(/^\/(?:series|manga|read|title)\/([^/]+)\/chapter[-_]([0-9]+(?:[-.][0-9]+)?)\/?$/i);
      if (m) return { seriesSlug: m[1], chapter: m[2] };
      return null;
    }
  },

  // ---- Generic fallback patterns (any site) ----

  // /chapter/{slug}-chapter-{N}  (original pattern)
  {
    test: () => true,
    parse: (_host, path) => {
      const m = path.match(/^\/chapter\/(.+?)-chapter-([0-9]+(?:[-.][0-9]+)?)\/?$/i);
      if (m) return { seriesSlug: m[1], chapter: m[2] };
      return null;
    }
  },

  // /series/{slug}/chapter-{N}  or  /manga/{slug}/chapter-{N}  or  /read/{slug}/chapter-{N}  or /title/{slug}/chapter-{N}
  {
    test: () => true,
    parse: (_host, path) => {
      const m = path.match(/^\/(?:series|manga|read|title|comic|mangas|comics)\/([^/]+)\/chapter[-_]?([0-9]+(?:[-.][0-9]+)?)\/?$/i);
      if (m) return { seriesSlug: m[1], chapter: m[2] };
      return null;
    }
  },

  // /{slug}/chapter-{N}  or  /{slug}/ch-{N}
  {
    test: () => true,
    parse: (_host, path) => {
      const m = path.match(/^\/([^/]+)\/(?:chapter|ch|chap|ep|episode)[-_]?([0-9]+(?:[-.][0-9]+)?)\/?$/i);
      if (m) return { seriesSlug: m[1], chapter: m[2] };
      return null;
    }
  },

  // /{slug}-chapter-{N}  (flat URL, slug contains "chapter" delimiter)
  {
    test: () => true,
    parse: (_host, path) => {
      const m = path.match(/^\/(.+?)-(?:chapter|ch|chap)[-_]([0-9]+(?:[-.][0-9]+)?)\/?$/i);
      if (m) return { seriesSlug: m[1], chapter: m[2] };
      return null;
    }
  }
];

function parseChapterUrl(urlString) {
  let url;
  try { url = new URL(urlString); } catch { return null; }

  const host = normalizeHost(url.hostname);
  const path = url.pathname;
  const searchParams = url.searchParams;

  for (const pattern of URL_PATTERNS) {
    if (!pattern.test(host)) continue;
    const result = pattern.parse(host, path, searchParams);
    if (result) {
      const seriesSlug = result.seriesSlug.toLowerCase();
      const chapter = normalizeChapter(result.chapter);
      if (!chapter) continue;
      return {
        host,
        seriesSlug,
        seriesKey: `${host}::${seriesSlug}`,
        seriesNameGuess: slugToName(seriesSlug),
        chapter,
        chapterUrl: url.href
      };
    }
  }

  return null;
}

// -------------------------
// Badge helpers
// -------------------------
async function setGlobalBadge(text) {
  await chrome.action.setBadgeText({ text: text ? String(text) : "" });
}

async function restoreBadgeFromStorage() {
  const { lastBadgeText } = await STORAGE.get(["lastBadgeText"]);
  await setGlobalBadge(lastBadgeText || "");
}

restoreBadgeFromStorage();

async function recomputeLastBadgeFromRecords() {
  const data = await STORAGE.get(null);
  const records = Object.values(data).filter(v => v && v.lastUrl && v.lastChapter && v.updatedAt);

  records.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const next = records[0]?.lastChapter || "";

  await STORAGE.set({ lastBadgeText: next });
  await setGlobalBadge(next);
  return next;
}

// -------------------------
// Save progress
// -------------------------
function parseChapterNumber(ch) {
  return parseFloat(ch) || 0;
}

async function saveProgressFromUrl(urlString, { force = false } = {}) {
  const parsed = parseChapterUrl(urlString);
  if (!parsed) return null;

  if (!force) {
    const existing = (await STORAGE.get(parsed.seriesKey))[parsed.seriesKey];
    if (existing && parseChapterNumber(existing.lastChapter) >= parseChapterNumber(parsed.chapter)) {
      return null;
    }
  }

  const now = Date.now();
  const record = {
    seriesKey: parsed.seriesKey,
    host: parsed.host,
    seriesName: parsed.seriesNameGuess,
    lastChapter: parsed.chapter,
    lastUrl: parsed.chapterUrl,
    updatedAt: now
  };

  await STORAGE.set({
    [parsed.seriesKey]: record,
    lastBadgeText: record.lastChapter
  });

  await setGlobalBadge(record.lastChapter);
  return record;
}

chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!tab?.url) return;
  await saveProgressFromUrl(tab.url);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId);
  if (!tab?.url) return;
  await saveProgressFromUrl(tab.url);
});

// -------------------------
// Messaging for popup
// -------------------------
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === "PARSE_URL") {
        sendResponse({ ok: true, parsed: parseChapterUrl(msg.url) });
        return;
      }

      if (msg?.type === "FORCE_SAVE") {
        const record = await saveProgressFromUrl(msg.url, { force: true });
        if (!record) {
          sendResponse({ ok: false, error: "This page doesn’t look like a chapter URL." });
          return;
        }
        sendResponse({ ok: true, record });
        return;
      }

      if (msg?.type === "GET_LAST") {
        const { lastBadgeText } = await STORAGE.get(["lastBadgeText"]);
        sendResponse({ ok: true, lastBadgeText: lastBadgeText || "" });
        return;
      }

      if (msg?.type === "GET_ALL") {
        const data = await STORAGE.get(null);
        const records = Object.values(data).filter(v => v && v.lastUrl && v.lastChapter);
        records.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        sendResponse({ ok: true, records });
        return;
      }

      if (msg?.type === "DELETE_SERIES") {
        const seriesKey = msg.seriesKey;
        if (!seriesKey) {
          sendResponse({ ok: false, error: "Missing seriesKey." });
          return;
        }

        await STORAGE.remove(seriesKey);

        // If we deleted the record that was driving the badge, recompute.
        // We compare against stored lastBadgeText (chapter only); safest is recompute always.
        const newBadge = await recomputeLastBadgeFromRecords();

        sendResponse({ ok: true, newBadge });
        return;
      }

      if (msg?.type === "IMPORT") {
        const records = msg.records;
        if (!Array.isArray(records) || !records.length) {
          sendResponse({ ok: false, error: "No valid records to import." });
          return;
        }

        const toSet = {};
        let count = 0;
        for (const r of records) {
          if (r.seriesKey && r.lastUrl && r.lastChapter) {
            toSet[r.seriesKey] = {
              seriesKey: r.seriesKey,
              host: r.host || "",
              seriesName: r.seriesName || "",
              lastChapter: r.lastChapter,
              lastUrl: r.lastUrl,
              updatedAt: r.updatedAt || Date.now()
            };
            count++;
          }
        }

        if (!count) {
          sendResponse({ ok: false, error: "No valid records found in data." });
          return;
        }

        await STORAGE.set(toSet);
        await recomputeLastBadgeFromRecords();
        sendResponse({ ok: true, count });
        return;
      }

      sendResponse({ ok: false, error: "Unknown message type." });
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
  })();

  return true;
});