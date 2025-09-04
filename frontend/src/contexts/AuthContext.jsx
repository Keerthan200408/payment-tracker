import React, { createContext, useState, useEffect, useCallback, useContext } from 'react';
import api from '../api'; // Using our new centralized API service

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    // Initialize state directly from localStorage. This is the single source of truth on startup.
    const [sessionToken, setSessionToken] = useState(() => localStorage.getItem("sessionToken"));
    const [currentUser, setCurrentUser] = useState(() => localStorage.getItem("currentUser"));
    const [isInitialized, setIsInitialized] = useState(false);

    // Centralized login function
    const login = (user, token) => {
        localStorage.setItem("currentUser", user);
        localStorage.setItem("sessionToken", token);
        setCurrentUser(user);
        setSessionToken(token);
    };

    // Centralized logout function
    const logout = useCallback(() => {
        // Fire-and-forget API call to invalidate the token on the backend
        api.auth.logout().catch(err => console.error("Logout API error:", err.message));

        // Clear all local session data
        setCurrentUser(null);
        setSessionToken(null);
        localStorage.clear();
        window.location.href = '/'; // Redirect to sign-in page to ensure clean state
    }, []);

    // Effect to mark initialization as complete.
    useEffect(() => {
        if (!isInitialized) {
            setIsInitialized(true);
        }
    }, [isInitialized]);

    const value = { sessionToken, currentUser, isInitialized, login, logout };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Custom hook to easily access auth context from any component
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
};