/**
 * Response envelope helpers for consistent API responses
 * CRITICAL: All route handlers MUST use these helpers
 * @see API Contract Section 1.3, Constitution Section C
 */

import { Response } from 'express';

/**
 * Send success response with data
 * @param res - Express response object
 * @param data - Response data
 * @param statusCode - HTTP status code (default 200)
 *
 * @example
 * sendSuccess(res, { user: { id: 1, email: 'user@example.com' } });
 * // Response: { data: { user: { ... } } }
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode: number = 200
): Response {
  return res.status(statusCode).json({ data });
}

/**
 * Send success response with pagination
 * @param res - Express response object
 * @param data - Array of items
 * @param pagination - Pagination metadata
 *
 * @example
 * sendPaginated(res, projects, {
 *   page: 1,
 *   pageSize: 20,
 *   totalPages: 5,
 *   totalCount: 93
 * });
 */
export function sendPaginated<T>(
  res: Response,
  data: T[],
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalCount: number;
  }
): Response {
  return res.status(200).json({ data, pagination });
}

/**
 * Send created response (201)
 * @param res - Express response object
 * @param data - Created resource
 *
 * @example
 * sendCreated(res, { project: { id: 5, name: 'New Project' } });
 */
export function sendCreated<T>(res: Response, data: T): Response {
  return sendSuccess(res, data, 201);
}

/**
 * Send no content response (204)
 * @param res - Express response object
 *
 * @example
 * // After DELETE operation
 * sendNoContent(res);
 */
export function sendNoContent(res: Response): Response {
  return res.status(204).send();
}

/**
 * Send error response
 * @param res - Express response object
 * @param statusCode - HTTP status code
 * @param code - Error code (e.g., 'VALIDATION_ERROR')
 * @param message - Human-readable error message
 * @param details - Optional field-level error details
 *
 * @example
 * sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', [
 *   { field: 'email', message: 'Invalid email format' }
 * ]);
 */
export function sendError(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  details?: Array<{ field: string; message: string }>
): Response {
  const error: Record<string, unknown> = { code, message };

  if (details && details.length > 0) {
    error.details = details;
  }

  return res.status(statusCode).json({ error });
}
