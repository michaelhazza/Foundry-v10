/**
 * API client utilities
 */

const API_BASE = '/api';

interface ApiError {
  code: string;
  message: string;
  details?: Array<{ field: string; message: string }>;
}

interface ApiResponse<T> {
  data?: T;
  error?: ApiError;
  pagination?: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalCount: number;
  };
}

class ApiClient {
  private getToken(): string | null {
    return localStorage.getItem('auth_token');
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const token = this.getToken();

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    // Handle 204 No Content
    if (response.status === 204) {
      return { data: undefined as any };
    }

    const data = await response.json();

    if (!response.ok) {
      throw data.error || { code: 'UNKNOWN_ERROR', message: 'An error occurred' };
    }

    return data;
  }

  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint);
  }

  async post<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async patch<T>(endpoint: string, body: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'DELETE',
    });
  }

  async upload<T>(endpoint: string, file: File, additionalData?: Record<string, string>): Promise<ApiResponse<T>> {
    const token = this.getToken();
    const formData = new FormData();
    formData.append('file', file);

    if (additionalData) {
      Object.entries(additionalData).forEach(([key, value]) => {
        formData.append(key, value);
      });
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      throw data.error || { code: 'UNKNOWN_ERROR', message: 'An error occurred' };
    }

    return data;
  }
}

export const api = new ApiClient();

// Error message mappings
export const errorMessages: Record<string, string> = {
  INVALID_CREDENTIALS: 'Email or password is incorrect',
  DUPLICATE_EMAIL: 'This email is already registered',
  UNAUTHORIZED: 'Please log in to continue',
  FORBIDDEN: 'You do not have permission to perform this action',
  NOT_FOUND: 'The requested resource was not found',
  VALIDATION_ERROR: 'Please check your input',
  RATE_LIMIT_EXCEEDED: 'Too many requests. Please try again later.',
  INVALID_TOKEN: 'This link is invalid or has expired',
  INTERNAL_ERROR: 'Something went wrong. Please try again.',
};

export function getErrorMessage(error: any): string {
  if (typeof error === 'string') return error;
  if (error?.message) {
    return errorMessages[error.code] || error.message;
  }
  return 'An unexpected error occurred';
}
