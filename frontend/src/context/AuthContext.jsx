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
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [authType, setAuthType] = useState(null); // 'metamask' | 'trustkeys'

    const login = (userData, type) => {
        setUser(userData);
        setAuthType(type);
        setIsAuthenticated(true);
    };

    const logout = () => {
        setUser(null);
        setAuthType(null);
        setIsAuthenticated(false);
    };

    const updateUser = (userData) => {
        setUser(userData);
    };

    return (
        <AuthContext.Provider value={{
            user,
            isAuthenticated,
            authType,
            login,
            logout,
            updateUser,
            setUser // Exposing raw setter just in case, leveraging 'updateUser' is better usually
        }}>
            {children}
        </AuthContext.Provider>
    );
};
