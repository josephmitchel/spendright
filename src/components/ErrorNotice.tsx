'use client';

export function ErrorNotice({
  error,
  onRetryAction,
  retryPending,
  inline,
}: {
  error: string;
  onRetryAction?: () => void;
  retryPending?: boolean;
  inline?: boolean;
}) {
  const content = (
    <>
      Error: {error}
      {onRetryAction && (
        <>
          {' '}
          <button onClick={onRetryAction} disabled={retryPending}>
            Retry
          </button>
          {/* Wrapper must stay mounted. */}
          <span role="status">{retryPending ? ' Retrying…' : null}</span>
        </>
      )}
    </>
  );
  return inline ? <span role="alert"> {content}</span> : <p role="alert">{content}</p>;
}
