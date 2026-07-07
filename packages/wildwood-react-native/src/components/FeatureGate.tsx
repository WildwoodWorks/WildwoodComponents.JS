import type { ReactNode } from 'react';
import { useFeatures } from '../hooks/useFeatures';

export interface FeatureGateProps {
  /** Feature code defined in the app's tier catalog (case-insensitive), e.g. "AI_ASSISTANT". */
  feature: string;
  appId?: string;
  /** Rendered when the user's plan does NOT include the feature (e.g. an upgrade prompt). */
  fallback?: ReactNode;
  /** Rendered while entitlements are loading. Defaults to nothing (avoids flashing locked UI). */
  loadingFallback?: ReactNode;
  children: ReactNode;
}

/**
 * Renders children only when the authenticated user's plan includes the feature.
 * Backed by useFeatures() — one shared bulk fetch per app, so gating many surfaces is cheap.
 *
 * Client-side gating is UX only: the server must still enforce the entitlement. Accordingly
 * the gate FAILS OPEN when entitlements can't be loaded (transient error) — children render
 * and the server remains the enforcement point — and shows loadingFallback while loading.
 */
export function FeatureGate({ feature, appId, fallback, loadingFallback, children }: FeatureGateProps) {
  const { hasFeature, loading } = useFeatures({ appId });

  if (loading) return <>{loadingFallback ?? null}</>;
  return <>{hasFeature(feature) ? children : (fallback ?? null)}</>;
}
