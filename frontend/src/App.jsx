import React from 'react';
import { Web3Provider } from './context/Web3Context';
import { PQCProvider } from './context/PQCContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './components/Login';
import Dashboard from './components/Dashboard';

import AuthBridge from './components/AuthBridge';

function AppContent() {
  const { isAuthenticated } = useAuth();

  // Simple Router
  const path = window.location.pathname;
  if (path === '/auth-bridge') {
    return <AuthBridge />;
  }

  return (
    <>
      {isAuthenticated ? <Dashboard /> : <Login />}
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <Web3Provider>
        <PQCProvider>
          <AppContent />
        </PQCProvider>
      </Web3Provider>
    </AuthProvider>
  );
}

export default App;
