'use client';

import { type ReactNode } from 'react';
import { useAuth } from '../../hooks/useAuth.js';

export interface ProtectedRouteProps {
  /** Content to render when authenticated */
  children: ReactNode;
  /** Component to render while session is initializing (default: null) */
  loadingFallback?: ReactNode;
  /** Component to render when not authenticated (default: null).
   *  For react-router, pass `<Navigate to="/login" replace />`. */
  unauthenticatedFallback?: ReactNode;
}

/**
 * Route guard that renders children only when the Wildwood session is authenticated.
 * Works with any React router — pass framework-specific redirects via `unauthenticatedFallback`.
 *
 * @example
 * // With react-router
 * <Route element={
 *   <ProtectedRoute
 *     loadingFallback={<Spinner />}
 *     unauthenticatedFallback={<Navigate to="/login" replace />}
 *   >
 *     <Outlet />
 *   </ProtectedRoute>
 * } />
 */
export function ProtectedRoute({
  children,
  loadingFallback = null,
  unauthenticatedFallback = null,
}: ProtectedRouteProps) {
  const { isAuthenticated, isInitialized } = useAuth();

  if (!isInitialized) {
    return <>{loadingFallback}</>;
  }

  if (!isAuthenticated) {
    return <>{unauthenticatedFallback}</>;
  }

  return <>{children}</>;
}
