/**
 * Authentication routes
 * @see API Contract Section 3.1
 */

import { Router } from 'express';
import { eq, and, gte, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  users,
  organisations,
  teamMembers,
  invitations,
  passwordResetTokens,
} from '../db/schema.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rate-limit.js';
import { validateBody } from '../middleware/validation.js';
import {
  registerSchema,
  loginSchema,
  updateProfileSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  acceptInviteSchema,
} from '../../shared/validators.js';
import { hashPassword, comparePassword } from '../lib/password.js';
import { signToken, generateRandomToken } from '../lib/tokens.js';
import {
  sendSuccess,
  sendCreated,
  sendNoContent,
  sendError,
} from '../lib/response.js';
import {
  BadRequestError,
  ConflictError,
  GoneError,
  UnauthorizedError,
  UnprocessableEntityError,
} from '../errors/index.js';
import { parseIntParam } from '../lib/validation.js';

const router = Router();

// Helper to generate slug from name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

// Helper to format user response
function formatUserResponse(user: any, organisation: any) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    organisation: {
      id: organisation.id,
      name: organisation.name,
      slug: organisation.slug,
    },
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() || null,
  };
}

/**
 * POST /api/auth/register
 * Register a new user account
 */
router.post(
  '/register',
  authLimiter,
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const { email, password, name, inviteToken } = req.body;

    // Check if email already exists
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, email.toLowerCase()),
    });

    if (existingUser) {
      throw new ConflictError('Email already registered', 'DUPLICATE_EMAIL');
    }

    const passwordHash = await hashPassword(password);

    // Handle invitation token
    if (inviteToken) {
      const invitation = await db.query.invitations.findFirst({
        where: and(
          eq(invitations.token, inviteToken),
          gte(invitations.expiresAt, new Date()),
          isNull(invitations.acceptedAt)
        ),
      });

      if (!invitation) {
        throw new GoneError('Invalid or expired invitation token');
      }

      // Create user with invited organisation
      const [newUser] = await db
        .insert(users)
        .values({
          email: email.toLowerCase(),
          passwordHash,
          name,
          organisationId: invitation.organisationId,
          role: 'user',
          status: 'active',
          invitedBy: invitation.invitedBy,
        })
        .returning();

      // Create team member record
      await db.insert(teamMembers).values({
        userId: newUser.id,
        organisationId: invitation.organisationId,
        role: invitation.role,
      });

      // Mark invitation as accepted
      await db
        .update(invitations)
        .set({ acceptedAt: new Date() })
        .where(eq(invitations.id, invitation.id));

      const organisation = await db.query.organisations.findFirst({
        where: eq(organisations.id, invitation.organisationId),
      });

      const token = signToken({
        userId: newUser.id,
        email: newUser.email,
        organisationId: newUser.organisationId,
        role: invitation.role,
      });

      return sendCreated(res, {
        token,
        user: formatUserResponse(newUser, organisation),
      });
    }

    // Create new organisation and user
    const slug = generateSlug(name || email.split('@')[0]);
    const uniqueSlug = `${slug}-${Date.now().toString(36)}`;

    const [organisation] = await db
      .insert(organisations)
      .values({
        name: name || 'My Organisation',
        slug: uniqueSlug,
      })
      .returning();

    const [newUser] = await db
      .insert(users)
      .values({
        email: email.toLowerCase(),
        passwordHash,
        name,
        organisationId: organisation.id,
        role: 'admin',
        status: 'active',
      })
      .returning();

    // Create admin team member record
    await db.insert(teamMembers).values({
      userId: newUser.id,
      organisationId: organisation.id,
      role: 'admin',
    });

    const token = signToken({
      userId: newUser.id,
      email: newUser.email,
      organisationId: newUser.organisationId,
      role: 'admin',
    });

    return sendCreated(res, {
      token,
      user: formatUserResponse(newUser, organisation),
    });
  })
);

/**
 * POST /api/auth/login
 * Authenticate user and return JWT token
 */
