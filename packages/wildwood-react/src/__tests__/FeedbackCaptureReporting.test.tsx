/**
 * What the feedback widget SAYS when a capture does not produce a screenshot.
 *
 * The reported bug was a message — every failure rendered "Failed to capture screenshot.",
 * including causes only the site owner could act on, and including the user simply cancelling.
 * The capture module is covered in feedbackScreenshot.test.ts; this file covers the reporting
 * decision, which is the half of the fix the user actually reads.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { createWrapper } from './testUtils.js';

const captureArea = vi.fn();
const captureFullPage = vi.fn();

vi.mock('../components/feedback/feedbackScreenshot.js', async () => {
  // The real ScreenshotCaptureError is kept: the widget branches on `instanceof`, so a
  // hand-rolled stand-in would let a broken check pass.
  const actual = await vi.importActual<typeof import('../components/feedback/feedbackScreenshot.js')>(
    '../components/feedback/feedbackScreenshot.js',
  );
  return { ...actual, captureArea: () => captureArea(), captureFullPage: () => captureFullPage() };
});

const { FeedbackComponent } = await import('../components/feedback/FeedbackComponent.js');
const { ScreenshotCaptureError } = await import('../components/feedback/feedbackScreenshot.js');

/**
 * Render the panel already open and press "Capture Area". The launcher opens on drag-aware
 * pointer handlers rather than a click, and that is not what these tests are about.
 */
async function clickCaptureArea(): Promise<void> {
  render(<FeedbackComponent open />, { wrapper: createWrapper() });
  fireEvent.click(await screen.findByRole('button', { name: /capture area/i }));
}

/** The widget's single status line, whether it is an error or a success. */
function statusText(): string | null {
  return document.querySelector('.ww-feedback-status')?.textContent ?? null;
}

beforeEach(() => {
  captureArea.mockReset();
  captureFullPage.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('what the widget reports about a capture', () => {
  it('names the cause instead of the old catch-all string', async () => {
    captureArea.mockRejectedValue(
      new ScreenshotCaptureError('library-blocked', 'Could not load the screenshot library from https://cdn'),
    );
    await clickCaptureArea();

    const status = await screen.findByText(/screenshot library isn't available/i);
    expect(status).toBeTruthy();
    expect(screen.queryByText('Failed to capture screenshot.')).toBeNull();
  });

  it('says nothing at all when the user declines the share prompt', async () => {
    // A dismissed picker rejects rather than resolving null, so it reaches the same catch as a
    // real failure. Reporting a decision back as an error would be nagging.
    captureArea.mockRejectedValue(new ScreenshotCaptureError('permission', 'Screen capture was declined'));
    await clickCaptureArea();

    await waitFor(async () => {
      const button = await screen.findByRole('button', { name: /capture area/i });
      expect(button.hasAttribute('disabled')).toBe(false);
    });
    // The buttons come back, and nothing is said about it.
    expect(statusText()).toBeNull();
  });

  it('still reports something when the rejection is not one of ours', async () => {
    // Reachable in practice: `toDataURL` throws a plain SecurityError when the canvas has been
    // tainted by a cross-origin image, which `useCORS` does not always prevent.
    captureArea.mockRejectedValue(new DOMException('Tainted canvas', 'SecurityError'));
    await clickCaptureArea();

    expect(await screen.findByText('Failed to capture screenshot.')).toBeTruthy();
  });

  it('passes through the specific message a generic failure carries', async () => {
    captureArea.mockRejectedValue(new ScreenshotCaptureError('failed', 'The captured frame was empty'));
    await clickCaptureArea();

    expect(await screen.findByText('The captured frame was empty')).toBeTruthy();
  });

  it('re-enables the buttons after a failure, so the widget is never left stuck', async () => {
    // `capturing` puts display:none on the whole widget. A path that failed to clear it would
    // leave the user with no way back but a page reload.
    captureArea.mockRejectedValue(new ScreenshotCaptureError('failed', 'nope'));
    await clickCaptureArea();

    await waitFor(async () => {
      const button = await screen.findByRole('button', { name: /capture area/i });
      expect(button.hasAttribute('disabled')).toBe(false);
    });
  });

  it('reports nothing and attaches nothing when the capture resolves as a cancel', async () => {
    captureArea.mockResolvedValue(null);
    await clickCaptureArea();

    await waitFor(async () => {
      const button = await screen.findByRole('button', { name: /capture area/i });
      expect(button.hasAttribute('disabled')).toBe(false);
    });
    expect(screen.queryByAltText('Screenshot preview')).toBeNull();
    expect(statusText()).toBeNull();
  });
});
