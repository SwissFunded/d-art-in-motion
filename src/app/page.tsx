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
  const [artistOptions, setArtistOptions] = useState<string[]>([]);
  const [locationOptions, setLocationOptions] = useState<string[]>([]);

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

  // Load dropdown options (distinct-ish) for artist and location columns
  useEffect(() => {
    let isMounted = true;
    async function loadOptions() {
      if (!supabase) return;
      try {
        const source = config.schema && config.schema !== "public"
          ? supabase.schema(config.schema).from(config.table)
          : supabase.from(config.table);

        // Determine best-matching column names
        const artistKey = ["artist_name", "artist"].find((k) => columns.includes(k));
        const locationKey = ["location", "location_normalized", "location_raw", "location_to", "location_from"].find((k) => columns.includes(k));

        const MAX = 10000;
        if (artistKey) {
          const { data } = await source
            .select(`${artistKey}`)
            .not(artistKey, 'is', null)
            .order(artistKey, { ascending: true })
            .range(0, MAX - 1);
          if (isMounted) {
            const set = new Set<string>();
            (data || []).forEach((r: any) => {
              const v = String(r[artistKey] ?? "").trim();
              if (v) set.add(v);
            });
            setArtistOptions(Array.from(set));
          }
        } else {
          if (isMounted) setArtistOptions([]);
        }

        if (locationKey) {
          const { data } = await source
            .select(`${locationKey}`)
            .not(locationKey, 'is', null)
            .order(locationKey, { ascending: true })
            .range(0, MAX - 1);
          if (isMounted) {
            const set = new Set<string>();
            (data || []).forEach((r: any) => {
              const v = String(r[locationKey] ?? "").trim();
              if (v) set.add(v);
            });
            setLocationOptions(Array.from(set));
          }
        } else {
          if (isMounted) setLocationOptions([]);
        }
      } catch {
        // Fail silently for options; main data still loads
      }
    }
    loadOptions();
    return () => { isMounted = false; };
  }, [columns]);
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

  // Recent location changes section
  type Move = { id: string; artwork_id: string; nummer?: number; artist_name?: string; old_location?: string; new_location?: string; changed_at?: string; completed?: boolean | null };
  const [moves, setMoves] = useState<Move[]>([]);
  const [movesLoading, setMovesLoading] = useState<boolean>(false);
  const [movesError, setMovesError] = useState<string>("");
  const [movesPage, setMovesPage] = useState<number>(1);
  const [movesPageSize, setMovesPageSize] = useState<number>(10);
  const [movesCount, setMovesCount] = useState<number>(0);
  const [movesView, setMovesView] = useState<'pending' | 'completed'>('pending');
  const [confirming, setConfirming] = useState<Move | null>(null);
  const [animatingDoneId, setAnimatingDoneId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadMoves() {
      if (!supabase) return;
      setMovesLoading(true);
      setMovesError("");
      try {
        const source = config.schema && config.schema !== "public"
          ? supabase.schema("public").from("artwork_location_changes") // changes table is in public
          : supabase.from("artwork_location_changes");
        const offset = (movesPage - 1) * movesPageSize;
        const { data, error, count, status } = await source
          .select("id, artwork_id, nummer, artist_name, old_location, new_location, changed_at, completed", { count: "exact" })
          .eq('completed', movesView === 'completed')
          .order("changed_at", { ascending: false })
          .range(offset, offset + movesPageSize - 1);
        if (error) throw Object.assign(error, { status });
        if (!isMounted) return;
        setMoves(data || []);
        setMovesCount(count || 0);
      } catch (e: any) {
        if (!isMounted) return;
        setMoves([]);
        setMovesCount(0);
        const tip = "If the table 'public.artwork_location_changes' does not exist, run the SQL setup shown below.";
        setMovesError((e?.message || String(e)) + "\n" + tip);
      } finally {
        if (isMounted) setMovesLoading(false);
      }
    }
    loadMoves();
    return () => { isMounted = false; };
  }, [movesPage, movesPageSize, movesView]);

  // Realtime updates for moves
  useEffect(() => {
    if (!supabase) return;
    const ch = supabase
      .channel("realtime:public:artwork_location_changes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "artwork_location_changes" }, (payload: any) => {
        setMoves((prev) => [payload.new as Move, ...prev].slice(0, movesPageSize));
        setMovesCount((c) => c + 1);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "artwork_location_changes" }, (payload: any) => {
        const updated = payload.new as Move;
        setMoves((prev) => prev.filter((m) => m.id !== updated.id || !updated.completed));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [movesPageSize]);

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
          {artistOptions.length > 0 && (
            <select className="select" value={filterArtist} onChange={(e) => { setPage(1); setFilterArtist(e.target.value); }}>
              <option value="">All artists</option>
              {artistOptions.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          )}
          {locationOptions.length > 0 && (
            <select className="select" value={filterLocation} onChange={(e) => { setPage(1); setFilterLocation(e.target.value); }}>
              <option value="">All locations</option>
              {locationOptions.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          )}
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
      <section className="wrap" style={{ paddingTop: 0 }}>
        <h2 className="title" style={{ fontSize: 18, marginTop: 8 }}>Recent Location Changes</h2>
        <div className="segmented" role="tablist" aria-label="Changes view">
          <button
            className={`seg-btn ${movesView === 'pending' ? 'is-active' : ''}`}
            role="tab"
            aria-selected={movesView === 'pending'}
            onClick={() => { setMovesView('pending'); setMovesPage(1); }}
          >Pending</button>
          <button
            className={`seg-btn ${movesView === 'completed' ? 'is-active' : ''}`}
            role="tab"
            aria-selected={movesView === 'completed'}
            onClick={() => { setMovesView('completed'); setMovesPage(1); }}
          >Completed</button>
        </div>
        <div className="status">
          {movesLoading ? <span>Loading…</span> : null}
          {movesError ? <div className="error">{movesError}</div> : null}
          <div className="count">{movesCount ? `${movesCount} ${movesView}` : ""}</div>
        </div>
        {(!movesError && moves.length === 0 && !movesLoading) ? (
          <div className="columns-panel" style={{ marginTop: 8 }}>
            <div style={{ fontSize: 14, color: 'var(--muted)' }}>To enable tracking, run this in Supabase SQL Editor:</div>
            <pre style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>
{`-- Location change audit table (adds 'completed' flag)
create table if not exists public.artwork_location_changes (
  id uuid primary key default gen_random_uuid(),
  artwork_id uuid not null,
  nummer int,
  artist_name text,
  old_location text,
  new_location text,
  changed_at timestamptz not null default now(),
  completed boolean not null default false
);

-- Trigger function to log changes when location_normalized is updated
create or replace function public.log_artwork_location_change() returns trigger language plpgsql as $$
begin
  if coalesce(new.location_normalized, '') is distinct from coalesce(old.location_normalized, '') then
    insert into public.artwork_location_changes (artwork_id, nummer, artist_name, old_location, new_location, changed_at)
    values (new.id, new.nummer, new.artist_name, old.location_normalized, new.location_normalized, now());
  end if;
  return new;
end;$$;

-- Attach trigger to your table (note the quotes for the space in the name)
drop trigger if exists trg_log_location_change on public."Data Artworks";
create trigger trg_log_location_change
after update of location_normalized on public."Data Artworks"
for each row execute function public.log_artwork_location_change();`}
            </pre>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Changed</th>
                  <th>Nummer</th>
                  <th>Artist</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {moves.map((m) => (
                  <tr key={m.id} className={animatingDoneId === m.id ? 'row row-done' : ''}>
                    <td>{m.changed_at ? new Date(String(m.changed_at)).toLocaleString() : ''}</td>
                    <td>{m.nummer ?? ''}</td>
                    <td>{m.artist_name ?? ''}</td>
                    <td title={m.old_location || ''}>{m.old_location ?? ''}</td>
                    <td title={m.new_location || ''}>{m.new_location ?? ''}</td>
                    <td>{m.completed ? 'Done' : 'Pending'}</td>
                    <td style={{ textAlign: 'right' }}>
                      {!m.completed && (
                        <button className="btn btn--primary btn--small" onClick={(e) => { e.stopPropagation(); setConfirming(m); }}>Done</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="pagination">
          <button className="btn" onClick={() => setMovesPage((p) => Math.max(1, p - 1))} disabled={movesPage <= 1}>Prev</button>
          <span className="path">Page {movesPage}</span>
          <button className="btn" onClick={() => setMovesPage((p) => p + 1)} disabled={(movesPage * movesPageSize) >= movesCount}>Next</button>
          <select className="select" value={movesPageSize} onChange={(e) => { setMovesPage(1); setMovesPageSize(Number(e.target.value)); }}>
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
        </div>
      </section>
      {confirming && (
        <div className="confirm-backdrop" onClick={() => setConfirming(null)}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="confirm-title">
            <div className="confirm-title" id="confirm-title">Mark change as Done?</div>
            <div className="confirm-body">
              <div className="confirm-row"><span>Nummer</span><strong>{confirming.nummer ?? ''}</strong></div>
              <div className="confirm-row"><span>Artist</span><strong>{confirming.artist_name ?? ''}</strong></div>
              <div className="confirm-row"><span>From</span><strong title={confirming.old_location || ''}>{confirming.old_location ?? ''}</strong></div>
              <div className="confirm-row"><span>To</span><strong title={confirming.new_location || ''}>{confirming.new_location ?? ''}</strong></div>
            </div>
            <div className="confirm-actions">
              <button className="btn btn--small" onClick={() => setConfirming(null)}>Cancel</button>
              <button className="btn btn--primary btn--small" onClick={async () => {
                const id = confirming.id; setConfirming(null); setAnimatingDoneId(id);
                setTimeout(async () => {
                  if (!supabase) return;
                  await supabase.from('artwork_location_changes').update({ completed: true }).eq('id', id);
                  setMoves((prev) => prev.filter((x) => x.id !== id));
                  setAnimatingDoneId(null);
                }, 420);
              }}>Mark Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


