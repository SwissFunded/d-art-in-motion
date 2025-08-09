create schema if not exists swissfunded_art;

create table if not exists swissfunded_art.artworks_flat (
  id uuid primary key default gen_random_uuid(),
  nummer integer unique not null,
  artist_name text,
  title text,
  location_raw text,
  location_normalized text,
  exhibitions text,
  created_at timestamptz not null default now()
);

-- Enable Row Level Security
alter table swissfunded_art.artworks_flat enable row level security;

-- Policy: allow authenticated and service_role to read
create policy "read_all_authenticated_flat"
on swissfunded_art.artworks_flat
for select
using (auth.role() in ('authenticated','service_role'));

-- Policy: allow only service_role to insert
create policy "write_service_only_flat"
on swissfunded_art.artworks_flat
for insert
with check (auth.role() = 'service_role');

-- Helpful indexes
create index if not exists idx_flat_nummer
  on swissfunded_art.artworks_flat(nummer);

create index if not exists idx_flat_location_norm
  on swissfunded_art.artworks_flat(location_normalized);
## Background and Motivation

D-Art in Motion is a minimal dashboard for a Supabase-backed database to track what artwork has been moved to where and to surface all relevant information from the database in a simple, readable UI.

## Key Challenges and Analysis

- Schema provided: primary table is `swissfunded_art.artworks_flat` with fields `id (uuid, pk)`, `nummer (int, unique, not null)`, `artist_name (text)`, `title (text)`, `location_raw (text)`, `location_normalized (text)`, `exhibitions (text)`, `created_at (timestamptz, default now())`.
- RLS: Current policy allows SELECT for `authenticated` and `service_role` only; `anon` is NOT permitted. Using the anon key without an authenticated session will fail reads. We need either a public read policy for this table or an auth flow.
- Simplicity: Provide a minimal, fast UI that lists artwork info; movement history is not present in this table, so we will focus on listing with basic filtering/search.

## High-level Task Breakdown

1) Finalize read access strategy (policy vs auth)
   - Success criteria: Either (A) a policy that permits public SELECT on `swissfunded_art.artworks_flat`, or (B) an auth method enabled (email/password, magic link, or anonymous) so client sessions get `authenticated` role.

2) Scaffold minimal UI (static HTML/JS) with Supabase client
   - Success criteria: App loads in a browser, initializes Supabase using the provided URL and anon key, and can run a simple connectivity check.

3) Implement data fetching and display for `artworks_flat`
   - Success criteria: The UI lists records with columns: `nummer`, `artist_name`, `title`, `location_raw`, `location_normalized`, `exhibitions`, `created_at`.
   - Include basic client-side search/filter (by `nummer`, `artist_name`, `title`, `location_*`).

4) Optional: Generic table explorer (future)
   - Success criteria: User can input a table name and see rows rendered; errors are shown clearly if the table is not accessible.

5) Basic UX polish
   - Success criteria: Minimalist styling, responsive layout, empty states, loading and error indicators.

6) Manual test checklist
   - Success criteria: Connection works, tables render data, basic interactions work without console errors.

## Project Status Board

- [x] 1) Confirm schema or choose generic explorer approach
- [x] 1a) Decide read access approach: public read policy vs auth flow (RLS disabled; public reads allowed)
- [x] 2) Create minimal static frontend skeleton (index.html + JS)
- [x] 3) Initialize Supabase client from Environment & Keys
- [x] 4) Implement `artworks_flat` list view (with basic search/filter)
- [x] 5) Add basic styling and loading/error states
- [ ] 6) Manual test and iterate

## Current Status / Progress Tracking

- Created scratchpad and stored Supabase credentials.
- Recorded provided schema and RLS policies for `swissfunded_art.artworks_flat`.
- RLS has been disabled; reads are now permitted with the anon key.
- Implemented minimal static UI (index.html, styles.css, app.js) to list `artworks_flat` with search and pagination.
- Next: manual verification in browser and any follow-up UX tweaks.

## Executor's Feedback or Assistance Requests

- Please confirm whether to proceed in Planner mode (refine plan with selected access approach) or Executor mode (start building the UI now).
- Choose read approach:
  - Option A (simplest): Allow public read for this one table. Example policy:
    - `create policy if not exists "read_all_public_flat" on swissfunded_art.artworks_flat for select using (true);`
  - Option B: Keep current policy and enable an auth flow (email/password, magic link, or anonymous sign-in if available) so the client becomes `authenticated`.
  - Option C: Provide a backend proxy with the `service_role` key (not recommended inside the client) — more setup.

Once decided, I will implement accordingly.

## Lessons

(To be filled as implementation proceeds.)

## Environment & Keys

## Database Schema Notes

Schema: `swissfunded_art`

Table: `artworks_flat`
- `id` uuid primary key default `gen_random_uuid()`
- `nummer` integer unique not null
- `artist_name` text
- `title` text
- `location_raw` text
- `location_normalized` text
- `exhibitions` text
- `created_at` timestamptz not null default `now()`

RLS:
- Enabled on `artworks_flat`.
- SELECT permitted for roles: `authenticated`, `service_role` (current policy name: `read_all_authenticated_flat`).
- INSERT permitted only for role: `service_role` (policy: `write_service_only_flat`).

- SUPABASE_URL: https://kxavyfrilkifmrybrgkw.supabase.co
- SUPABASE_ANON_KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4YXZ5ZnJpbGtpZm1yeWJyZ2t3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ3MjYwNzcsImV4cCI6MjA3MDMwMjA3N30.3lOl7Noc00CEHszO1AqZ4K7s1tJzDD5Et1Nt1bOOkYw


