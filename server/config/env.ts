/**
 * Environment configuration with validation
 * @see Architecture Section 13
 */

import * as dotenv from 'dotenv';
dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Environment variable ${key} is required`);
  }
  return value;
}

function optionalEnv(key: string): string | undefined {
  return process.env[key];
}

export const env = {
  // REQUIRED
  DATABASE_URL: requireEnv('DATABASE_URL'),
  JWT_SECRET: requireEnv('JWT_SECRET'),
  ENCRYPTION_KEY: requireEnv('ENCRYPTION_KEY'),
  AWS_REGION: requireEnv('AWS_REGION'),
  AWS_ACCESS_KEY_ID: requireEnv('AWS_ACCESS_KEY_ID'),
  AWS_SECRET_ACCESS_KEY: requireEnv('AWS_SECRET_ACCESS_KEY'),
  AWS_S3_BUCKET: requireEnv('AWS_S3_BUCKET'),

  // OPTIONAL
  AWS_ENDPOINT: optionalEnv('AWS_ENDPOINT'),
  RESEND_API_KEY: optionalEnv('RESEND_API_KEY'),
  EMAIL_FROM: optionalEnv('EMAIL_FROM'),
  TEAMWORK_DESK_CLIENT_ID: optionalEnv('TEAMWORK_DESK_CLIENT_ID'),
  TEAMWORK_DESK_CLIENT_SECRET: optionalEnv('TEAMWORK_DESK_CLIENT_SECRET'),
  TEAMWORK_DESK_REDIRECT_URI: optionalEnv('TEAMWORK_DESK_REDIRECT_URI'),

  // DEFAULTS
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '5000', 10),

  // Derived
  get isDevelopment() {
    return this.NODE_ENV === 'development';
  },
  get isProduction() {
    return this.NODE_ENV === 'production';
  },
  get isEmailEnabled() {
    return Boolean(this.RESEND_API_KEY);
  },
};

// Validate encryption key format
if (env.ENCRYPTION_KEY.length !== 64) {
  throw new Error('ENCRYPTION_KEY must be exactly 64 hex characters');
}

// Validate JWT secret length
if (env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters');
}

console.log('Environment configuration loaded');
