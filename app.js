// D-Art in Motion — configurable Supabase client and table browser

const DEFAULTS = {
  url: (window.DART_CONFIG && window.DART_CONFIG.supabaseUrl) || "",
  key: (window.DART_CONFIG && window.DART_CONFIG.supabaseAnonKey) || "",
  schema: (window.DART_CONFIG && window.DART_CONFIG.schema) || "public",
  table: (window.DART_CONFIG && window.DART_CONFIG.table) || "artworks_flat",
};

function loadConfig() {
  try {
    // If app defaults are present, prefer them so the app works out-of-the-box
    if (DEFAULTS.url && DEFAULTS.key) {
      return { ...DEFAULTS };
    }
    const raw = localStorage.getItem("daim_config");
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return {
      url: (parsed && parsed.url) ? parsed.url : DEFAULTS.url,
      key: (parsed && parsed.key) ? parsed.key : DEFAULTS.key,
      schema: (parsed && parsed.schema) ? parsed.schema : DEFAULTS.schema,
      table: (parsed && parsed.table) ? parsed.table : DEFAULTS.table,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveConfig(cfg) {
  localStorage.setItem("daim_config", JSON.stringify(cfg));
}

let CONFIG = loadConfig();
// Persist loaded config so future loads are consistent
saveConfig(CONFIG);
let supabaseClient = null;

function initClient() {
  if (!CONFIG.url || !CONFIG.key) return;
  supabaseClient = window.supabase.createClient(CONFIG.url, CONFIG.key);
}

initClient();

// DOM elements
const searchInput = document.getElementById("searchInput");
const resetBtn = document.getElementById("resetBtn");
const tableBody = document.getElementById("tableBody");
const emptyState = document.getElementById("emptyState");
const loadingEl = document.getElementById("loading");
const errorEl = document.getElementById("error");
const countEl = document.getElementById("count");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const pageInfo = document.getElementById("pageInfo");
const pageSizeSelect = document.getElementById("pageSize");
const subtitleEl = document.getElementById("subtitle");
const pathInfoEl = document.getElementById("pathInfo");
const tableHeadRow = document.getElementById("tableHeadRow");
const settingsDetails = document.getElementById("settingsDetails");
// Settings inputs
const cfgUrl = document.getElementById("cfgUrl");
const cfgKey = document.getElementById("cfgKey");
const cfgSchema = document.getElementById("cfgSchema");
const cfgTable = document.getElementById("cfgTable");
const saveConfigBtn = document.getElementById("saveConfigBtn");
const testConfigBtn = document.getElementById("testConfigBtn");
const useDefaultsBtn = document.getElementById("useDefaultsBtn");

// State
let currentPage = 1;
let pageSize = parseInt(pageSizeSelect.value, 10) || 25;
let currentSearch = "";
let totalCount = 0;
let currentColumns = [
  "nummer",
  "artist_name",
  "title",
  "location",
  "location_raw",
  "location_normalized",
  "exhibitions",
  "created_at",
];

function setLoading(isLoading) {
  loadingEl.classList.toggle("hidden", !isLoading);
}

function setError(message) {
  if (!message) {
    errorEl.textContent = "";
    errorEl.classList.add("hidden");
    return;
  }
  errorEl.textContent = message;
  errorEl.classList.remove("hidden");
}

function renderRows(rows) {
  tableBody.innerHTML = "";
  for (const row of rows) {
    const tr = document.createElement("tr");
    const cells = currentColumns.map((col) => {
      let value = row[col];
      if (col === "created_at") {
        value = value ? new Date(value).toLocaleString() : "";
      }
      if (value == null) return "<td></td>";
      const text = String(value);
      return `<td class="truncate" title="${escapeHtml(text)}">${escapeHtml(text)}</td>`;
    });
    tr.innerHTML = cells.join("");
    tableBody.appendChild(tr);
  }
}

function renderTableHeader() {
  if (!tableHeadRow) return;
  if (!currentColumns || currentColumns.length === 0) return;
  tableHeadRow.innerHTML = currentColumns.map((c) => `<th>${escapeHtml(c)}</th>`).join("");
}

function needsQuoting(identifier) {
  // Unquoted identifiers in Postgres must match ^[a-z_][a-z0-9_]*$
  // Anything else (spaces, uppercase, hyphens, etc.) needs quoting
  return !/^[a-z_][a-z0-9_]*$/.test(identifier);
}

function quoteIdentifierIfNeeded(identifier) {
  if (identifier == null) return identifier;
  if (needsQuoting(identifier)) {
    // Escape internal quotes by doubling them, then wrap with quotes
    const escaped = String(identifier).replaceAll('"', '""');
    return `"${escaped}"`;
  }
  return identifier;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function updatePaginationControls() {
  const start = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalCount);
  pageInfo.textContent = `Page ${currentPage}`;
  countEl.textContent = totalCount ? `Showing ${start}–${end} of ${totalCount}` : "";
  prevBtn.disabled = currentPage <= 1;
  nextBtn.disabled = currentPage * pageSize >= totalCount;
}

async function fetchArtworks() {
  setLoading(true);
  setError("");
  emptyState.classList.add("hidden");
  tableBody.innerHTML = "";

  if (!supabaseClient) {
    // Show neutral empty state instead of an error
    errorEl.classList.add("hidden");
    emptyState.textContent = "Configure Supabase in Settings to load data.";
    emptyState.classList.remove("hidden");
    setLoading(false);
    return;
  }

  const sources = CONFIG.schema && CONFIG.schema !== "public"
    ? [ { type: "schema", schema: CONFIG.schema, table: CONFIG.table }, { type: "public", table: CONFIG.table } ]
    : [ { type: "public", table: CONFIG.table } ];

  try {
    let lastError = null;
    for (const source of sources) {
      try {
        const tableIdent = quoteIdentifierIfNeeded(source.table);
        let query = (source.type === "schema"
          ? supabaseClient.schema(source.schema).from(tableIdent)
          : supabaseClient.from(tableIdent))
          .select("*", { count: "exact" });

        const offset = (currentPage - 1) * pageSize;
        query = query.range(offset, offset + pageSize - 1);

        const search = currentSearch.trim();
        if (search) {
          const sanitized = search.replace(/[,%]/g, " ");
          const orParts = [
            `artist_name.ilike.%${sanitized}%`,
            `title.ilike.%${sanitized}%`,
            `location_raw.ilike.%${sanitized}%`,
            `location_normalized.ilike.%${sanitized}%`,
            `exhibitions.ilike.%${sanitized}%`,
          ];
          const asNumber = Number(sanitized);
          if (!Number.isNaN(asNumber) && Number.isFinite(asNumber)) {
            orParts.push(`nummer.eq.${asNumber}`);
          }
          query = query.or(orParts.join(","));
        }

        const { data, error, count, status } = await query;
        if (error) throw Object.assign(error, { status });

        totalCount = count ?? 0;
        // Determine columns dynamically from rows or keep defaults
        if (data && data.length) {
          const keySet = new Set();
          data.forEach((r) => Object.keys(r).forEach((k) => keySet.add(k)));
          const preferred = [
            "nummer",
            "artist_name",
            "title",
            "location",
            "location_raw",
            "location_normalized",
            "exhibitions",
            "created_at",
          ];
          const ordered = preferred.filter((k) => keySet.has(k));
          for (const k of keySet) if (!ordered.includes(k)) ordered.push(k);
          if (ordered.length) currentColumns = ordered;
        }
        renderTableHeader();

        // Apply client-side search if any, across available columns
        const search = currentSearch.trim();
        let rows = data || [];
        if (search && rows.length) {
          const s = search.toLowerCase();
          rows = rows.filter((row) =>
            currentColumns.some((c) => {
              const v = row[c];
              if (v == null) return false;
              return String(v).toLowerCase().includes(s);
            })
          );
          totalCount = rows.length;
          rows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
        } else {
          // simple pagination if server returned more than page size via count
          rows = rows.slice(0, pageSize);
        }

        if (!rows || rows.length === 0) {
          emptyState.classList.remove("hidden");
          renderRows([]);
        } else {
          renderRows(rows);
        }
        updatePaginationControls();
        return; // success from this source
      } catch (e) {
        lastError = e;
        // 406 likely means schema not exposed; try next source
        if (e?.status === 406 || /406/.test(String(e?.message))) {
          continue;
        }
        // 404 table not found in this schema; try next
        if (e?.status === 404) {
          continue;
        }
        // Other errors: break and report
        throw e;
      }
    }
    // If all sources failed
    if (lastError) throw lastError;
  } catch (err) {
    console.error(err);
    const tip = CONFIG.schema && CONFIG.schema !== "public"
      ? `If the schema \"${CONFIG.schema}\" is not exposed in API settings, add it, or create a view in public: \nCREATE OR REPLACE VIEW public.${CONFIG.table} AS SELECT * FROM ${CONFIG.schema}.${CONFIG.table};`
      : "If the table is not found in public schema, ensure it exists or create a view.";
    setError((err.message || "Failed to load data.") + "\n" + tip);
  } finally {
    setLoading(false);
  }
}

function debounce(fn, delay) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

// Event listeners
const debouncedSearch = debounce(() => {
  currentPage = 1;
  currentSearch = searchInput.value;
  fetchArtworks();
}, 300);

searchInput.addEventListener("input", debouncedSearch);
resetBtn.addEventListener("click", () => {
  searchInput.value = "";
  currentSearch = "";
  currentPage = 1;
  fetchArtworks();
});
prevBtn.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage -= 1;
    fetchArtworks();
  }
});
nextBtn.addEventListener("click", () => {
  if (currentPage * pageSize < totalCount) {
    currentPage += 1;
    fetchArtworks();
  }
});
pageSizeSelect.addEventListener("change", () => {
  pageSize = parseInt(pageSizeSelect.value, 10) || 25;
  currentPage = 1;
  fetchArtworks();
});

