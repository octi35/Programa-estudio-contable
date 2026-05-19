import React, { useEffect, useState } from 'react';
import Modal from './Modal';
import { ExclamationTriangleIcon, InformationCircleIcon } from '@heroicons/react/24/outline';

// Singleton dispatcher: confirm({...}) → Promise<boolean>
let openFn = null;

export function confirm(opts) {
  return new Promise(resolve => {
    if (!openFn) {
      // Fallback si <ConfirmHost /> no está montado
      resolve(window.confirm(opts.message || opts.title || '¿Confirmar?'));
      return;
    }
    openFn({ ...opts, resolve });
  });
}

export function ConfirmHost() {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tipeo, setTipeo] = useState('');

  useEffect(() => {
    openFn = (s) => { setState(s); setBusy(false); setTipeo(''); };
    return () => { openFn = null; };
  }, []);

  if (!state) return null;

  const {
    title = 'Confirmar acción',
    message,
    details,
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    danger = false,
    requireText = null, // texto que el usuario debe tipear para habilitar el botón
    resolve,
  } = state;

  const close = (val) => {
    setState(null);
    setBusy(false);
    setTipeo('');
    resolve(val);
  };

  const canConfirm = requireText ? tipeo.trim() === requireText : true;

  return (
    <Modal open onClose={() => !busy && close(false)} title={title} size="md">
      <div className="space-y-4">
        <div className="flex gap-3">
          <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${danger ? 'bg-red-100' : 'bg-blue-100'}`}>
            {danger
              ? <ExclamationTriangleIcon className="w-6 h-6 text-red-600" />
              : <InformationCircleIcon className="w-6 h-6 text-blue-600" />}
          </div>
          <div className="flex-1 text-sm text-gray-700">
            {message && <p className="whitespace-pre-line">{message}</p>}
            {details && (
              <ul className="mt-2 list-disc pl-5 text-xs text-gray-600 space-y-0.5">
                {(Array.isArray(details) ? details : [details]).map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            )}
          </div>
        </div>

        {requireText && (
          <div className="border-t pt-3">
            <label className="block text-xs text-gray-600 mb-1">
              Para continuar, escribí: <code className="font-mono bg-gray-100 px-1 rounded">{requireText}</code>
            </label>
            <input
              className="input"
              value={tipeo}
              onChange={e => setTipeo(e.target.value)}
              autoFocus
            />
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2 border-t">
          <button
            onClick={() => close(false)}
            disabled={busy}
            className="btn-secondary"
          >
            {cancelText}
          </button>
          <button
            onClick={() => { setBusy(true); close(true); }}
            disabled={busy || !canConfirm}
            className={danger
              ? 'px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 inline-flex items-center gap-2'
              : 'btn-primary'}
          >
            {busy ? 'Procesando...' : confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}
