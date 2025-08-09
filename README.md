# D‑Art in Motion

A minimal, fast dashboard to browse artwork records from Supabase. Built with Next.js + Supabase JS, designed for clarity and speed.

## Demo
Deploy on Vercel and plug in your Supabase URL + anon key.

## Features
- Clean, minimalist white UI
- Supabase-powered, schema/table configurable
- Dynamic columns (renders whatever fields exist)
- Full‑text search across visible columns
- Pagination with adjustable page size

## Quickstart
1) Set env vars (Vercel → Project Settings → Environment Variables):
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- NEXT_PUBLIC_SUPABASE_SCHEMA (e.g., public)
- NEXT_PUBLIC_SUPABASE_TABLE (e.g., Data Artworks)
2) Run locally:

```bash
npm i
npm run dev
```

Open http://localhost:3000

## Notes
If your table lives in a custom schema, expose it in Project Settings → API → Exposed Schemas or create a public view.
