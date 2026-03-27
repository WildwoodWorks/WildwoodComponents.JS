'use client';

// ErrorBoundary - mirrors Blazor BaseWildwoodComponent automatic error handling
// Catches render errors in child components and displays a fallback UI

import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';

export interface ErrorBoundaryProps {
  /** Content to render when no error */
  children: ReactNode;
  /** Custom fallback UI (receives error and reset function) */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Called when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Additional CSS class */
  className?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[Wildwood] Component error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    const { children, fallback, className } = this.props;

    if (error) {
      if (fallback) {
        return fallback(error, this.reset);
      }

      return (
        <div className={`ww-error-boundary${className ? ` ${className}` : ''}`} role="alert">
          <div className="ww-error-content">
            <h3 className="ww-error-title">Something went wrong</h3>
            <p className="ww-error-message">{error.message}</p>
            <button type="button" className="ww-btn-primary ww-error-retry" onClick={this.reset}>
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return children;
  }
}
