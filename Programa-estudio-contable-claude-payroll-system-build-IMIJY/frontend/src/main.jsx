import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { ConfirmHost } from './components/confirm';
import * as sentry from './lib/sentry';
import './index.css';

// Init Sentry lo antes posible
sentry.init();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster position="top-right" toastOptions={{ duration: 3500 }} />
      <ConfirmHost />
    </BrowserRouter>
  </React.StrictMode>
);
