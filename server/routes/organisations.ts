/**
 * Organisation routes
 * @see API Contract Section 3.8
 */

import { Router } from 'express';
import { eq, and, count, ne } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  organisations,
  users,
  teamMembers,
  invitations,
} from '../db/schema.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rate-limit.js';
import { validateBody } from '../middleware/validation.js';
import {
  updateOrganisationSchema,
  inviteMemberSchema,
} from '../../shared/validators.js';
import {
  sendSuccess,
  sendCreated,
  sendNoContent,
  sendPaginated,
} from '../lib/response.js';
import {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
  ConflictError,
} from '../errors/index.js';
import { generateRandomToken } from '../lib/tokens.js';
import {
  parseIntParam,
  parsePaginationParams,
  calculatePagination,
} from '../lib/validation.js';

const router = Router();

// Apply authentication to all routes
router.use(requireAuth);

/**
 * GET /api/organisations/current
 * Get current user's organisation
 */
router.get(
  '/current',
  asyncHandler(async (req, res) => {
    const organisationId = req.user!.organisationId;

    const organisation = await db.query.organisations.findFirst({
      where: eq(organisations.id, organisationId),
    });

    if (!organisation) {
      throw new NotFoundError('Organisation not found');
    }

    // Get member count
    const [{ value: memberCount }] = await db
      .select({ value: count() })
      .from(teamMembers)
      .where(eq(teamMembers.organisationId, organisationId));

    return sendSuccess(res, {
      organisation: {
        id: organisation.id,
        name: organisation.name,
        slug: organisation.slug,
        subscriptionTier: organisation.subscriptionTier,
        subscriptionStatus: organisation.subscriptionStatus,
        memberCount,
        createdAt: organisation.createdAt.toISOString(),
        updatedAt: organisation.updatedAt.toISOString(),
      },
    });
  })
);

/**
 * PATCH /api/organisations/current
 * Update current organisation
 */
