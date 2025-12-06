import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { MainInterface } from '@/components/MainInterface';
import { AdminLogin } from '@/components/admin/AdminLogin';
import { AdminDashboard } from '@/components/admin/AdminDashboard';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/apiClient';

function App() {
  const [adminToken, setAdminToken] = useState<string | null>(null);

  // Check for existing token on app load and validate with backend
  useEffect(() => {
    const validateExistingSession = async () => {
      const token = localStorage.getItem('adminToken');
      if (!token) return;

      try {
        const response = await apiFetch('/api/admin/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          throw new Error('Session validation failed');
        }

        const data = await response.json().catch(() => ({}));
        if (data?.user) {
          localStorage.setItem('adminUser', JSON.stringify(data.user));
        }
        setAdminToken(token);
      } catch (error) {
        console.warn('Failed to validate stored admin session', error);
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminUser');
        setAdminToken(null);
      }
    };

    validateExistingSession();
  }, []);

  const handleLogin = (token: string, user: { id: number; username: string }) => {
    localStorage.setItem('adminToken', token);
    localStorage.setItem('adminUser', JSON.stringify(user));
    setAdminToken(token);
  };

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
    setAdminToken(null);
  };

  return (
    <Router>
      <div className="min-h-screen bg-white flex flex-col">
        <Toaster />
        
        {/* Navigation */}
        <nav className="bg-white shadow-sm border-b">
          <div className="container mx-auto px-4 py-4">
            <div className="flex justify-between items-center">
              <Link to="/" className="text-xl font-bold text-gray-900">
                Ccode Proxy
              </Link>
              <div className="flex items-center space-x-4">
                <Link to="/">
                  <Button variant="ghost">首页</Button>
                </Link>
                {adminToken ? (
                  <Link to="/admin">
                    <Button variant="ghost">管理后台</Button>
                  </Link>
                ) : (
                  <Link to="/admin/login">
                    <Button variant="outline" size="sm">
                      管理员登录
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className="flex-grow">
          <Routes>
            <Route path="/" element={<MainInterface />} />
            <Route 
              path="/admin/login" 
              element={
                adminToken ? <Navigate to="/admin" replace /> : <AdminLogin onLogin={handleLogin} />
              } 
            />
            <Route 
              path="/admin" 
              element={
                adminToken ? <AdminDashboard token={adminToken} onLogout={handleLogout} /> : <Navigate to="/admin/login" replace />
              } 
            />
          </Routes>
        </main>

        {/* Footer */}
        <Footer />
      </div>
    </Router>
  );
}

export default App;
