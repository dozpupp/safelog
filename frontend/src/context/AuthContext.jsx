import React, { createContext, useState, useContext } from 'react';

const AuthContext = createContext();

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem('token'));
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [authType, setAuthType] = useState(localStorage.getItem('authType')); // 'metamask' | 'trustkeys'

    // check if we have token on load
    React.useEffect(() => {
        if (token) {
            setIsAuthenticated(true);
            // Optionally fetch user profile here if not stored
        }
    }, [token]);

    const login = (userData, type, accessToken) => {
        setUser(userData);
        setAuthType(type);
        setToken(accessToken);
        setIsAuthenticated(true);
        localStorage.setItem('token', accessToken);
        localStorage.setItem('authType', type);
    };

    const logout = () => {
        setUser(null);
        setAuthType(null);
        setToken(null);
        setIsAuthenticated(false);
        localStorage.clear();
    };

    const updateUser = (userData) => {
        setUser(userData);
    };

    return (
        <AuthContext.Provider value={{
            user,
            token,
            isAuthenticated,
            authType,
            login,
            logout,
            updateUser,
            setUser
        }}>
            {children}
        </AuthContext.Provider>
    );
};
