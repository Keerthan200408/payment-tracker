import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx'; // Corrected: Import App instead of AppContent
import { AuthProvider } from './contexts/AuthContext';
import { DataProvider } from './contexts/DataContext';
import ErrorBoundary from './components/common/ErrorBoundary';
import './output.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <DataProvider>
          <App /> {/* Corrected: Render App here */}
        </DataProvider>
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
);