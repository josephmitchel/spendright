'use client';

import type { ComponentPropsWithoutRef } from 'react';

// Unavailable buttons stay focusable (aria-disabled, never disabled) so a
// transient pending state can't eject keyboard focus to <body>.
export function GuardedButton({
  unavailable,
  onClick,
  style,
  ...rest
}: Omit<ComponentPropsWithoutRef<'button'>, 'disabled'> & { unavailable: boolean }) {
  return (
    <button
      {...rest}
      aria-disabled={unavailable || undefined}
      style={unavailable ? { opacity: 0.5, ...style } : style}
      onClick={(event) => {
        if (unavailable) return;
        onClick?.(event);
      }}
    />
  );
}
