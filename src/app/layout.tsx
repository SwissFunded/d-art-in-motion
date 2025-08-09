import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'D-Art in Motion',
  description: 'Minimal Supabase dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}


