/**
 * Health check routes
 */

import { Router } from 'express';
import { sendSuccess } from '../lib/response.js';

const router = Router();

/**
 * GET /api/health
 * Health check endpoint
 */
router.get('/', (_req, res) => {
  return sendSuccess(res, {
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

export default router;
