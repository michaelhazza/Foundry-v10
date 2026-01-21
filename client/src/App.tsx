import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/hooks/useAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { AdminRoute } from '@/components/layout/AdminRoute';

// Auth pages
import { LoginPage } from '@/pages/auth/LoginPage';
import { RegisterPage } from '@/pages/auth/RegisterPage';
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage';
import { AcceptInvitePage } from '@/pages/auth/AcceptInvitePage';

// Main pages
import { DashboardPage } from '@/pages/DashboardPage';
import { ProjectDetailPage } from '@/pages/projects/ProjectDetailPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ErrorPage } from '@/pages/ErrorPage';

// Placeholder pages
function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <h1 className="text-2xl font-bold mb-4">{title}</h1>
      <p className="text-muted-foreground">This page is under construction.</p>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public auth routes */}
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/accept-invite" element={<AcceptInvitePage />} />
          </Route>

          {/* Protected routes */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              {/* Dashboard */}
              <Route path="/dashboard" element={<DashboardPage />} />

              {/* Projects */}
              <Route path="/projects/new" element={<PlaceholderPage title="Create Project" />} />
              <Route path="/projects/:id" element={<ProjectDetailPage />} />
              <Route path="/projects/:id/edit" element={<PlaceholderPage title="Edit Project" />} />
              <Route path="/projects/:id/upload" element={<PlaceholderPage title="Upload Data" />} />
              <Route path="/projects/:id/schema" element={<PlaceholderPage title="Schema Mapping" />} />
              <Route path="/projects/:id/process" element={<PlaceholderPage title="Processing" />} />

              {/* Data Sources & Datasets */}
              <Route path="/data-sources/:id/preview" element={<PlaceholderPage title="Data Preview" />} />
              <Route path="/datasets/:id" element={<PlaceholderPage title="Dataset Details" />} />
              <Route path="/jobs/:id" element={<PlaceholderPage title="Job Details" />} />

              {/* OAuth */}
              <Route path="/oauth/teamwork" element={<PlaceholderPage title="Connect Teamwork" />} />

              {/* Profile */}
              <Route path="/profile" element={<PlaceholderPage title="Profile" />} />
              <Route path="/profile/edit" element={<PlaceholderPage title="Edit Profile" />} />

              {/* Admin routes */}
              <Route element={<AdminRoute />}>
                <Route path="/team" element={<PlaceholderPage title="Team Members" />} />
                <Route path="/settings/organization" element={<PlaceholderPage title="Organization Settings" />} />
              </Route>
            </Route>
          </Route>

          {/* Error routes */}
          <Route path="/error" element={<ErrorPage />} />
          <Route path="/404" element={<NotFoundPage />} />

          {/* Redirects */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
