/**
 * Processing job routes
 * @see API Contract Section 3.5
 */

import { Router } from 'express';
import { eq, and, isNull, desc, count } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  processingJobs,
  schemaMappings,
  dataSources,
  projects,
  jobLogs,
} from '../db/schema.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { processingLimiter } from '../middleware/rate-limit.js';
import { validateBody } from '../middleware/validation.js';
import { createJobSchema } from '../../shared/validators.js';
import {
  sendSuccess,
  sendCreated,
  sendNoContent,
  sendPaginated,
} from '../lib/response.js';
import { NotFoundError, ForbiddenError, BadRequestError } from '../errors/index.js';
import {
  parseIntParam,
  parsePaginationParams,
  calculatePagination,
} from '../lib/validation.js';

const router = Router();

// Apply authentication to all routes
router.use(requireAuth);

/**
 * Helper to verify project access
 */
async function verifyProjectAccess(projectId: number, organisationId: number) {
  const project = await db.query.projects.findFirst({
    where: and(
      eq(projects.id, projectId),
      isNull(projects.deletedAt)
    ),
  });

  if (!project) {
    throw new NotFoundError('Project not found');
  }

  if (project.organisationId !== organisationId) {
    throw new ForbiddenError('Access denied to this project');
  }

  return project;
}

/**
 * GET /api/projects/:projectId/jobs
 * List processing jobs for a project
 */
router.get(
  '/projects/:projectId/jobs',
  asyncHandler(async (req, res) => {
    const projectId = parseIntParam(req.params.projectId, 'projectId');
    const organisationId = req.user!.organisationId;
    const { page, limit, offset } = parsePaginationParams(req.query as any);
    const statusFilter = req.query.status as string | undefined;

    await verifyProjectAccess(projectId, organisationId);

    // Build where clause
    let whereClause = eq(processingJobs.projectId, projectId);
    if (statusFilter) {
      whereClause = and(
        whereClause,
        eq(processingJobs.status, statusFilter)
      )!;
    }

    // Get total count
    const [{ value: totalCount }] = await db
      .select({ value: count() })
      .from(processingJobs)
      .where(whereClause);

    // Get jobs
    const jobs = await db.query.processingJobs.findMany({
      where: whereClause,
      with: { dataSource: true, schemaMapping: true },
      orderBy: desc(processingJobs.createdAt),
      limit,
      offset,
    });

    const formattedJobs = jobs.map((job) => ({
      id: job.id,
      projectId: job.projectId,
      dataSourceId: job.dataSourceId,
      dataSourceName: job.dataSource?.name || null,
      schemaMappingId: job.schemaMappingId,
      status: job.status,
      outputFormat: job.outputFormat,
      outputName: job.outputName,
      inputRecordCount: job.inputRecordCount,
      outputRecordCount: job.outputRecordCount,
      piiDetectedCount: job.piiDetectedCount,
      progress: job.progress,
      currentStage: job.currentStage,
      errorMessage: job.errorMessage,
      startedAt: job.startedAt?.toISOString() || null,
      completedAt: job.completedAt?.toISOString() || null,
      createdAt: job.createdAt.toISOString(),
    }));

    const pagination = calculatePagination(page, limit, totalCount);
    return sendPaginated(res, formattedJobs, pagination);
  })
);

/**
 * POST /api/projects/:projectId/jobs
 * Create a new processing job
 */
