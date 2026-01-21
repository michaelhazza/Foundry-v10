/**
 * OAuth routes for Teamwork Desk integration
 * @see API Contract Section 3.7
 */

import { Router } from 'express';
import { eq, and, count } from 'drizzle-orm';
import { db } from '../db/index.js';
import { oauthConnections } from '../db/schema.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validation.js';
import { createOAuthConnectionSchema } from '../../shared/validators.js';
import {
  sendSuccess,
  sendCreated,
  sendNoContent,
  sendPaginated,
} from '../lib/response.js';
import { NotFoundError, ForbiddenError, BadRequestError, ConflictError } from '../errors/index.js';
import { encrypt, decrypt } from '../lib/encryption.js';
import {
  parseIntParam,
  parsePaginationParams,
  calculatePagination,
} from '../lib/validation.js';

const router = Router();

// Apply authentication to all routes
router.use(requireAuth);

/**
 * GET /api/oauth/connections
 * List OAuth connections for the organisation
 */
router.get(
  '/connections',
  asyncHandler(async (req, res) => {
    const organisationId = req.user!.organisationId;
    const { page, limit, offset } = parsePaginationParams(req.query as any);

    // Get total count
    const [{ value: totalCount }] = await db
      .select({ value: count() })
      .from(oauthConnections)
      .where(eq(oauthConnections.organisationId, organisationId));

    // Get connections
    const connections = await db.query.oauthConnections.findMany({
      where: eq(oauthConnections.organisationId, organisationId),
      limit,
      offset,
    });

    const formattedConnections = connections.map((conn) => ({
      id: conn.id,
      organisationId: conn.organisationId,
      provider: conn.provider,
      accountName: conn.accountName,
      isActive: conn.isActive === 1,
      lastSyncedAt: conn.lastSyncedAt?.toISOString() || null,
      createdAt: conn.createdAt.toISOString(),
    }));

    const pagination = calculatePagination(page, limit, totalCount);
    return sendPaginated(res, formattedConnections, pagination);
  })
);

/**
 * POST /api/oauth/connections
 * Create new OAuth connection (exchange auth code for tokens)
 */
router.post(
  '/connections',
  requireRole('admin', 'editor'),
  validateBody(createOAuthConnectionSchema),
  asyncHandler(async (req, res) => {
    const organisationId = req.user!.organisationId;
    const userId = req.user!.userId;
    const { provider, code, redirectUri } = req.body;

    // Check for existing connection
    const existingConnection = await db.query.oauthConnections.findFirst({
      where: and(
        eq(oauthConnections.organisationId, organisationId),
        eq(oauthConnections.provider, provider)
      ),
    });

    if (existingConnection && existingConnection.isActive === 1) {
      throw new ConflictError('An active connection already exists for this provider');
    }

    // In production, exchange authorization code for tokens
    // For Teamwork Desk:
    // const tokenResponse = await fetch('https://www.teamwork.com/oauth/accesstoken', {
    //   method: 'POST',
    //   body: JSON.stringify({
    //     code,
    //     client_id: process.env.TEAMWORK_DESK_CLIENT_ID,
    //     client_secret: process.env.TEAMWORK_DESK_CLIENT_SECRET,
    //     redirect_uri: redirectUri,
    //   }),
    // });

    // For demo purposes, simulate token exchange
    const accessToken = `access_${Date.now()}_${Math.random().toString(36)}`;
    const refreshToken = `refresh_${Date.now()}_${Math.random().toString(36)}`;

    // CRITICAL: Encrypt tokens before storage
    const encryptedAccessToken = encrypt(accessToken);
    const encryptedRefreshToken = encrypt(refreshToken);

    // Calculate token expiry (typically 1 hour for access tokens)
    const tokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000);

    // Update existing or create new connection
    if (existingConnection) {
      const [updated] = await db
        .update(oauthConnections)
        .set({
          userId,
          encryptedAccessToken,
          encryptedRefreshToken,
          tokenExpiresAt,
          isActive: 1,
          updatedAt: new Date(),
        })
        .where(eq(oauthConnections.id, existingConnection.id))
        .returning();

      return sendSuccess(res, {
        connection: {
          id: updated.id,
          organisationId: updated.organisationId,
          provider: updated.provider,
          isActive: true,
          createdAt: updated.createdAt.toISOString(),
        },
      });
    }

    const [connection] = await db
      .insert(oauthConnections)
      .values({
        organisationId,
        userId,
        provider,
        encryptedAccessToken,
        encryptedRefreshToken,
        tokenExpiresAt,
        scopes: 'read write',
        isActive: 1,
      })
      .returning();

    return sendCreated(res, {
      connection: {
        id: connection.id,
        organisationId: connection.organisationId,
        provider: connection.provider,
        isActive: true,
        createdAt: connection.createdAt.toISOString(),
      },
    });
  })
);

