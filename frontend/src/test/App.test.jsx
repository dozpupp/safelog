import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock all context providers and heavy components to test App's wiring
vi.mock('../context/AuthContext', () => ({
    AuthProvider: ({ children }) => <div data-testid="auth-provider">{children}</div>,
    useAuth: () => ({ isAuthenticated: false, user: null }),
}));
vi.mock('../context/ThemeContext', () => ({
    ThemeProvider: ({ children }) => <div data-testid="theme-provider">{children}</div>,
    useTheme: () => ({ isRetro: false, isCrashing: false }),
}));
vi.mock('../context/Web3Context', () => ({
    Web3Provider: ({ children }) => <div data-testid="web3-provider">{children}</div>,
}));
vi.mock('../context/PQCContext', () => ({
    PQCProvider: ({ children }) => <div data-testid="pqc-provider">{children}</div>,
}));
vi.mock('../context/MessengerContext', () => ({
    MessengerProvider: ({ children }) => <div data-testid="messenger-provider">{children}</div>,
}));
vi.mock('../components/Login', () => ({
    default: () => <div data-testid="login-page">Login</div>,
}));
vi.mock('../components/Dashboard', () => ({
    default: () => <div data-testid="dashboard-page">Dashboard</div>,
}));

import App from '../App';

describe('App', () => {
    it('renders without crashing', () => {
        render(<App />);
        // All providers are rendered in the expected nesting
        expect(screen.getByTestId('theme-provider')).toBeInTheDocument();
        expect(screen.getByTestId('auth-provider')).toBeInTheDocument();
    });

    it('shows login when not authenticated', () => {
        render(<App />);
        expect(screen.getByTestId('login-page')).toBeInTheDocument();
    });
});
