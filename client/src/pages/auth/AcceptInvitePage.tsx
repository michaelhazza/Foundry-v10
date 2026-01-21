/**
 * AcceptInvitePage - CRITICAL for invitation flow
 * @see UI Specification Section 3.2, Pattern 9
 */

import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { api, getErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Building2, User } from 'lucide-react';

interface InvitationData {
  valid: boolean;
  organisation: string;
  inviterName: string;
  role: string;
  email: string;
}

export function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();

  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [tokenError, setTokenError] = useState('');

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setTokenError('No invitation token provided');
      setIsValidating(false);
      return;
    }

    api.get<InvitationData>(`/auth/invitations/${token}/validate`)
      .then((res) => {
        if (res.data?.valid) {
          setInvitation(res.data);
        } else {
          setTokenError('This invitation link is invalid or has expired');
        }
      })
      .catch((err) => {
        const message = getErrorMessage(err);
        if (err.code === 'INVALID_TOKEN') {
          setTokenError('This invitation link is invalid or has expired');
        } else {
          setTokenError(message);
        }
      })
      .finally(() => {
        setIsValidating(false);
      });
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate password
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (!/(?=.*[A-Z])(?=.*\d)/.test(password)) {
      setError('Password must contain 1 uppercase letter and 1 digit');
      return;
    }

    setIsLoading(true);

    try {
      const response = await api.post<{ token: string; user: any }>(
        `/auth/invitations/${token}/accept`,
        { name, password }
      );

      if (response.data?.token) {
        // Store token and redirect to dashboard
        localStorage.setItem('auth_token', response.data.token);
        navigate('/dashboard', { replace: true });
        // Force page reload to update auth context
        window.location.reload();
      }
    } catch (err: any) {
      if (err.code === 'DUPLICATE_EMAIL') {
        setError('This email is already registered. Please sign in instead.');
      } else if (err.code === 'INVALID_TOKEN') {
        setTokenError('This invitation has already been accepted');
      } else {
        setError(getErrorMessage(err));
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Loading state
  if (isValidating) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-8 w-48 mx-auto" />
          <Skeleton className="h-4 w-64 mx-auto mt-2" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Invalid token state
  if (tokenError) {
    return (
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center">Invalid Invitation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{tokenError}</AlertDescription>
          </Alert>
          <p className="text-center text-sm text-muted-foreground">
            Please contact your administrator for a new invitation.
          </p>
          <div className="text-center space-y-2">
            <Link to="/login" className="text-primary hover:underline text-sm">
              Already have an account? Sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Valid invitation - show form
  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl text-center">Accept Invitation</CardTitle>
        <CardDescription className="text-center">
          You've been invited to join an organization
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Invitation details */}
          <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Organisation:</span>
              <span className="text-sm">{invitation?.organisation}</span>
            </div>
            {invitation?.inviterName && (
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Invited by:</span>
                <span className="text-sm">{invitation.inviterName}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Your role:</span>
              <Badge variant="secondary" className="capitalize">
                {invitation?.role}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Email:</span>
              <span className="text-sm">{invitation?.email}</span>
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">Your Name</Label>
            <Input
              id="name"
              type="text"
              placeholder="John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isLoading}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              required
            />
            <p className="text-xs text-muted-foreground">
              Min 8 characters, 1 uppercase letter, 1 digit
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isLoading}
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? 'Creating account...' : 'Accept & Create Account'}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link to="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
