import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

export const supabase = url && key ? createClient(url, key) : null;

export const config = {
  schema: (process.env.NEXT_PUBLIC_SUPABASE_SCHEMA as string) || 'public',
  table: (process.env.NEXT_PUBLIC_SUPABASE_TABLE as string) || 'artworks_flat',
};


