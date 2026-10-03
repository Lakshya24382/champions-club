import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './auth.jsx';
import App from './App.jsx';
import './index.css';

// TanStack Query caches server data and refetches it for us, so no manual useEffect+fetch.
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, retry: false } },
});

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
