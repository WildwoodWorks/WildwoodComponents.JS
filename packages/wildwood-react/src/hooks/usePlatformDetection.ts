'use client';

import { useMemo } from 'react';
import { detectPlatform } from '@wildwood/core';
import type { PlatformInfo } from '@wildwood/core';

export interface UsePlatformDetectionReturn extends PlatformInfo {}

export function usePlatformDetection(): UsePlatformDetectionReturn {
  return useMemo(() => detectPlatform(), []);
}
