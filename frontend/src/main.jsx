import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx'; // Correct: This is the root component
import { AuthProvider } from './contexts/AuthContext';
import { DataProvider } from './contexts/DataContext';
import ErrorBoundary from './components/common/ErrorBoundary';
import './output.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <DataProvider>
          <App /> {/* Correct: Render App, which contains AppContent and layout */}
        </DataProvider>
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
);