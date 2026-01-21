/**
 * Authentication middleware
 * @see API Contract Section 1.7
 */

import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError, ForbiddenError } from '../errors/index.js';
import { verifyToken, JWTPayload } from '../lib/tokens.js';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

/**
 * Require authentication middleware
 * Validates JWT token and attaches user to request
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedError('Authorization header required');
    }

    if (!authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Invalid authorization format');
    }

    const token = authHeader.substring(7);

    if (!token) {
      throw new UnauthorizedError('Token required');
    }

    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch (error: any) {
    if (error instanceof UnauthorizedError) {
      next(error);
    } else if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      next(error);
    } else {
      next(new UnauthorizedError('Invalid token'));
    }
  }
}

/**
 * Require specific role middleware
 * Must be used after requireAuth
 * @param roles - Allowed roles
 */
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }

    if (!roles.includes(req.user.role)) {
      next(new ForbiddenError('Insufficient permissions'));
      return;
    }

    next();
  };
}

/**
 * Optional authentication middleware
 * Attaches user to request if valid token present, but doesn't fail
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      if (token) {
        const payload = verifyToken(token);
        req.user = payload;
      }
    }
    next();
  } catch {
    // Ignore errors for optional auth
    next();
  }
}
