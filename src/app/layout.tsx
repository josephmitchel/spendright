import type { Metadata } from 'next';
import { connection } from 'next/server';

export const metadata: Metadata = {
  title: 'SpendRight',
  description: 'Spending optimization through credit card rewards',
};

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  // Per-request rendering so the CSP nonce reaches every script tag.
  // Design: nonce-based-csp.
  await connection();
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
