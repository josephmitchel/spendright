'use client';

// A root-layout failure replaces the whole document, so this renders its own
// html/body shell.
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main>
          <h1>Something went wrong</h1>
          <p role="alert">SpendRight hit an unexpected error — retry, or reload the page.</p>
          <p>
            <button onClick={reset}>Retry</button>
          </p>
        </main>
      </body>
    </html>
  );
}
