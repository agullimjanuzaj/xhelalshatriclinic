'use client';

import React from 'react';
import { RefreshCcw, AlertTriangle } from 'lucide-react';

interface State {
  hasError: boolean;
}

export class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log for debugging without crashing
    console.error('[AppErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
          <div className="text-center space-y-6 max-w-sm">
            <div className="w-20 h-20 rounded-3xl bg-muted flex items-center justify-center mx-auto">
              <AlertTriangle size={36} className="text-muted-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Aplikacioni nuk u ngarkua</h1>
              <p className="text-muted-foreground mt-2 text-sm">
                Ndodhi një gabim gjatë ngarkimit. Rifreskoni faqen për të vazhduar.
              </p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors"
            >
              <RefreshCcw size={16} />
              Rifresko
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
