import React from 'react';
import { Web3Provider } from './context/Web3Context';
import { PQCProvider } from './context/PQCContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import { MessengerProvider } from './context/MessengerContext';

import AuthBridge from './components/AuthBridge';

function AppContent() {
  const { isAuthenticated } = useAuth();
  const { isRetro, isCrashing } = useTheme();

  // Simple Router
  const path = window.location.pathname;
  if (path === '/auth-bridge') {
    return <AuthBridge />;
  }

  return (
    <div className={isCrashing ? 'crt-crash' : ''}>
      {isRetro && <div className="crt-overlay" />}
      {isAuthenticated ? <Dashboard /> : <Login />}
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Web3Provider>
          <PQCProvider>
            <MessengerProvider>
              <AppContent />
            </MessengerProvider>
          </PQCProvider>
        </Web3Provider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
