'use client';

import { GuardedButton } from '@/components/GuardedButton';

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
          <GuardedButton onClick={onRetryAction} unavailable={retryPending === true}>
            Retry
          </GuardedButton>
          {/* Wrapper must stay mounted. */}
          <span role="status">{retryPending ? ' Retrying…' : null}</span>
        </>
      )}
    </>
  );
  return inline ? <span role="alert"> {content}</span> : <p role="alert">{content}</p>;
}
