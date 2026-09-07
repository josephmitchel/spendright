'use client';

// The shared error line. `inline` renders a span for callers inside flowing
// content, where a nested <p> would be invalid HTML.
export function ErrorNotice({
  error,
  // The Action suffix is Next's convention for a function prop on a client
  // component; this is a plain callback, not a Server Action.
  onRetryAction,
  inline,
}: {
  error: string;
  onRetryAction?: () => void;
  inline?: boolean;
}) {
  const content = (
    <>
      Error: {error}
      {onRetryAction && (
        <>
          {' '}
          <button onClick={onRetryAction}>Retry</button>
        </>
      )}
    </>
  );
  return inline ? <span> {content}</span> : <p>{content}</p>;
}
