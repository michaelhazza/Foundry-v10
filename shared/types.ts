/**
 * Shared TypeScript types
 */

// User response type (excludes passwordHash)
export interface UserResponse {
  id: number;
  email: string;
  name: string | null;
  role: string;
  organisation: {
    id: number;
    name: string;
    slug: string;
  };
  createdAt: string;
  lastLoginAt: string | null;
}

// Auth response
export interface AuthResponse {
  token: string;
  user: UserResponse;
}

// Pagination
export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalPages: number;
  totalCount: number;
}

// Project list item
export interface ProjectListItem {
  id: number;
  name: string;
  description: string | null;
  status: string;
  dataSourceCount: number;
  datasetCount: number;
  lastProcessedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// Data source list item
export interface DataSourceListItem {
  id: number;
  projectId: number;
  name: string;
  type: string;
  format: string | null;
  status: string;
  recordCount: number | null;
  fileSize: number | null;
  createdAt: string;
  updatedAt: string;
}

// Job list item
export interface JobListItem {
  id: number;
  projectId: number;
  status: string;
  inputRecordCount: number;
  outputRecordCount: number | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

// Job progress
export interface JobProgress {
  jobId: number;
  status: string;
  currentStage: string | null;
  stageProgress: number | null;
  overallProgress: number;
  processedRecords: number;
  totalRecords: number;
  estimatedTimeRemaining: number | null;
}

// Dataset list item
export interface DatasetListItem {
  id: number;
  projectId: number;
  jobId: number;
  name: string;
  format: string;
  recordCount: number;
  fileSize: number;
  createdAt: string;
}

// OAuth connection
export interface OAuthConnectionResponse {
  id: number;
  organisationId: number;
  provider: string;
  accountName: string | null;
  isActive: boolean;
  lastSyncedAt: string | null;
  createdAt: string;
}

// Organisation member
export interface MemberResponse {
  id: number;
  email: string;
  name: string | null;
  role: string;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
}

// Invitation response
export interface InvitationResponse {
  email: string;
  role: string;
  inviteToken: string;
  expiresAt: string;
}

// Preview data
export interface PreviewData {
  columns: string[];
  rows: Record<string, any>[];
  totalRows: number;
}

// Project summary
export interface ProjectSummary {
  projectId: number;
  dataSourceCount: number;
  recordCount: number;
  datasetCount: number;
  outputRecordCount: number;
  jobCount: number;
  successfulJobCount: number;
  failedJobCount: number;
  lastProcessedAt: string | null;
}
