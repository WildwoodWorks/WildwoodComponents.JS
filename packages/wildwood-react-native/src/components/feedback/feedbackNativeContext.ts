// Native diagnostic context for the React Native FeedbackComponent.
// The web FeedbackComponent (packages/wildwood-react/src/components/feedback/
// feedbackBrowserContext.ts) collects console buffers, viewport, and performance
// timing by patching the browser console and reading window/navigator/performance.
// None of those exist in React Native, so this module provides a minimal, DOM-free
// equivalent built from `react-native`'s Platform + Dimensions APIs. It produces the
// same FeedbackBrowserContext shape the server expects (with an empty consoleLog)
// so a submission still carries useful environment info without touching the DOM.

import { Platform, Dimensions } from 'react-native';
import type { FeedbackBrowserContext } from '@wildwood/core';

/**
 * Collect a snapshot of native environment diagnostics as a JSON string suitable
 * for SubmitFeedbackInput.browserContext. There is no console capture on native
 * (RN's console is not patchable the same way), so consoleLog is always empty.
 * Returns null if anything is unavailable so submission never fails on context.
 */
export function collectNativeContext(): string | null {
  try {
    const window = Dimensions.get('window');
    const screen = Dimensions.get('screen');

    const ctx: FeedbackBrowserContext = {
      // RN has no patchable console buffer; submit without recent log entries.
      consoleLog: [],
      environment: {
        viewportWidth: Math.round(window.width),
        viewportHeight: Math.round(window.height),
        screenWidth: Math.round(screen.width),
        screenHeight: Math.round(screen.height),
        devicePixelRatio: window.scale || 1,
        // e.g. "ios 17.4" / "android 34" — mirrors the device info other RN
        // components send (see AuthenticationComponent).
        platform: `${Platform.OS} ${Platform.Version}`,
        // No DOM cookies/online/color-scheme APIs on native; omit rather than guess.
        touchSupport: Platform.OS === 'ios' || Platform.OS === 'android',
      },
    };

    return JSON.stringify(ctx);
  } catch {
    // Never let context capture block a submission.
    return null;
  }
}