router.post(
  '/projects/:projectId/jobs',
  requireRole('admin', 'editor'),
  processingLimiter,
  validateBody(createJobSchema),
  asyncHandler(async (req, res) => {
    const projectId = parseIntParam(req.params.projectId, 'projectId');
    const organisationId = req.user!.organisationId;
    const { schemaMappingId, outputFormat, outputName } = req.body;

    await verifyProjectAccess(projectId, organisationId);

    // Verify schema mapping exists and belongs to project
    const mapping = await db.query.schemaMappings.findFirst({
      where: and(
        eq(schemaMappings.id, schemaMappingId),
        eq(schemaMappings.projectId, projectId)
      ),
      with: { dataSource: true },
    });

    if (!mapping) {
      throw new NotFoundError('Schema mapping not found in this project');
    }

    if (mapping.isActive !== 1) {
      throw new BadRequestError('Schema mapping is not active');
    }

    const dataSource = mapping.dataSource;
    if (!dataSource || dataSource.status !== 'ready') {
      throw new BadRequestError('Data source is not ready for processing');
    }

    // Create job
    const [job] = await db
      .insert(processingJobs)
      .values({
        organisationId,
        projectId,
        schemaMappingId: mapping.id,
        dataSourceId: dataSource.id,
        status: 'pending',
        outputFormat,
        outputName: outputName || `${dataSource.name}-output`,
        inputRecordCount: dataSource.recordCount || 0,
        progress: 0,
      })
      .returning();

    // Add initial log entry
    await db.insert(jobLogs).values({
      jobId: job.id,
      level: 'info',
      message: 'Job created and queued for processing',
    });

    // TODO: In production, queue job for background processing
    // For now, simulate immediate processing start
    await db
      .update(processingJobs)
      .set({ status: 'processing', startedAt: new Date(), currentStage: 'initializing' })
      .where(eq(processingJobs.id, job.id));

    return sendCreated(res, {
      job: {
        id: job.id,
        projectId: job.projectId,
        dataSourceId: job.dataSourceId,
        schemaMappingId: job.schemaMappingId,
        status: 'processing',
        outputFormat: job.outputFormat,
        outputName: job.outputName,
        progress: 0,
        currentStage: 'initializing',
        createdAt: job.createdAt.toISOString(),
      },
    });
  })
);

/**
 * GET /api/jobs/:jobId
 * Get a single job
 */
router.get(
  '/:jobId',
  asyncHandler(async (req, res) => {
    const jobId = parseIntParam(req.params.jobId, 'jobId');
    const organisationId = req.user!.organisationId;

    const job = await db.query.processingJobs.findFirst({
      where: eq(processingJobs.id, jobId),
      with: { dataSource: true, schemaMapping: true },
    });

    if (!job) {
      throw new NotFoundError('Job not found');
    }

    if (job.organisationId !== organisationId) {
      throw new ForbiddenError('Access denied to this job');
    }

    return sendSuccess(res, {
      job: {
        id: job.id,
        projectId: job.projectId,
        dataSourceId: job.dataSourceId,
        dataSourceName: job.dataSource?.name || null,
        schemaMappingId: job.schemaMappingId,
        status: job.status,
        outputFormat: job.outputFormat,
        outputName: job.outputName,
        inputRecordCount: job.inputRecordCount,
        outputRecordCount: job.outputRecordCount,
        piiDetectedCount: job.piiDetectedCount,
        progress: job.progress,
        currentStage: job.currentStage,
        errorMessage: job.errorMessage,
        startedAt: job.startedAt?.toISOString() || null,
        completedAt: job.completedAt?.toISOString() || null,
        createdAt: job.createdAt.toISOString(),
      },
    });
  })
);

/**
 * GET /api/jobs/:jobId/progress
 * Get job progress (for polling)
 */
router.get(
  '/:jobId/progress',
  asyncHandler(async (req, res) => {
    const jobId = parseIntParam(req.params.jobId, 'jobId');
    const organisationId = req.user!.organisationId;

    const job = await db.query.processingJobs.findFirst({
      where: eq(processingJobs.id, jobId),
    });

    if (!job) {
      throw new NotFoundError('Job not found');
    }

    if (job.organisationId !== organisationId) {
      throw new ForbiddenError('Access denied to this job');
    }

    // Calculate estimated time remaining
    let estimatedTimeRemaining: number | null = null;
    if (job.status === 'processing' && job.progress > 0 && job.startedAt) {
      const elapsed = Date.now() - job.startedAt.getTime();
      const estimatedTotal = (elapsed / job.progress) * 100;
      estimatedTimeRemaining = Math.max(0, Math.round((estimatedTotal - elapsed) / 1000));
    }

    return sendSuccess(res, {
      progress: {
        jobId: job.id,
        status: job.status,
        currentStage: job.currentStage,
        overallProgress: job.progress,
        processedRecords: Math.round(
          (job.inputRecordCount * job.progress) / 100
        ),
        totalRecords: job.inputRecordCount,
        estimatedTimeRemaining,
        piiDetectedCount: job.piiDetectedCount,
      },
    });
  })
);

