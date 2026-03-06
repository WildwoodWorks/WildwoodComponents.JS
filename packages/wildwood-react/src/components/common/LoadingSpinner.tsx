// LoadingSpinner - mirrors Blazor BaseWildwoodComponent loading indicator
// Used by all components when ShowLoadingStates is true

import type { CSSProperties } from 'react';

export interface LoadingSpinnerProps {
  /** Size in pixels (default 40) */
  size?: number;
  /** Spinner color (defaults to --ww-primary) */
  color?: string;
  /** Optional message below the spinner */
  message?: string;
  /** Additional CSS class */
  className?: string;
  /** Inline styles */
  style?: CSSProperties;
}

export function LoadingSpinner({
  size = 40,
  color,
  message,
  className,
  style,
}: LoadingSpinnerProps) {
  const spinnerStyle: CSSProperties = {
    width: size,
    height: size,
    borderWidth: Math.max(2, Math.round(size / 10)),
    borderColor: color ?? 'var(--ww-primary, #D4882C)',
    borderTopColor: 'transparent',
    ...style,
  };

  return (
    <div className={`ww-loading-spinner${className ? ` ${className}` : ''}`} role="status">
      <div className="ww-spinner" style={spinnerStyle} />
      {message && <p className="ww-loading-message">{message}</p>}
      <span className="ww-sr-only">Loading...</span>
    </div>
  );
}
