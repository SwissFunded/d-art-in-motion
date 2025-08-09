"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase, config } from "@/lib/supabase";

type Row = Record<string, unknown>;

export default function Home() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [search, setSearch] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [count, setCount] = useState<number>(0);
  const [sort, setSort] = useState<{ key: string | null; dir: "asc" | "desc" }>({ key: null, dir: "asc" });
  const [filterArtist, setFilterArtist] = useState<string>("");
  const [filterLocation, setFilterLocation] = useState<string>("");
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("daim_hidden_columns");
      if (!raw) return new Set<string>();
      const arr = JSON.parse(raw) as string[];
      return new Set(arr);
    } catch {
      return new Set<string>();
    }
  });
  const [showColumnsPanel, setShowColumnsPanel] = useState<boolean>(false);
  const [hideEmptyColumns, setHideEmptyColumns] = useState<boolean>(() => {
    try {
      return localStorage.getItem("daim_hide_empty_columns") === "1";
    } catch {
      return false;
    }
  });

  const columns = useMemo(() => {
    const base = [
      "nummer",
      "artist_name",
      "title",
      "location",
      "location_raw",
      "location_normalized",
      "exhibitions",
      "created_at",
    ];
    const keys = new Set<string>();
    rows.forEach((r) => Object.keys(r).forEach((k) => keys.add(k)));
    const ordered = base.filter((k) => keys.has(k));
    for (const k of keys) if (!ordered.includes(k)) ordered.push(k);
    return ordered.length ? ordered : base;
  }, [rows]);

  // Sync hidden columns persistence when it changes
  useEffect(() => {
    try {
      localStorage.setItem("daim_hidden_columns", JSON.stringify(Array.from(hiddenColumns)));
    } catch {}
  }, [hiddenColumns]);

  useEffect(() => {
    try {
      localStorage.setItem("daim_hide_empty_columns", hideEmptyColumns ? "1" : "0");
    } catch {}
  }, [hideEmptyColumns]);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      if (!supabase) {
        setError("Missing Supabase configuration. Set env variables.");
        return;
      }
      setLoading(true);
      setError("");
      try {
        const source = config.schema && config.schema !== "public"
          ? supabase.schema(config.schema).from(config.table)
          : supabase.from(config.table);

        const offset = (page - 1) * pageSize;
        let q = source.select("*", { count: "exact" }).range(offset, offset + pageSize - 1);
        if (sort.key) {
          q = q.order(sort.key, { ascending: sort.dir === "asc" });
        }
        const { data, error: err, count: c } = await q;
        if (err) throw err;
        if (!isMounted) return;
        setRows(data || []);
        setCount(c || 0);
      } catch (e: any) {
        if (!isMounted) return;
        setRows([]);
        setCount(0);
        const tip = config.schema && config.schema !== "public"
          ? `Expose schema ${config.schema} in Project Settings → API → Exposed Schemas, or create a public view.`
          : "Ensure the table exists in public or create a view.";
        setError((e?.message || String(e)) + "\n" + tip);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    load();
    return () => { isMounted = false; };
  }, [page, pageSize, sort]);
  function toggleSort(column: string) {
    setPage(1);
    setSort((prev) => {
      if (prev.key !== column) return { key: column, dir: "asc" };
      if (prev.dir === "asc") return { key: column, dir: "desc" };
      return { key: null, dir: "asc" };
    });
  }

  function sortIndicator(column: string) {
    if (sort.key !== column) return "";
    return sort.dir === "asc" ? " ▲" : " ▼";
  }

  const filtered = useMemo(() => {
    let out = rows;
    // Global search across all columns
    if (search) {
      const s = search.toLowerCase();
      out = out.filter((r) =>
        columns.some((c) => {
          const v = r[c as keyof typeof r];
          if (v == null) return false;
          return String(v).toLowerCase().includes(s);
        })
      );
    }
    // Quick filters
    if (filterArtist) {
      const key = columns.includes("artist_name") ? "artist_name" : (columns.includes("artist") ? "artist" : null);
      if (key) {
        const s = filterArtist.toLowerCase();
        out = out.filter((r) => String(r[key as keyof typeof r] ?? "").toLowerCase().includes(s));
      }
    }
    if (filterLocation) {
      const locKey = ["location", "location_normalized", "location_raw", "location_to", "location_from"].find((k) => columns.includes(k));
      if (locKey) {
        const s = filterLocation.toLowerCase();
        out = out.filter((r) => String(r[locKey as keyof typeof r] ?? "").toLowerCase().includes(s));
      }
    }
    return out;
  }, [rows, search, filterArtist, filterLocation, columns]);

  // Columns to display (visibility + optionally hide empty)
  const displayColumns = useMemo(() => {
    const base = columns.filter((c) => !hiddenColumns.has(c));
    if (!hideEmptyColumns || filtered.length === 0) return base;
    const nonEmpty = base.filter((c) => filtered.some((r) => {
      const v = r[c as keyof typeof r];
      return v != null && String(v).trim() !== "";
    }));
    return nonEmpty.length ? nonEmpty : base;
  }, [columns, hiddenColumns, hideEmptyColumns, filtered]);

  // Row details drawer
  const [selected, setSelected] = useState<Row | null>(null);
  const closeDrawer = () => setSelected(null);

  return (
    <div>
      <header className="header">
        <div className="wrap">
          <h1 className="title">D-Art in Motion</h1>
          <div className="subtitle">{`${config.schema || 'public'}.${config.table}`}</div>
        </div>
      </header>

      <main className="wrap">
        <div className="controls">
          <input
            className="input"
            placeholder="Search by any column..."
            value={search}
            onChange={(e) => { setPage(1); setSearch(e.target.value); }}
          />
          <input
            className="input"
            placeholder="Filter artist..."
            value={filterArtist}
            onChange={(e) => { setPage(1); setFilterArtist(e.target.value); }}
          />
          <input
            className="input"
            placeholder="Filter location..."
            value={filterLocation}
            onChange={(e) => { setPage(1); setFilterLocation(e.target.value); }}
          />
          <button className="btn" onClick={() => { setSearch(""); setFilterArtist(""); setFilterLocation(""); setPage(1); }}>Clear</button>
          <button className="btn" onClick={() => setShowColumnsPanel((s) => !s)}>Columns</button>
        </div>

        {showColumnsPanel && (
          <div className="columns-panel">
            <div className="columns-grid">
              {columns.map((c) => (
                <label key={c} className="col-item">
                  <input
                    type="checkbox"
                    checked={!hiddenColumns.has(c)}
                    onChange={(e) => {
                      setHiddenColumns((prev) => {
                        const next = new Set(Array.from(prev));
                        if (e.target.checked) next.delete(c); else next.add(c);
                        return next;
                      });
                    }}
                  />
                  <span>{c}</span>
                </label>
              ))}
            </div>
            <label className="col-item" style={{ marginTop: 8 }}>
              <input type="checkbox" checked={hideEmptyColumns} onChange={(e) => setHideEmptyColumns(e.target.checked)} />
              <span>Hide empty columns</span>
            </label>
          </div>
        )}

        <div className="status">
          {loading ? <span>Loading…</span> : null}
          {error ? <div className="error">{error}</div> : null}
          <div className="count">{count ? `Total: ${count}` : ""}</div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                {displayColumns.map((c) => (
                  <th key={c} className="th-sort" onClick={() => toggleSort(c)} title="Click to sort">
                    {c}
                    <span className="sort-indicator">{sortIndicator(c)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: Math.min(pageSize, 10) }).map((_, i) => (
                  <tr key={`sk-${i}`} className="skeleton-row">
                    {displayColumns.map((c) => (
                      <td key={`${c}-${i}`}><span className="skeleton" /></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td className="empty" colSpan={displayColumns.length}>No records</td></tr>
              ) : (
                filtered.map((r, idx) => (
                  <tr key={idx} className="row" onClick={() => setSelected(r)}>
                    {displayColumns.map((c) => {
                      const v = r[c as keyof typeof r];
                      const text = c === 'created_at' && v ? new Date(String(v)).toLocaleString() : String(v ?? '');
                      return <td key={c} title={text}>{text}</td>;
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="pagination">
          <button className="btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Prev</button>
          <span className="path">Page {page}</span>
          <button className="btn" onClick={() => setPage((p) => p + 1)} disabled={(page * pageSize) >= count}>Next</button>
          <select className="select" value={pageSize} onChange={(e) => { setPage(1); setPageSize(Number(e.target.value)); }}>
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
        {selected && (
          <>
            <div className="drawer-backdrop" onClick={closeDrawer} />
            <aside className="drawer">
              <div className="drawer-header">
                <strong>Details</strong>
                <button className="btn" onClick={closeDrawer} aria-label="Close">Close</button>
              </div>
              <div className="drawer-body">
                <table className="table">
                  <tbody>
                    {Object.keys(selected).map((k) => {
                      const v = selected[k];
                      const text = k === 'created_at' && v ? new Date(String(v)).toLocaleString() : String(v ?? '');
                      return (
                        <tr key={k}>
                          <th style={{ width: 180 }}>{k}</th>
                          <td title={text}>{text}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </aside>
          </>
        )}
      </main>
    </div>
  );
}


