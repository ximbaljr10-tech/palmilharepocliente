import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkUser = async () => {
    try {
      const res = await axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/auth/me`, { withCredentials: true });
      setUser(res.data);
    } catch (err) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkUser();
  }, []);

  const login = async (email, password) => {
    const res = await axios.post(`${process.env.REACT_APP_BACKEND_URL}/api/auth/login`, { email, password }, { withCredentials: true });
    setUser(res.data);
  };

  const register = async (name, email, password) => {
    const res = await axios.post(`${process.env.REACT_APP_BACKEND_URL}/api/auth/register`, { name, email, password }, { withCredentials: true });
    setUser(res.data);
  };

  const logout = async () => {
    await axios.post(`${process.env.REACT_APP_BACKEND_URL}/api/auth/logout`, {}, { withCredentials: true });
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, checkUser }}>
      {children}
    </AuthContext.Provider>
  );
};
