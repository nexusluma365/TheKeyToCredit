import { useState, useCallback } from 'react';
import { api } from '../services/api';

export function useAuth() {
  const [email, setEmail] = useState(() => sessionStorage.getItem('admin_email'));
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(sessionStorage.getItem('admin_token')));

  const login = useCallback(async (loginEmail, password) => {
    const data = await api.login(loginEmail, password);
    sessionStorage.setItem('admin_token', data.token);
    sessionStorage.setItem('admin_email', data.email);
    setEmail(data.email);
    setIsAuthenticated(true);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem('admin_token');
    sessionStorage.removeItem('admin_email');
    setEmail(null);
    setIsAuthenticated(false);
  }, []);

  return { email, isAuthenticated, login, logout };
}
