import React, { useState } from 'react';
import { useWeb3 } from '../context/Web3Context';
import { usePQC } from '../context/PQCContext';
import { useTheme } from '../context/ThemeContext';
import { Shield, Wallet, ArrowRight, Loader2, Sun, Moon } from 'lucide-react';

export default function Login() {
    const { login } = useWeb3();
    const { loginTrustKeys } = usePQC();
    const { theme, toggleTheme } = useTheme();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [activeMethod, setActiveMethod] = useState(null);

    const handleLogin = async (method) => {
        setLoading(true);
        setActiveMethod(method);
        setError(null);
        try {
            if (method === 'trustkeys') {
                await loginTrustKeys();
            } else {
                await login();
            }
        } catch (err) {
            console.error("Login error:", err);
            setError(`Failed to login: ${err.message || 'Please try again.'} `);
        } finally {
            setLoading(false);
            setActiveMethod(null);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 transition-colors duration-200">
            <button
                onClick={toggleTheme}
                className="absolute top-4 right-4 p-2 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
            >
                {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 shadow-2xl transition-colors duration-200">
                <div className="flex flex-col items-center text-center mb-8">
                    <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-500/10 rounded-full flex items-center justify-center mb-4">
                        <Shield className="w-8 h-8 text-indigo-600 dark:text-indigo-500" />
                    </div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">SecureLog</h1>
                    <p className="text-slate-500 dark:text-slate-400">
                        Secret management and document signing.
                    </p>
                </div>

                {error && (
                    <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm text-center">
                        {error}
                    </div>
                )}

                <button
                    onClick={() => handleLogin('metamask')}
                    disabled={loading}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed group mb-4"
                >
                    {loading && activeMethod === 'metamask' ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                        <>
                            <Wallet className="w-5 h-5" />
                            <span>Connect with MetaMask</span>
                            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </>
                    )}
                </button>

                <button
                    onClick={() => handleLogin('trustkeys')}
                    disabled={loading}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                    {loading && activeMethod === 'trustkeys' ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                        <>
                            <Shield className="w-5 h-5" />
                            <span>Connect with TrustKeys (PQC)</span>
                            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
