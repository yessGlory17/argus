import { Component, ReactNode } from 'react';

interface Props {
  fallback: (error: Error) => ReactNode;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches rendering crashes from ToolRenderer/ContentRenderer so a single
 * malformed step (unexpected schema, oversized content, etc.) can't take
 * down the whole steps panel. The fallback receives the error and is free
 * to render a degraded view (typically the raw JSON).
 */
class RendererErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('[RendererErrorBoundary]', error, info);
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.children !== this.props.children && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return this.props.fallback(this.state.error);
    }
    return this.props.children;
  }
}

export default RendererErrorBoundary;
