/**
 * Database schema using Drizzle ORM
 * @see Data Model Document
 */

import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  unique,
  index,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ============================================================================
// ORGANISATIONS
// ============================================================================

export const organisations = pgTable('organisations', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  subscriptionTier: text('subscription_tier').notNull().default('free'),
  subscriptionStatus: text('subscription_status').notNull().default('active'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type Organisation = typeof organisations.$inferSelect;
export type NewOrganisation = typeof organisations.$inferInsert;

// ============================================================================
// USERS
// ============================================================================

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  organisationId: integer('organisation_id')
    .notNull()
    .references(() => organisations.id, { onDelete: 'restrict' }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name'),
  role: text('role').notNull().default('user'),
  status: text('status').notNull().default('active'),
  invitedBy: integer('invited_by').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
  lastLoginAt: timestamp('last_login_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  orgIdx: index('users_organisation_id_idx').on(table.organisationId),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// ============================================================================
// TEAM MEMBERS
// ============================================================================

export const teamMembers = pgTable('team_members', {
  id: serial('id').primaryKey(),
  organisationId: integer('organisation_id')
    .notNull()
    .references(() => organisations.id, { onDelete: 'cascade' }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  orgUserUnique: unique('org_user_unique').on(table.organisationId, table.userId),
}));

export type TeamMember = typeof teamMembers.$inferSelect;
export type NewTeamMember = typeof teamMembers.$inferInsert;

// ============================================================================
// INVITATIONS
// ============================================================================

export const invitations = pgTable('invitations', {
  id: serial('id').primaryKey(),
  organisationId: integer('organisation_id')
    .notNull()
    .references(() => organisations.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role').notNull(),
  token: text('token').notNull().unique(),
  invitedBy: integer('invited_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at').notNull(),
  acceptedAt: timestamp('accepted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  tokenIdx: index('invitations_token_idx').on(table.token),
}));

export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;

// ============================================================================
// PASSWORD RESET TOKENS
// ============================================================================

export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  tokenIdx: index('password_reset_tokens_token_idx').on(table.token),
}));

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert;

// ============================================================================
// PROJECTS
// ============================================================================

export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  organisationId: integer('organisation_id')
    .notNull()
    .references(() => organisations.id, { onDelete: 'cascade' }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  description: text('description'),
  targetSchema: text('target_schema').notNull().default('conversation'),
  status: text('status').notNull().default('active'),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  orgIdx: index('projects_organisation_id_idx').on(table.organisationId),
  userIdx: index('projects_user_id_idx').on(table.userId),
}));

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

// ============================================================================
// DATA SOURCES
// ============================================================================

export const dataSources = pgTable('data_sources', {
  id: serial('id').primaryKey(),
  organisationId: integer('organisation_id')
    .notNull()
    .references(() => organisations.id, { onDelete: 'cascade' }),
  projectId: integer('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type').notNull(),
  format: text('format'),
  filePath: text('file_path'),
  fileSize: integer('file_size'),
  recordCount: integer('record_count'),
  status: text('status').notNull().default('pending'),
  errorMessage: text('error_message'),
  metadata: text('metadata'),
  connectionId: integer('connection_id').references(() => oauthConnections.id, { onDelete: 'set null' }),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  projectIdx: index('data_sources_project_id_idx').on(table.projectId),
  orgIdx: index('data_sources_organisation_id_idx').on(table.organisationId),
}));

export type DataSource = typeof dataSources.$inferSelect;
export type NewDataSource = typeof dataSources.$inferInsert;

// ============================================================================
// SCHEMA MAPPINGS
// ============================================================================

export const schemaMappings = pgTable('schema_mappings', {
  id: serial('id').primaryKey(),
  organisationId: integer('organisation_id')
    .notNull()
    .references(() => organisations.id, { onDelete: 'cascade' }),
  projectId: integer('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  dataSourceId: integer('data_source_id')
    .notNull()
    .references(() => dataSources.id, { onDelete: 'cascade' }),
  mappingConfig: text('mapping_config').notNull(),
  piiConfig: text('pii_config').notNull(),
  filterConfig: text('filter_config'),
  isActive: integer('is_active').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  dataSourceUnique: unique('schema_mappings_data_source_unique').on(table.dataSourceId),
  projectIdx: index('schema_mappings_project_id_idx').on(table.projectId),
}));

export type SchemaMapping = typeof schemaMappings.$inferSelect;
export type NewSchemaMapping = typeof schemaMappings.$inferInsert;

// ============================================================================
// PROCESSING JOBS
// ============================================================================

