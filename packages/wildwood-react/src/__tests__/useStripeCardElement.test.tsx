/**
 * The card field every paying surface mounts. PaymentComponent and the pack checkout share it, so
 * it has to load Stripe once per key, mount into the container it is given, tear the Element down
 * on the way out, and say so plainly when Stripe.js cannot be loaded at all.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, cleanup } from '@testing-library/react';
import { installMockStripe, type MockStripe } from './mockStripe.js';

const loadStripe = vi.fn().mockResolvedValue(undefined);

vi.mock('@wildwood/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@wildwood/core')>()),
  loadStripe,
}));

const { useStripeCardElement } = await import('../components/payment/useStripeCardElement.js');

function CardProbe({ publishableKey, enabled }: { publishableKey?: string; enabled?: boolean }) {
  const { containerRef, ready, loading, error, cardComplete, cardError } = useStripeCardElement({
    publishableKey,
    enabled,
  });

  return (
    <div>
      <div ref={containerRef} data-testid="card-container" />
      <span data-testid="state">
        {[ready ? 'ready' : '', loading ? 'loading' : '', cardComplete ? 'complete' : ''].filter(Boolean).join(' ')}
      </span>
      {error && <p data-testid="error">{error}</p>}
      {cardError && <p data-testid="card-error">{cardError}</p>}
    </div>
  );
}

let stripe: MockStripe;

beforeEach(() => {
  stripe = installMockStripe();
  loadStripe.mockClear().mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  stripe.uninstall();
});

describe('useStripeCardElement', () => {
  it('loads Stripe once for a key and mounts the card into the container', async () => {
    const view = render(<CardProbe publishableKey="pk_test_1" />);

    await waitFor(() => expect(screen.getByTestId('state').textContent).toContain('ready'));

    expect(loadStripe).toHaveBeenCalledTimes(1);
    expect(stripe.factory).toHaveBeenCalledTimes(1);
    expect(stripe.factory).toHaveBeenCalledWith('pk_test_1');
    expect(stripe.cards).toHaveLength(1);
    expect(stripe.lastCard().mountedIn()).toBe(screen.getByTestId('card-container'));

    // A re-render with the same key reuses the field rather than loading Stripe again.
    view.rerender(<CardProbe publishableKey="pk_test_1" />);
    await waitFor(() => expect(screen.getByTestId('state').textContent).toContain('ready'));
    expect(loadStripe).toHaveBeenCalledTimes(1);
    expect(stripe.cards).toHaveLength(1);
  });

  it('follows the field validation events', async () => {
    render(<CardProbe publishableKey="pk_test_1" />);
    await waitFor(() => expect(stripe.cards).toHaveLength(1));

    act(() => stripe.lastCard().emitChange({ complete: false, error: { message: 'Your card number is incomplete.' } }));
    expect(screen.getByTestId('card-error').textContent).toBe('Your card number is incomplete.');

    act(() => stripe.lastCard().emitChange({ complete: true, empty: false }));
    expect(screen.getByTestId('state').textContent).toContain('complete');
    expect(screen.queryByTestId('card-error')).toBeNull();
  });

  it('destroys the element on unmount and builds a new one for another key', async () => {
    const view = render(<CardProbe publishableKey="pk_test_1" />);
    await waitFor(() => expect(stripe.cards).toHaveLength(1));
    const first = stripe.lastCard();

    view.rerender(<CardProbe publishableKey="pk_test_2" />);
    await waitFor(() => expect(stripe.cards).toHaveLength(2));
    expect(first.destroy).toHaveBeenCalled();
    expect(stripe.factory).toHaveBeenLastCalledWith('pk_test_2');

    view.unmount();
    expect(stripe.cards[1]?.destroy).toHaveBeenCalled();
  });

  it('loads nothing without a key, or while it is disabled', async () => {
    const view = render(<CardProbe />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(loadStripe).not.toHaveBeenCalled();

    view.rerender(<CardProbe publishableKey="pk_test_1" enabled={false} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(loadStripe).not.toHaveBeenCalled();
    expect(stripe.cards).toHaveLength(0);
  });

  it('surfaces a failed load instead of a dead card box', async () => {
    loadStripe.mockRejectedValueOnce(new Error('script blocked'));

    render(<CardProbe publishableKey="pk_test_1" />);

    await waitFor(() => expect(screen.getByTestId('error').textContent).toBe('script blocked'));
    expect(screen.getByTestId('state').textContent).not.toContain('ready');
  });

  it('says so when Stripe.js loads but leaves no global behind', async () => {
    stripe.uninstall();

    render(<CardProbe publishableKey="pk_test_1" />);

    await waitFor(() =>
      expect(screen.getByTestId('error').textContent).toBe('Failed to load Stripe. Please refresh and try again.'),
    );
  });
});
