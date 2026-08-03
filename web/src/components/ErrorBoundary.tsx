import { Component, type ComponentChildren } from 'preact';

interface Props {
  /** When this value changes (e.g. the current route), the boundary resets. */
  resetKey?: unknown;
  children: ComponentChildren;
}

interface State {
  error: Error | null;
}

/**
 * Catches render errors in the routed content so a single failing page shows a
 * recoverable message instead of throwing mid-reconciliation - which would
 * otherwise leave the previous route's DOM mounted and stack pages on top of
 * each other. Resets automatically when `resetKey` (the location) changes.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Surface the error for debugging; the fallback UI keeps the app usable.
    console.error('Render error caught by ErrorBoundary:', error);
  }

  componentDidUpdate(prevProps: Props) {
    // Clear the error when navigating to a different route.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div class="stack" data-testid="route-error">
          <div class="page-header">
            <h1>Something went wrong</h1>
          </div>
          <div class="card">
            <p class="muted">This page hit an unexpected error and couldn’t be displayed.</p>
            <p class="muted">Try navigating to another page, or reload the app.</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
