import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import AdminDashboard from './pages/AdminDashboard';
import ProDashboard from './pages/ProDashboard';
import NewOrder from './pages/NewOrder';
import { Toaster } from './components/ui/sonner';

const ProtectedRoute = ({ children, role }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to={user.role === 'admin' ? '/admin' : '/dashboard'} replace />;
  return children;
};

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      
      <Route path="/admin/*" element={
        <ProtectedRoute role="admin">
          <AdminDashboard />
        </ProtectedRoute>
      } />
      
      <Route path="/dashboard/*" element={
        <ProtectedRoute role="professional">
          <ProDashboard />
        </ProtectedRoute>
      } />
      
      <Route path="/dashboard/new-order" element={
        <ProtectedRoute role="professional">
          <NewOrder />
        </ProtectedRoute>
      } />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <Toaster theme="dark" toastOptions={{ style: { borderRadius: '0px', border: '1px solid #2A2D35', background: '#090A0C' } }} />
      </BrowserRouter>
    </AuthProvider>
  );
}