/**
 * GET /api/oauth/connections/:connectionId
 * Get a single OAuth connection
 */
router.get(
  '/connections/:connectionId',
  asyncHandler(async (req, res) => {
    const connectionId = parseIntParam(req.params.connectionId, 'connectionId');
    const organisationId = req.user!.organisationId;

    const connection = await db.query.oauthConnections.findFirst({
      where: eq(oauthConnections.id, connectionId),
    });

    if (!connection) {
      throw new NotFoundError('OAuth connection not found');
    }

    if (connection.organisationId !== organisationId) {
      throw new ForbiddenError('Access denied to this connection');
    }

    return sendSuccess(res, {
      connection: {
        id: connection.id,
        organisationId: connection.organisationId,
        provider: connection.provider,
        accountName: connection.accountName,
        isActive: connection.isActive === 1,
        scopes: connection.scopes,
        lastSyncedAt: connection.lastSyncedAt?.toISOString() || null,
        createdAt: connection.createdAt.toISOString(),
      },
    });
  })
);

/**
 * DELETE /api/oauth/connections/:connectionId
 * Revoke OAuth connection
 */
router.delete(
  '/connections/:connectionId',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const connectionId = parseIntParam(req.params.connectionId, 'connectionId');
    const organisationId = req.user!.organisationId;

    const connection = await db.query.oauthConnections.findFirst({
      where: eq(oauthConnections.id, connectionId),
    });

    if (!connection) {
      throw new NotFoundError('OAuth connection not found');
    }

    if (connection.organisationId !== organisationId) {
      throw new ForbiddenError('Access denied to this connection');
    }

    // In production, also revoke tokens at provider
    // await revokeProviderTokens(connection);

    // Soft deactivate - keep for audit trail
    await db
      .update(oauthConnections)
      .set({
        isActive: 0,
        updatedAt: new Date(),
      })
      .where(eq(oauthConnections.id, connectionId));

    return sendNoContent(res);
  })
);

/**
 * GET /api/oauth/authorize/:provider
 * Get OAuth authorization URL
 */
router.get(
  '/authorize/:provider',
  requireRole('admin', 'editor'),
  asyncHandler(async (req, res) => {
    const { provider } = req.params;

    if (provider !== 'teamwork_desk') {
      throw new BadRequestError('Unsupported OAuth provider');
    }

    const clientId = process.env.TEAMWORK_DESK_CLIENT_ID;
    const redirectUri = process.env.TEAMWORK_DESK_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      throw new BadRequestError('Teamwork Desk OAuth is not configured');
    }

    // Generate state parameter for CSRF protection
    const state = `${req.user!.organisationId}_${Date.now()}_${Math.random().toString(36)}`;

    // Construct authorization URL
    const authUrl = new URL('https://www.teamwork.com/oauth/authorize');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);

    return sendSuccess(res, {
      authorizationUrl: authUrl.toString(),
      state,
    });
  })
);

export default router;