router.post(
  '/login',
  authLimiter,
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const user = await db.query.users.findFirst({
      where: eq(users.email, email.toLowerCase()),
      with: { organisation: true },
    });

    if (!user) {
      throw new UnauthorizedError('Invalid credentials', 'INVALID_CREDENTIALS');
    }

    const isValid = await comparePassword(password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedError('Invalid credentials', 'INVALID_CREDENTIALS');
    }

    if (user.status !== 'active') {
      throw new UnauthorizedError('Account is not active', 'ACCOUNT_INACTIVE');
    }

    // Get team member role
    const member = await db.query.teamMembers.findFirst({
      where: and(
        eq(teamMembers.userId, user.id),
        eq(teamMembers.organisationId, user.organisationId)
      ),
    });

    const role = member?.role || user.role;

    // Update last login
    await db
      .update(users)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, user.id));

    const token = signToken({
      userId: user.id,
      email: user.email,
      organisationId: user.organisationId,
      role,
    });

    return sendSuccess(res, {
      token,
      user: formatUserResponse(user, user.organisation),
    });
  })
);

/**
 * POST /api/auth/logout
 * Logout user (client-side token removal)
 */
router.post(
  '/logout',
  requireAuth,
  asyncHandler(async (_req, res) => {
    // JWT tokens are stateless, logout is handled client-side
    return sendNoContent(res);
  })
);

/**
 * POST /api/auth/refresh
 * Refresh JWT token
 */
router.post(
  '/refresh',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await db.query.users.findFirst({
      where: eq(users.id, req.user!.userId),
      with: { organisation: true },
    });

    if (!user || user.status !== 'active') {
      throw new UnauthorizedError('Invalid user', 'UNAUTHORIZED');
    }

    // Get current role
    const member = await db.query.teamMembers.findFirst({
      where: and(
        eq(teamMembers.userId, user.id),
        eq(teamMembers.organisationId, user.organisationId)
      ),
    });

    const token = signToken({
      userId: user.id,
      email: user.email,
      organisationId: user.organisationId,
      role: member?.role || user.role,
    });

    return sendSuccess(res, {
      token,
      user: formatUserResponse(user, user.organisation),
    });
  })
);

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await db.query.users.findFirst({
      where: eq(users.id, req.user!.userId),
      with: { organisation: true },
    });

    if (!user) {
      throw new UnauthorizedError('User not found', 'UNAUTHORIZED');
    }

    return sendSuccess(res, { user: formatUserResponse(user, user.organisation) });
  })
);

/**
 * PATCH /api/auth/profile
 * Update current user profile
 */
router.patch(
  '/profile',
  requireAuth,
  validateBody(updateProfileSchema),
  asyncHandler(async (req, res) => {
    const { name, currentPassword, newPassword } = req.body;

    const user = await db.query.users.findFirst({
      where: eq(users.id, req.user!.userId),
      with: { organisation: true },
    });

    if (!user) {
      throw new UnauthorizedError('User not found', 'UNAUTHORIZED');
    }

    const updates: Partial<typeof users.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (name !== undefined) {
      updates.name = name;
    }

    if (newPassword) {
      if (!currentPassword) {
        throw new BadRequestError(
          'Current password is required',
          'VALIDATION_ERROR'
        );
      }

      const isValid = await comparePassword(currentPassword, user.passwordHash);
      if (!isValid) {
        throw new UnprocessableEntityError(
          'Current password is incorrect',
          'INVALID_PASSWORD'
        );
      }

      updates.passwordHash = await hashPassword(newPassword);
    }

    const [updatedUser] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, user.id))
      .returning();

    return sendSuccess(res, {
      user: formatUserResponse(updatedUser, user.organisation),
    });
  })
);

/**
 * POST /api/auth/forgot-password
 * Request password reset email
 */
router.post(
  '/forgot-password',
  authLimiter,
  validateBody(forgotPasswordSchema),
  asyncHandler(async (req, res) => {
    const { email } = req.body;

    // Always return success to prevent email enumeration
    const user = await db.query.users.findFirst({
      where: eq(users.email, email.toLowerCase()),
    });

    if (user) {
      // Delete existing tokens
      await db
        .delete(passwordResetTokens)
        .where(eq(passwordResetTokens.userId, user.id));

      // Create new token (expires in 1 hour)
      const token = generateRandomToken();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await db.insert(passwordResetTokens).values({
        userId: user.id,
        token,
        expiresAt,
      });

      // In development, log the token
      if (process.env.NODE_ENV === 'development') {
        console.log(`[DEV] Password reset token for ${email}: ${token}`);
      }

      // In production, send email via Resend
      // TODO: Implement email sending when RESEND_API_KEY is set
    }

    return sendSuccess(res, {
      message: 'If an account exists with that email, a password reset link has been sent.',
    });
  })
);

