/**
 * Parameter parsing and validation utilities
 * CRITICAL: Prevents NaN database errors when parsing URL parameters
 * @see API Contract Section 1.6, Architecture Section 13.2
 */

import { BadRequestError } from '../errors/index.js';

/**
 * Parse integer from URL parameter with validation
 * @param value - Raw parameter value
 * @param paramName - Parameter name for error messages
 * @returns Validated integer
 * @throws BadRequestError if value is not a valid integer
 *
 * @example
 * // Route handler
 * router.get('/projects/:projectId', (req, res) => {
 *   const projectId = parseIntParam(req.params.projectId, 'projectId');
 *   // projectId is guaranteed to be a valid integer
 * });
 */
export function parseIntParam(value: string, paramName: string): number {
  const parsed = parseInt(value, 10);

  if (isNaN(parsed) || !Number.isFinite(parsed) || parsed <= 0) {
    throw new BadRequestError(
      `Invalid ${paramName}: must be a positive integer`,
      'INVALID_ID'
    );
  }

  return parsed;
}

/**
 * Parse integer from query parameter with optional default
 * @param value - Raw query value (may be undefined)
 * @param paramName - Parameter name for error messages
 * @param defaultValue - Default if value undefined
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @returns Validated integer
 * @throws BadRequestError if value is present but invalid
 */
export function parseQueryInt(
  value: string | undefined,
  paramName: string,
  defaultValue: number,
  min?: number,
  max?: number
): number {
  if (value === undefined) {
    return defaultValue;
  }

  const parsed = parseInt(value, 10);

  if (isNaN(parsed) || !Number.isFinite(parsed)) {
    throw new BadRequestError(
      `Invalid ${paramName}: must be an integer`,
      'VALIDATION_ERROR'
    );
  }

  if (min !== undefined && parsed < min) {
    throw new BadRequestError(
      `Invalid ${paramName}: must be at least ${min}`,
      'VALIDATION_ERROR'
    );
  }

  if (max !== undefined && parsed > max) {
    throw new BadRequestError(
      `Invalid ${paramName}: must be at most ${max}`,
      'VALIDATION_ERROR'
    );
  }

  return parsed;
}

/**
 * Parse pagination parameters from query string
 * @param query - Express req.query object
 * @returns Validated pagination params
 *
 * @example
 * router.get('/projects', (req, res) => {
 *   const { page, limit, offset } = parsePaginationParams(req.query);
 *   const projects = await db.query.projects.findMany({ limit, offset });
 *   // ...
 * });
 */
export function parsePaginationParams(query: Record<string, any>): {
  page: number;
  limit: number;
  offset: number;
} {
  const page = parseQueryInt(query.page, 'page', 1, 1);
  const limit = parseQueryInt(query.page_size, 'page_size', 20, 1, 100);
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

/**
 * Calculate pagination metadata
 * @param page - Current page number
 * @param limit - Items per page
 * @param totalCount - Total items
 * @returns Pagination metadata object
 */
export function calculatePagination(
  page: number,
  limit: number,
  totalCount: number
) {
  const totalPages = Math.ceil(totalCount / limit);

  return {
    page,
    pageSize: limit,
    totalPages,
    totalCount,
  };
}
