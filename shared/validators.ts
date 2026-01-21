/**
 * Zod validation schemas
 * @see API Contract Section 3
 */

import { z } from 'zod';

// Password validation regex: min 8 chars, 1 uppercase, 1 digit
const passwordRegex = /^(?=.*[A-Z])(?=.*\d).{8,}$/;

// ============================================================================
// AUTH SCHEMAS
// ============================================================================

export const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(passwordRegex, 'Password must contain 1 uppercase letter and 1 digit'),
  name: z.string().min(1, 'Name is required').max(100),
  inviteToken: z.string().uuid().optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  currentPassword: z.string().optional(),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(passwordRegex, 'Password must contain 1 uppercase letter and 1 digit')
    .optional(),
}).refine(
  (data) => {
    if (data.newPassword && !data.currentPassword) {
      return false;
    }
    return true;
  },
  {
    message: 'Current password is required to change password',
    path: ['currentPassword'],
  }
);

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email format'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(passwordRegex, 'Password must contain 1 uppercase letter and 1 digit'),
});

export const acceptInviteSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(passwordRegex, 'Password must contain 1 uppercase letter and 1 digit'),
});

// ============================================================================
// PROJECT SCHEMAS
// ============================================================================

export const createProjectSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().max(1000).optional(),
  targetSchema: z.enum(['conversation']),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  status: z.enum(['active', 'archived']).optional(),
});

// ============================================================================
// DATA SOURCE SCHEMAS
// ============================================================================

export const createApiDataSourceSchema = z.object({
  type: z.literal('api'),
  connectionId: z.number().int().positive(),
  name: z.string().min(1, 'Name is required').max(200),
});

export const updateDataSourceSchema = z.object({
  name: z.string().min(1).max(200).optional(),
});

// ============================================================================
// SCHEMA MAPPING SCHEMAS
// ============================================================================

export const mappingConfigSchema = z.object({
  message_id: z.string(),
  role: z.string(),
  message_text: z.string(),
  timestamp: z.string(),
  thread_id: z.string().optional(),
  metadata: z.record(z.string()).optional(),
});

export const piiConfigSchema = z.object({
  enabledDetectors: z.array(
    z.enum(['email', 'phone', 'ssn', 'credit_card', 'person_name'])
  ),
  redactionMethod: z.enum(['mask', 'remove', 'hash']),
  customPatterns: z
    .array(
      z.object({
        name: z.string(),
        regex: z.string(),
        replacement: z.string(),
      })
    )
    .optional(),
});

export const filterConfigSchema = z.object({
  rules: z.array(
    z.object({
      field: z.string(),
      operator: z.enum(['equals', 'contains', 'startsWith', 'regex']),
      value: z.string(),
    })
  ),
  logic: z.enum(['AND', 'OR']),
});

export const createSchemaMappingSchema = z.object({
  dataSourceId: z.number().int().positive(),
  mappingConfig: mappingConfigSchema,
  piiConfig: piiConfigSchema,
  filterConfig: filterConfigSchema.optional(),
});

export const updateSchemaMappingSchema = z.object({
  mappingConfig: mappingConfigSchema.optional(),
  piiConfig: piiConfigSchema.optional(),
  filterConfig: filterConfigSchema.optional(),
  isActive: z.boolean().optional(),
});

// ============================================================================
// PROCESSING JOB SCHEMAS
// ============================================================================

export const createJobSchema = z.object({
  schemaMappingId: z.number().int().positive(),
  outputFormat: z.enum(['json', 'csv', 'jsonl']),
  outputName: z.string().max(200).optional(),
});

// ============================================================================
// OAUTH SCHEMAS
// ============================================================================

export const createOAuthConnectionSchema = z.object({
  provider: z.enum(['teamwork_desk']),
  code: z.string().min(1, 'Authorization code is required'),
  redirectUri: z.string().url('Invalid redirect URI'),
});

// ============================================================================
// ORGANISATION SCHEMAS
// ============================================================================

export const updateOrganisationSchema = z.object({
  name: z.string().min(1).max(200).optional(),
});

export const inviteMemberSchema = z.object({
  email: z.string().email('Invalid email format'),
  role: z.enum(['admin', 'editor', 'viewer']),
  name: z.string().max(100).optional(),
});

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type CreateApiDataSourceInput = z.infer<typeof createApiDataSourceSchema>;
export type UpdateDataSourceInput = z.infer<typeof updateDataSourceSchema>;
export type CreateSchemaMappingInput = z.infer<typeof createSchemaMappingSchema>;
export type UpdateSchemaMappingInput = z.infer<typeof updateSchemaMappingSchema>;
export type CreateJobInput = z.infer<typeof createJobSchema>;
export type CreateOAuthConnectionInput = z.infer<typeof createOAuthConnectionSchema>;
export type UpdateOrganisationInput = z.infer<typeof updateOrganisationSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
