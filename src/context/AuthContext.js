import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setApiAuthToken } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [authState, setAuthState] = useState({
    token: null,
    role: null,
    userId: null,
    user: null,
    isLoading: true,
  });

  // Load stored session on app start
  useEffect(() => {
    loadSession();
  }, []);

  const loadSession = async () => {
    try {
      const token = await AsyncStorage.getItem('auth_token');
      const role = await AsyncStorage.getItem('role');
      const userId = await AsyncStorage.getItem('user_id');
      const userStr = await AsyncStorage.getItem('user_data');
      const expiryStr = await AsyncStorage.getItem('token_expiry');

      if (token && role) {
        setApiAuthToken(token);
        // Check token expiry
        if (expiryStr) {
          const expiry = parseInt(expiryStr);
          if (Date.now() > expiry) {
            await clearSession();
            return;
          }
        }
        setAuthState({
          token,
          role,
          userId: userId ? parseInt(userId) : null,
          user: userStr ? JSON.parse(userStr) : null,
          isLoading: false,
        });
      } else {
        setApiAuthToken(null);
        setAuthState(prev => ({ ...prev, isLoading: false }));
      }
    } catch (e) {
      setApiAuthToken(null);
      setAuthState(prev => ({ ...prev, isLoading: false }));
    }
  };

  const saveSession = async ({ token, role, userId, user, expiryMs }) => {
    await AsyncStorage.setItem('auth_token', token);
    await AsyncStorage.setItem('role', role);
    if (userId != null) await AsyncStorage.setItem('user_id', String(userId));
    if (user) await AsyncStorage.setItem('user_data', JSON.stringify(user));
    if (expiryMs) await AsyncStorage.setItem('token_expiry', String(expiryMs));

    setApiAuthToken(token);

    setAuthState({ token, role, userId, user, isLoading: false });
  };

  const clearSession = async () => {
    await AsyncStorage.multiRemove(['auth_token', 'jwt_token', 'role', 'user_id', 'user_data', 'token_expiry']);
    setApiAuthToken(null);
    setAuthState({ token: null, role: null, userId: null, user: null, isLoading: false });
  };

  return (
    <AuthContext.Provider value={{ authState, saveSession, clearSession, loadSession }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
