import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Logueo amistoso para diagnóstico
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  recargar = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white rounded-2xl shadow-xl border border-red-100 overflow-hidden">
          <div className="bg-gradient-to-r from-red-600 to-red-700 px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h2 className="text-white font-bold text-lg">Algo salió mal</h2>
                <p className="text-red-100 text-sm">Ocurrió un error inesperado en la aplicación</p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-4">
            <p className="text-sm text-gray-600">
              Disculpá las molestias. La pantalla no pudo cargarse correctamente.
              Probá recargar la página o volver al panel principal.
            </p>

            {this.state.error?.message && (
              <details className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <summary className="text-xs font-medium text-gray-600 cursor-pointer">Detalle técnico</summary>
                <pre className="text-xs text-red-700 mt-2 whitespace-pre-wrap break-words font-mono">
                  {this.state.error.message}
                </pre>
              </details>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={this.recargar}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2.5 rounded-lg transition-colors">
                Recargar página
              </button>
              <button
                onClick={() => { this.reset(); window.location.href = '/dashboard'; }}
                className="flex-1 border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium py-2.5 rounded-lg transition-colors">
                Ir al panel
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
