import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GuardedButton } from '@/components/GuardedButton';

describe('GuardedButton', () => {
  it('fires onClick when available and carries no aria-disabled', async () => {
    const onClick = vi.fn();
    render(
      <GuardedButton unavailable={false} onClick={onClick}>
        Sync all
      </GuardedButton>,
    );
    const button = screen.getByRole('button', { name: 'Sync all' });
    expect(button.hasAttribute('aria-disabled')).toBe(false);

    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('swallows clicks when unavailable but never uses the disabled attribute', async () => {
    const onClick = vi.fn();
    render(
      <GuardedButton unavailable onClick={onClick}>
        Sync all
      </GuardedButton>,
    );
    const button = screen.getByRole('button', { name: 'Sync all' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.hasAttribute('disabled')).toBe(false);

    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('keeps keyboard focus when it flips unavailable mid-focus', () => {
    const { rerender } = render(
      <GuardedButton unavailable={false} onClick={() => undefined}>
        Previous
      </GuardedButton>,
    );
    const button = screen.getByRole('button', { name: 'Previous' });
    button.focus();
    expect(document.activeElement).toBe(button);

    // A background poll flipping the pending state must not eject focus to
    // <body>, which is exactly what a real disabled attribute would do.
    rerender(
      <GuardedButton unavailable onClick={() => undefined}>
        Previous
      </GuardedButton>,
    );
    expect(document.activeElement).toBe(button);
  });
});
