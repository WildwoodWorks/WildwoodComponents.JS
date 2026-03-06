// Platform detection - browser/OS/device info
// Mirrors WildwoodComponents.Blazor/Services/PlatformDetectionService.cs

import type { Platform, PlatformInfo } from './types.js';

export function detectPlatform(): PlatformInfo {
  if (typeof navigator === 'undefined') {
    return { platform: 'unknown', isMobile: false, isDesktop: false, isBrowser: false, userAgent: '', language: '' };
  }

  const ua = navigator.userAgent;
  const platform = detectOS(ua);
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);

  return {
    platform,
    isBrowser: true,
    isDesktop: !isMobile,
    isMobile,
    userAgent: ua,
    language: navigator.language ?? '',
  };
}

function detectOS(ua: string): Platform {
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Mac/.test(ua)) return 'macos';
  if (/Win/.test(ua)) return 'windows';
  return 'unknown';
}