// Settings wiring
function renderSubtitle() {
  const base = CONFIG.url ? new URL(CONFIG.url).hostname.split(".")[0] : "Not configured";
  subtitleEl.textContent = `${base} — ${CONFIG.schema || "public"}.${CONFIG.table}`;
  pathInfoEl.textContent = `${CONFIG.schema || "public"}.${CONFIG.table}`;
}

function fillSettingsForm() {
  cfgUrl.value = CONFIG.url;
  cfgKey.value = CONFIG.key;
  cfgSchema.value = CONFIG.schema;
  cfgTable.value = CONFIG.table;
}

saveConfigBtn?.addEventListener("click", () => {
  CONFIG = {
    url: cfgUrl.value.trim(),
    key: cfgKey.value.trim(),
    schema: (cfgSchema.value || "public").trim(),
    table: (cfgTable.value || "artworks_flat").trim(),
  };
  saveConfig(CONFIG);
  initClient();
  renderSubtitle();
  currentPage = 1;
  fetchArtworks();
});

testConfigBtn?.addEventListener("click", async () => {
  const testCfg = {
    url: cfgUrl.value.trim(),
    key: cfgKey.value.trim(),
    schema: (cfgSchema.value || "public").trim(),
    table: (cfgTable.value || "artworks_flat").trim(),
  };
  if (!testCfg.url || !testCfg.key) {
    setError("Provide URL and Anon Key to test.");
    return;
  }
  const testClient = window.supabase.createClient(testCfg.url, testCfg.key);
  try {
    setLoading(true);
    setError("");
    const q = (testCfg.schema && testCfg.schema !== "public" ? testClient.schema(testCfg.schema).from(testCfg.table) : testClient.from(testCfg.table))
      .select("id", { count: "exact", head: true })
      .limit(1);
    const { error, status } = await q;
    if (error) throw Object.assign(error, { status });
    setError("Test OK.");
  } catch (e) {
    setError(`Test failed: ${e.message || e}`);
  } finally {
    setLoading(false);
  }
});

useDefaultsBtn?.addEventListener("click", () => {
  CONFIG = { ...DEFAULTS };
  fillSettingsForm();
  saveConfig(CONFIG);
  initClient();
  renderSubtitle();
  currentPage = 1;
  fetchArtworks();
});

// Initial render
fillSettingsForm();
renderSubtitle();
renderTableHeader();
if (CONFIG.url && CONFIG.key) {
  fetchArtworks();
} else {
  // Open settings to guide user; do not show error
  if (settingsDetails) settingsDetails.open = true;
  errorEl.classList.add("hidden");
  emptyState.textContent = "Configure Supabase in Settings to load data.";
  emptyState.classList.remove("hidden");
}