/**
 * GET /api/jobs/:jobId/logs
 * Get job logs
 */
router.get(
  '/:jobId/logs',
  asyncHandler(async (req, res) => {
    const jobId = parseIntParam(req.params.jobId, 'jobId');
    const organisationId = req.user!.organisationId;
    const { page, limit, offset } = parsePaginationParams(req.query as any);

    const job = await db.query.processingJobs.findFirst({
      where: eq(processingJobs.id, jobId),
    });

    if (!job) {
      throw new NotFoundError('Job not found');
    }

    if (job.organisationId !== organisationId) {
      throw new ForbiddenError('Access denied to this job');
    }

    // Get total count
    const [{ value: totalCount }] = await db
      .select({ value: count() })
      .from(jobLogs)
      .where(eq(jobLogs.jobId, jobId));

    // Get logs
    const logs = await db.query.jobLogs.findMany({
      where: eq(jobLogs.jobId, jobId),
      orderBy: desc(jobLogs.createdAt),
      limit,
      offset,
    });

    const formattedLogs = logs.map((log) => ({
      id: log.id,
      level: log.level,
      message: log.message,
      details: log.details ? JSON.parse(log.details) : null,
      timestamp: log.createdAt.toISOString(),
    }));

    const pagination = calculatePagination(page, limit, totalCount);
    return sendPaginated(res, formattedLogs, pagination);
  })
);

/**
 * POST /api/jobs/:jobId/cancel
 * Cancel a running job
 */
router.post(
  '/:jobId/cancel',
  requireRole('admin', 'editor'),
  asyncHandler(async (req, res) => {
    const jobId = parseIntParam(req.params.jobId, 'jobId');
    const organisationId = req.user!.organisationId;

    const job = await db.query.processingJobs.findFirst({
      where: eq(processingJobs.id, jobId),
    });

    if (!job) {
      throw new NotFoundError('Job not found');
    }

    if (job.organisationId !== organisationId) {
      throw new ForbiddenError('Access denied to this job');
    }

    if (!['pending', 'processing'].includes(job.status)) {
      throw new BadRequestError('Only pending or processing jobs can be cancelled');
    }

    await db
      .update(processingJobs)
      .set({
        status: 'cancelled',
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(processingJobs.id, jobId));

    await db.insert(jobLogs).values({
      jobId,
      level: 'info',
      message: 'Job cancelled by user',
    });

    return sendSuccess(res, { message: 'Job cancelled successfully' });
  })
);

/**
 * POST /api/jobs/:jobId/retry
 * Retry a failed job
 */
router.post(
  '/:jobId/retry',
  requireRole('admin', 'editor'),
  processingLimiter,
  asyncHandler(async (req, res) => {
    const jobId = parseIntParam(req.params.jobId, 'jobId');
    const organisationId = req.user!.organisationId;

    const job = await db.query.processingJobs.findFirst({
      where: eq(processingJobs.id, jobId),
    });

    if (!job) {
      throw new NotFoundError('Job not found');
    }

    if (job.organisationId !== organisationId) {
      throw new ForbiddenError('Access denied to this job');
    }

    if (job.status !== 'failed') {
      throw new BadRequestError('Only failed jobs can be retried');
    }

    // Reset job status
    await db
      .update(processingJobs)
      .set({
        status: 'pending',
        progress: 0,
        currentStage: null,
        errorMessage: null,
        outputRecordCount: null,
        piiDetectedCount: null,
        startedAt: null,
        completedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(processingJobs.id, jobId));

    await db.insert(jobLogs).values({
      jobId,
      level: 'info',
      message: 'Job queued for retry',
    });

    // Start processing
    await db
      .update(processingJobs)
      .set({ status: 'processing', startedAt: new Date(), currentStage: 'initializing' })
      .where(eq(processingJobs.id, jobId));

    return sendSuccess(res, { message: 'Job queued for retry' });
  })
);

export default router;