/**
 * GET /api/auth/reset-password/:token
 * Validate password reset token
 */
router.get(
  '/reset-password/:token',
  asyncHandler(async (req, res) => {
    const { token } = req.params;

    const resetToken = await db.query.passwordResetTokens.findFirst({
      where: and(
        eq(passwordResetTokens.token, token),
        gte(passwordResetTokens.expiresAt, new Date()),
        isNull(passwordResetTokens.usedAt)
      ),
      with: { user: true },
    });

    if (!resetToken) {
      throw new GoneError('Invalid or expired reset token');
    }

    // Don't include full user data, just indicate valid
    return sendSuccess(res, {
      valid: true,
      email: resetToken.user?.email
        ? `${resetToken.user.email.slice(0, 3)}***@***`
        : undefined,
    });
  })
);

/**
 * POST /api/auth/reset-password
 * Reset password with token
 */
router.post(
  '/reset-password',
  authLimiter,
  validateBody(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    const { token, newPassword } = req.body;

    const resetToken = await db.query.passwordResetTokens.findFirst({
      where: and(
        eq(passwordResetTokens.token, token),
        gte(passwordResetTokens.expiresAt, new Date()),
        isNull(passwordResetTokens.usedAt)
      ),
    });

    if (!resetToken) {
      throw new GoneError('Invalid or expired reset token');
    }

    const passwordHash = await hashPassword(newPassword);

    // Update password
    await db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, resetToken.userId));

    // Mark token as used
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, resetToken.id));

    return sendSuccess(res, {
      message: 'Password has been reset successfully.',
    });
  })
);

/**
 * GET /api/invitations/:token/validate
 * Validate invitation token
 */
router.get(
  '/invitations/:token/validate',
  asyncHandler(async (req, res) => {
    const { token } = req.params;

    const invitation = await db.query.invitations.findFirst({
      where: and(
        eq(invitations.token, token),
        gte(invitations.expiresAt, new Date()),
        isNull(invitations.acceptedAt)
      ),
      with: { organisation: true },
    });

    if (!invitation) {
      throw new GoneError('Invalid or expired invitation');
    }

    // Get inviter name
    const inviter = await db.query.users.findFirst({
      where: eq(users.id, invitation.invitedBy),
    });

    return sendSuccess(res, {
      valid: true,
      organisation: invitation.organisation?.name,
      inviterName: inviter?.name || inviter?.email,
      role: invitation.role,
      email: invitation.email,
    });
  })
);

/**
 * POST /api/invitations/:token/accept
 * Accept invitation and create account
 */
router.post(
  '/invitations/:token/accept',
  authLimiter,
  validateBody(acceptInviteSchema),
  asyncHandler(async (req, res) => {
    const { token } = req.params;
    const { name, password } = req.body;

    const invitation = await db.query.invitations.findFirst({
      where: and(
        eq(invitations.token, token),
        gte(invitations.expiresAt, new Date()),
        isNull(invitations.acceptedAt)
      ),
      with: { organisation: true },
    });

    if (!invitation) {
      throw new GoneError('Invalid or expired invitation');
    }

    // Check if email already exists
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, invitation.email.toLowerCase()),
    });

    if (existingUser) {
      throw new ConflictError('Email already registered', 'DUPLICATE_EMAIL');
    }

    const passwordHash = await hashPassword(password);

    // Create user
    const [newUser] = await db
      .insert(users)
      .values({
        email: invitation.email.toLowerCase(),
        passwordHash,
        name,
        organisationId: invitation.organisationId,
        role: 'user',
        status: 'active',
        invitedBy: invitation.invitedBy,
      })
      .returning();

    // Create team member record
    await db.insert(teamMembers).values({
      userId: newUser.id,
      organisationId: invitation.organisationId,
      role: invitation.role,
    });

    // Mark invitation as accepted
    await db
      .update(invitations)
      .set({ acceptedAt: new Date() })
      .where(eq(invitations.id, invitation.id));

    const jwtToken = signToken({
      userId: newUser.id,
      email: newUser.email,
      organisationId: newUser.organisationId,
      role: invitation.role,
    });

    return sendCreated(res, {
      token: jwtToken,
      user: formatUserResponse(newUser, invitation.organisation),
    });
  })
);

export default router;
