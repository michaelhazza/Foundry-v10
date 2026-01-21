/**
 * JWT token utilities
 * @see API Contract Section 1.7
 */

import jwt from 'jsonwebtoken';

const JWT_EXPIRY = '24h';

export interface JWTPayload {
  userId: number;
  email: string;
  organisationId: number;
  role: string;
}

/**
 * Sign a JWT token
 * @param payload - Token payload
 * @returns Signed JWT token string
 */
export function signToken(payload: JWTPayload): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  return jwt.sign(payload, secret, { expiresIn: JWT_EXPIRY });
}

/**
 * Verify and decode a JWT token
 * @param token - JWT token string
 * @returns Decoded payload
 * @throws JsonWebTokenError if token is invalid
 * @throws TokenExpiredError if token is expired
 */
export function verifyToken(token: string): JWTPayload {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  return jwt.verify(token, secret) as JWTPayload;
}

/**
 * Generate a random token for password reset or invitations
 * @returns Random hex string (32 bytes = 64 hex chars)
 */
export function generateRandomToken(): string {
  const crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
}
