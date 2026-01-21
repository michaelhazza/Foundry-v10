/**
 * Dataset routes
 * @see API Contract Section 3.6
 */

import { Router } from 'express';
import { eq, and, isNull, desc, count } from 'drizzle-orm';
import { db } from '../db/index.js';
import { datasets, projects } from '../db/schema.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  sendSuccess,
  sendNoContent,
  sendPaginated,
} from '../lib/response.js';
import { NotFoundError, ForbiddenError } from '../errors/index.js';
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
 * GET /api/projects/:projectId/datasets
 * List datasets for a project
 */
router.get(
  '/projects/:projectId/datasets',
  asyncHandler(async (req, res) => {
    const projectId = parseIntParam(req.params.projectId, 'projectId');
    const organisationId = req.user!.organisationId;
    const { page, limit, offset } = parsePaginationParams(req.query as any);

    await verifyProjectAccess(projectId, organisationId);

    // Get total count
    const [{ value: totalCount }] = await db
      .select({ value: count() })
      .from(datasets)
      .where(
        and(
          eq(datasets.projectId, projectId),
          isNull(datasets.deletedAt)
        )
      );

    // Get datasets
    const datasetList = await db.query.datasets.findMany({
      where: and(
        eq(datasets.projectId, projectId),
        isNull(datasets.deletedAt)
      ),
      with: { job: true },
      orderBy: desc(datasets.createdAt),
      limit,
      offset,
    });

    const formattedDatasets = datasetList.map((dataset) => ({
      id: dataset.id,
      projectId: dataset.projectId,
      jobId: dataset.jobId,
      dataSourceId: dataset.dataSourceId,
      name: dataset.name,
      format: dataset.format,
      recordCount: dataset.recordCount,
      fileSize: dataset.fileSize,
      metadata: dataset.metadata ? JSON.parse(dataset.metadata) : null,
      createdAt: dataset.createdAt.toISOString(),
    }));

    const pagination = calculatePagination(page, limit, totalCount);
    return sendPaginated(res, formattedDatasets, pagination);
  })
);

/**
 * GET /api/datasets/:datasetId
 * Get a single dataset
 */
router.get(
  '/:datasetId',
  asyncHandler(async (req, res) => {
    const datasetId = parseIntParam(req.params.datasetId, 'datasetId');
    const organisationId = req.user!.organisationId;

    const dataset = await db.query.datasets.findFirst({
      where: and(
        eq(datasets.id, datasetId),
        isNull(datasets.deletedAt)
      ),
      with: { job: true },
    });

    if (!dataset) {
      throw new NotFoundError('Dataset not found');
    }

    if (dataset.organisationId !== organisationId) {
      throw new ForbiddenError('Access denied to this dataset');
    }

    return sendSuccess(res, {
      dataset: {
        id: dataset.id,
        projectId: dataset.projectId,
        jobId: dataset.jobId,
        dataSourceId: dataset.dataSourceId,
        name: dataset.name,
        format: dataset.format,
        recordCount: dataset.recordCount,
        fileSize: dataset.fileSize,
        metadata: dataset.metadata ? JSON.parse(dataset.metadata) : null,
        createdAt: dataset.createdAt.toISOString(),
        updatedAt: dataset.updatedAt.toISOString(),
      },
    });
  })
);

/**
 * GET /api/datasets/:datasetId/preview
 * Preview first 100 rows of dataset
 */
router.get(
  '/:datasetId/preview',
  asyncHandler(async (req, res) => {
    const datasetId = parseIntParam(req.params.datasetId, 'datasetId');
    const organisationId = req.user!.organisationId;

    const dataset = await db.query.datasets.findFirst({
      where: and(
        eq(datasets.id, datasetId),
        isNull(datasets.deletedAt)
      ),
    });

    if (!dataset) {
      throw new NotFoundError('Dataset not found');
    }

    if (dataset.organisationId !== organisationId) {
      throw new ForbiddenError('Access denied to this dataset');
    }

    // TODO: Implement actual file reading from S3/storage
    // For now, return mock preview data
    return sendSuccess(res, {
      preview: {
        columns: ['message_id', 'role', 'message_text', 'timestamp', 'thread_id'],
        rows: [
          {
            message_id: '1',
            role: 'user',
            message_text: 'Hello, I need help',
            timestamp: '2024-01-01T10:00:00Z',
            thread_id: 'thread-001',
          },
          {
            message_id: '2',
            role: 'agent',
            message_text: 'Hi! I\'d be happy to help.',
            timestamp: '2024-01-01T10:01:00Z',
            thread_id: 'thread-001',
          },
        ],
        totalRows: dataset.recordCount,
      },
    });
  })
);

/**
 * GET /api/datasets/:datasetId/download
 * Download dataset file
 */
router.get(
  '/:datasetId/download',
  requireRole('admin', 'editor'),
  asyncHandler(async (req, res) => {
    const datasetId = parseIntParam(req.params.datasetId, 'datasetId');
    const organisationId = req.user!.organisationId;
    const formatParam = req.query.format as string | undefined;

    const dataset = await db.query.datasets.findFirst({
      where: and(
        eq(datasets.id, datasetId),
        isNull(datasets.deletedAt)
      ),
    });

    if (!dataset) {
      throw new NotFoundError('Dataset not found');
    }

    if (dataset.organisationId !== organisationId) {
      throw new ForbiddenError('Access denied to this dataset');
    }

    // In production, generate presigned S3 URL or stream file
    // For now, return download metadata
    const format = formatParam || dataset.format;

    return sendSuccess(res, {
      download: {
        datasetId: dataset.id,
        name: dataset.name,
        format,
        fileSize: dataset.fileSize,
        // In production: downloadUrl would be a presigned S3 URL
        message: 'Download would be available via presigned URL in production',
      },
    });
  })
);

/**
 * DELETE /api/datasets/:datasetId
 * Soft delete a dataset
 */
router.delete(
  '/:datasetId',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const datasetId = parseIntParam(req.params.datasetId, 'datasetId');
    const organisationId = req.user!.organisationId;

    const dataset = await db.query.datasets.findFirst({
      where: and(
        eq(datasets.id, datasetId),
        isNull(datasets.deletedAt)
      ),
    });

    if (!dataset) {
      throw new NotFoundError('Dataset not found');
    }

    if (dataset.organisationId !== organisationId) {
      throw new ForbiddenError('Access denied to this dataset');
    }

    await db
      .update(datasets)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(datasets.id, datasetId));

    return sendNoContent(res);
  })
);

export default router;
