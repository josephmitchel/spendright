import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Not found — SpendRight' };

export default function NotFound() {
  return (
    <main>
      <h1>Page not found</h1>
      <p>This page doesn&apos;t exist — the link may be stale or its account disconnected.</p>
      <p>
        <Link href="/">Back to SpendRight</Link>
      </p>
    </main>
  );
}
