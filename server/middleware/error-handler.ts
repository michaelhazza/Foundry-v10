/**
 * Global error handler middleware
 * CRITICAL: Must be registered LAST in middleware chain
 * @see Architecture Section 13.1
 */

import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/index.js';
import { sendError } from '../lib/response.js';

/**
 * Global error handling middleware
 * Catches all errors and sends appropriate response
 *
 * @example
 * // In server/index.ts - register LAST
 * app.use(errorHandler);
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log all errors
  console.error('Error caught by global handler:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
  });

  // Handle operational errors (known error types)
  if (err instanceof AppError) {
    sendError(res, err.statusCode, err.code, err.message);
    return;
  }

  // Handle Zod validation errors
  if (err.name === 'ZodError') {
    const zodError = err as any;
    const details = zodError.errors?.map((e: any) => ({
      field: e.path.join('.'),
      message: e.message,
    }));

    sendError(res, 400, 'VALIDATION_ERROR', 'Validation failed', details);
    return;
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    sendError(res, 401, 'UNAUTHORIZED', 'Invalid authentication token');
    return;
  }

  if (err.name === 'TokenExpiredError') {
    sendError(res, 401, 'UNAUTHORIZED', 'Authentication token expired');
    return;
  }

  // Handle multer file upload errors
  if (err.name === 'MulterError') {
    const multerError = err as any;
    let message = 'File upload error';

    if (multerError.code === 'LIMIT_FILE_SIZE') {
      message = 'File too large (max 100MB)';
    } else if (multerError.code === 'LIMIT_FILE_COUNT') {
      message = 'Too many files';
    }

    sendError(res, 400, 'VALIDATION_ERROR', message);
    return;
  }

  // Handle database errors
  if (err.message?.includes('unique constraint')) {
    sendError(res, 409, 'CONFLICT', 'Resource already exists');
    return;
  }

  if (err.message?.includes('foreign key constraint')) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Referenced resource does not exist');
    return;
  }

  // Unexpected errors - don't leak implementation details
  sendError(
    res,
    500,
    'INTERNAL_ERROR',
    process.env.NODE_ENV === 'development'
      ? err.message
      : 'An unexpected error occurred'
  );
}

/**
 * Async handler wrapper to catch promise rejections
 * Use this to wrap async route handlers
 *
 * @example
 * router.get('/projects', asyncHandler(async (req, res) => {
 *   const projects = await projectService.list();
 *   sendSuccess(res, projects);
 * }));
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
