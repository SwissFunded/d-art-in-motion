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
  }, [page, pageSize]);

  const filtered = useMemo(() => {
    if (!search) return rows;
    const s = search.toLowerCase();
    return rows.filter((r) =>
      columns.some((c) => {
        const v = r[c as keyof typeof r];
        if (v == null) return false;
        return String(v).toLowerCase().includes(s);
      })
    );
  }, [rows, search, columns]);

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
          <button className="btn" onClick={() => { setSearch(""); setPage(1); }}>Reset</button>
        </div>

        <div className="status">
          {loading ? <span>Loading…</span> : null}
          {error ? <div className="error">{error}</div> : null}
          <div className="count">{count ? `Total: ${count}` : ""}</div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td className="empty" colSpan={columns.length}>No records</td></tr>
              ) : (
                filtered.map((r, idx) => (
                  <tr key={idx}>
                    {columns.map((c) => {
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
      </main>
    </div>
  );
}


