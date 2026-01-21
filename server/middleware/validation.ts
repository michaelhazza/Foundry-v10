/**
 * Request validation middleware
 */

import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { BadRequestError } from '../errors/index.js';

/**
 * Validate request body against Zod schema
 */
export function validateBody(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error: any) {
      if (error.name === 'ZodError') {
        const details = error.errors.map((e: any) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        const err = new BadRequestError('Validation failed', 'VALIDATION_ERROR');
        (err as any).details = details;
        next(err);
      } else {
        next(error);
      }
    }
  };
}

/**
 * Validate request query against Zod schema
 */
export function validateQuery(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.query = schema.parse(req.query) as any;
      next();
    } catch (error: any) {
      if (error.name === 'ZodError') {
        const details = error.errors.map((e: any) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        const err = new BadRequestError('Validation failed', 'VALIDATION_ERROR');
        (err as any).details = details;
        next(err);
      } else {
        next(error);
      }
    }
  };
}
