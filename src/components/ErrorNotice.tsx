'use client';

export function ErrorNotice({
  error,
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
  return inline ? <span role="alert"> {content}</span> : <p role="alert">{content}</p>;
}
