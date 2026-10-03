import { Component } from 'react';

// React only supports error boundaries as class components.
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="m-6 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800">
        <p className="font-semibold">Something crashed on this page</p>
        <pre className="mt-2 whitespace-pre-wrap">{String(this.state.error?.stack || this.state.error)}</pre>
      </div>
    );
  }
}
