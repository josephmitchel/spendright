'use client';

// Catches render-time exceptions the fetch-level load protocol can't.
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main>
      <h1>Something went wrong</h1>
      <p role="alert">This page hit an unexpected error — retry, or reload the page.</p>
      <p>
        <button onClick={reset}>Retry</button>
      </p>
    </main>
  );
}
