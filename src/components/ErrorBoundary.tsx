import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[400px] flex flex-col items-center justify-center p-8 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 m-4">
          <div className="p-4 bg-red-100 text-red-600 rounded-full mb-6">
            <AlertTriangle className="w-12 h-12" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">申し訳ありません。エラーが発生しました。</h2>
          <p className="text-slate-600 mb-8 text-center max-w-md">
            アプリケーションの実行中に予期しないエラーが発生しました。ページを再読み込みするか、管理者にお問い合わせください。
          </p>
          {this.state.error && (
            <div className="bg-white p-4 rounded-lg border border-slate-200 mb-8 w-full max-w-2xl overflow-auto max-h-40">
              <p className="font-mono text-xs text-red-500 whitespace-pre-wrap">
                {this.state.error.toString()}
              </p>
            </div>
          )}
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition shadow-lg"
          >
            <RefreshCw className="w-5 h-5" />
            ページを再読み込みする
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