export const processingJobs = pgTable('processing_jobs', {
  id: serial('id').primaryKey(),
  organisationId: integer('organisation_id')
    .notNull()
    .references(() => organisations.id, { onDelete: 'cascade' }),
  projectId: integer('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  schemaMappingId: integer('schema_mapping_id')
    .notNull()
    .references(() => schemaMappings.id, { onDelete: 'cascade' }),
  dataSourceId: integer('data_source_id')
    .notNull()
    .references(() => dataSources.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('pending'),
  outputFormat: text('output_format').notNull(),
  outputName: text('output_name'),
  inputRecordCount: integer('input_record_count').notNull().default(0),
  outputRecordCount: integer('output_record_count'),
  piiDetectedCount: integer('pii_detected_count'),
  progress: integer('progress').notNull().default(0),
  currentStage: text('current_stage'),
  errorMessage: text('error_message'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  statusIdx: index('processing_jobs_status_idx').on(table.status),
  orgStatusIdx: index('processing_jobs_org_status_idx').on(table.organisationId, table.status),
  projectIdx: index('processing_jobs_project_id_idx').on(table.projectId),
}));

export type ProcessingJob = typeof processingJobs.$inferSelect;
export type NewProcessingJob = typeof processingJobs.$inferInsert;

// ============================================================================
// JOB LOGS
// ============================================================================

export const jobLogs = pgTable('job_logs', {
  id: serial('id').primaryKey(),
  jobId: integer('job_id')
    .notNull()
    .references(() => processingJobs.id, { onDelete: 'cascade' }),
  level: text('level').notNull(),
  message: text('message').notNull(),
  details: text('details'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  jobIdx: index('job_logs_job_id_idx').on(table.jobId),
}));

export type JobLog = typeof jobLogs.$inferSelect;
export type NewJobLog = typeof jobLogs.$inferInsert;

// ============================================================================
// DATASETS
// ============================================================================

export const datasets = pgTable('datasets', {
  id: serial('id').primaryKey(),
  organisationId: integer('organisation_id')
    .notNull()
    .references(() => organisations.id, { onDelete: 'cascade' }),
  projectId: integer('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  jobId: integer('job_id')
    .notNull()
    .references(() => processingJobs.id, { onDelete: 'cascade' }),
  dataSourceId: integer('data_source_id')
    .notNull()
    .references(() => dataSources.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  format: text('format').notNull(),
  filePath: text('file_path').notNull(),
  fileSize: integer('file_size').notNull(),
  recordCount: integer('record_count').notNull(),
  metadata: text('metadata'),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  projectIdx: index('datasets_project_id_idx').on(table.projectId),
  jobIdx: index('datasets_job_id_idx').on(table.jobId),
}));

export type Dataset = typeof datasets.$inferSelect;
export type NewDataset = typeof datasets.$inferInsert;

// ============================================================================
// OAUTH CONNECTIONS
// ============================================================================

export const oauthConnections = pgTable('oauth_connections', {
  id: serial('id').primaryKey(),
  organisationId: integer('organisation_id')
    .notNull()
    .references(() => organisations.id, { onDelete: 'cascade' }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  providerUserId: text('provider_user_id'),
  accountName: text('account_name'),
  encryptedAccessToken: text('encrypted_access_token').notNull(),
  encryptedRefreshToken: text('encrypted_refresh_token'),
  tokenExpiresAt: timestamp('token_expires_at'),
  scopes: text('scopes'),
  isActive: integer('is_active').notNull().default(1),
  lastSyncedAt: timestamp('last_synced_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  orgProviderUnique: unique('org_provider_unique').on(table.organisationId, table.provider),
}));

export type OAuthConnection = typeof oauthConnections.$inferSelect;
export type NewOAuthConnection = typeof oauthConnections.$inferInsert;

// ============================================================================
// AUDIT LOGS
// ============================================================================

export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  organisationId: integer('organisation_id')
    .notNull()
    .references(() => organisations.id, { onDelete: 'cascade' }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  entityType: text('entity_type'),
  entityId: integer('entity_id'),
  metadata: text('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  orgActionIdx: index('audit_logs_org_action_idx').on(table.organisationId, table.action),
  entityIdx: index('audit_logs_entity_idx').on(table.entityType, table.entityId),
  createdAtIdx: index('audit_logs_created_at_idx').on(table.createdAt),
}));

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;

// ============================================================================
// RELATIONS
// ============================================================================

export const organisationsRelations = relations(organisations, ({ many }) => ({
  users: many(users),
  projects: many(projects),
  teamMembers: many(teamMembers),
  oauthConnections: many(oauthConnections),
  invitations: many(invitations),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [users.organisationId],
    references: [organisations.id],
  }),
  projects: many(projects),
  teamMemberships: many(teamMembers),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [projects.organisationId],
    references: [organisations.id],
  }),
  user: one(users, {
    fields: [projects.userId],
    references: [users.id],
  }),
  dataSources: many(dataSources),
  schemaMappings: many(schemaMappings),
  processingJobs: many(processingJobs),
  datasets: many(datasets),
}));

export const dataSourcesRelations = relations(dataSources, ({ one, many }) => ({
  project: one(projects, {
    fields: [dataSources.projectId],
    references: [projects.id],
  }),
  schemaMappings: many(schemaMappings),
  processingJobs: many(processingJobs),
}));

export const schemaMappingsRelations = relations(schemaMappings, ({ one }) => ({
  project: one(projects, {
    fields: [schemaMappings.projectId],
    references: [projects.id],
  }),
  dataSource: one(dataSources, {
    fields: [schemaMappings.dataSourceId],
    references: [dataSources.id],
  }),
}));

export const processingJobsRelations = relations(processingJobs, ({ one, many }) => ({
  project: one(projects, {
    fields: [processingJobs.projectId],
    references: [projects.id],
  }),
  schemaMapping: one(schemaMappings, {
    fields: [processingJobs.schemaMappingId],
    references: [schemaMappings.id],
  }),
  dataSource: one(dataSources, {
    fields: [processingJobs.dataSourceId],
    references: [dataSources.id],
  }),
  datasets: many(datasets),
  logs: many(jobLogs),
}));

export const datasetsRelations = relations(datasets, ({ one }) => ({
  project: one(projects, {
    fields: [datasets.projectId],
    references: [projects.id],
  }),
  job: one(processingJobs, {
    fields: [datasets.jobId],
    references: [processingJobs.id],
  }),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  organisation: one(organisations, {
    fields: [invitations.organisationId],
    references: [organisations.id],
  }),
  inviter: one(users, {
    fields: [invitations.invitedBy],
    references: [users.id],
  }),
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, {
    fields: [passwordResetTokens.userId],
    references: [users.id],
  }),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  organisation: one(organisations, {
    fields: [teamMembers.organisationId],
    references: [organisations.id],
  }),
  user: one(users, {
    fields: [teamMembers.userId],
    references: [users.id],
  }),
}));