router.patch(
  '/current',
  requireRole('admin'),
  validateBody(updateOrganisationSchema),
  asyncHandler(async (req, res) => {
    const organisationId = req.user!.organisationId;
    const { name } = req.body;

    const organisation = await db.query.organisations.findFirst({
      where: eq(organisations.id, organisationId),
    });

    if (!organisation) {
      throw new NotFoundError('Organisation not found');
    }

    const updates: Partial<typeof organisations.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (name !== undefined) updates.name = name;

    const [updated] = await db
      .update(organisations)
      .set(updates)
      .where(eq(organisations.id, organisationId))
      .returning();

    return sendSuccess(res, {
      organisation: {
        id: updated.id,
        name: updated.name,
        slug: updated.slug,
        subscriptionTier: updated.subscriptionTier,
        subscriptionStatus: updated.subscriptionStatus,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  })
);

/**
 * GET /api/organisations/members
 * List organisation members
 */
router.get(
  '/members',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const organisationId = req.user!.organisationId;
    const { page, limit, offset } = parsePaginationParams(req.query as any);

    // Get total count
    const [{ value: totalCount }] = await db
      .select({ value: count() })
      .from(teamMembers)
      .where(eq(teamMembers.organisationId, organisationId));

    // Get members with user info
    const members = await db.query.teamMembers.findMany({
      where: eq(teamMembers.organisationId, organisationId),
      with: {
        user: true,
      },
      limit,
      offset,
    });

    const formattedMembers = members.map((member) => ({
      id: member.user?.id,
      userId: member.userId,
      email: member.user?.email,
      name: member.user?.name,
      role: member.role,
      status: member.user?.status,
      lastLoginAt: member.user?.lastLoginAt?.toISOString() || null,
      createdAt: member.createdAt.toISOString(),
    }));

    const pagination = calculatePagination(page, limit, totalCount);
    return sendPaginated(res, formattedMembers, pagination);
  })
);

/**
 * POST /api/organisations/members/invite
 * Invite a new member
 */
router.post(
  '/members/invite',
  requireRole('admin'),
  authLimiter,
  validateBody(inviteMemberSchema),
  asyncHandler(async (req, res) => {
    const organisationId = req.user!.organisationId;
    const inviterId = req.user!.userId;
    const { email, role, name } = req.body;

    // Check if user already exists in organisation
    const existingUser = await db.query.users.findFirst({
      where: and(
        eq(users.email, email.toLowerCase()),
        eq(users.organisationId, organisationId)
      ),
    });

    if (existingUser) {
      throw new ConflictError('User is already a member of this organisation');
    }

    // Check for existing pending invitation
    const existingInvitation = await db.query.invitations.findFirst({
      where: and(
        eq(invitations.email, email.toLowerCase()),
        eq(invitations.organisationId, organisationId)
      ),
    });

    if (existingInvitation && !existingInvitation.acceptedAt) {
      // Return existing invitation
      return sendSuccess(res, {
        invitation: {
          email: existingInvitation.email,
          role: existingInvitation.role,
          token: existingInvitation.token,
          expiresAt: existingInvitation.expiresAt.toISOString(),
        },
      });
    }

    // Create invitation (expires in 7 days)
    const token = generateRandomToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const [invitation] = await db
      .insert(invitations)
      .values({
        organisationId,
        email: email.toLowerCase(),
        role,
        token,
        invitedBy: inviterId,
        expiresAt,
      })
      .returning();

    // In development, log the invitation link
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DEV] Invitation link for ${email}: /accept-invite?token=${token}`);
    }

    // In production, send email via Resend
    // TODO: Implement email sending

    return sendCreated(res, {
      invitation: {
        email: invitation.email,
        role: invitation.role,
        token: invitation.token,
        expiresAt: invitation.expiresAt.toISOString(),
      },
    });
  })
);

/**
 * PATCH /api/organisations/members/:userId
 * Update member role
 */
router.patch(
  '/members/:userId',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const userId = parseIntParam(req.params.userId, 'userId');
    const organisationId = req.user!.organisationId;
    const currentUserId = req.user!.userId;
    const { role } = req.body;

    if (!role || !['admin', 'editor', 'viewer'].includes(role)) {
      throw new BadRequestError('Invalid role');
    }

    // Find member
    const member = await db.query.teamMembers.findFirst({
      where: and(
        eq(teamMembers.userId, userId),
        eq(teamMembers.organisationId, organisationId)
      ),
      with: { user: true },
    });

    if (!member) {
      throw new NotFoundError('Member not found');
    }

    // Prevent changing own role from admin
    if (userId === currentUserId && member.role === 'admin' && role !== 'admin') {
      // Count other admins
      const [{ value: adminCount }] = await db
        .select({ value: count() })
        .from(teamMembers)
        .where(
          and(
            eq(teamMembers.organisationId, organisationId),
            eq(teamMembers.role, 'admin'),
            ne(teamMembers.userId, userId)
          )
        );

      if (adminCount === 0) {
        throw new BadRequestError('Cannot remove the last admin');
      }
    }

    const [updated] = await db
      .update(teamMembers)
      .set({ role, updatedAt: new Date() })
      .where(eq(teamMembers.id, member.id))
      .returning();

    return sendSuccess(res, {
      member: {
        userId: updated.userId,
        role: updated.role,
        email: member.user?.email,
        name: member.user?.name,
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  })
);

/**
 * DELETE /api/organisations/members/:userId
 * Remove member from organisation
 */
router.delete(
  '/members/:userId',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const userId = parseIntParam(req.params.userId, 'userId');
    const organisationId = req.user!.organisationId;
    const currentUserId = req.user!.userId;

    // Cannot remove self
    if (userId === currentUserId) {
      throw new BadRequestError('Cannot remove yourself from the organisation');
    }

    // Find member
    const member = await db.query.teamMembers.findFirst({
      where: and(
        eq(teamMembers.userId, userId),
        eq(teamMembers.organisationId, organisationId)
      ),
    });

    if (!member) {
      throw new NotFoundError('Member not found');
    }

    // Check if removing last admin
    if (member.role === 'admin') {
      const [{ value: adminCount }] = await db
        .select({ value: count() })
        .from(teamMembers)
        .where(
          and(
            eq(teamMembers.organisationId, organisationId),
            eq(teamMembers.role, 'admin')
          )
        );

      if (adminCount <= 1) {
        throw new BadRequestError('Cannot remove the last admin');
      }
    }

    // Remove team membership
    await db
      .delete(teamMembers)
      .where(eq(teamMembers.id, member.id));

    // Update user status
    await db
      .update(users)
      .set({ status: 'removed', updatedAt: new Date() })
      .where(eq(users.id, userId));

    return sendNoContent(res);
  })
);

export default router;
