/**
 * Project routes
 * @see API Contract Section 3.2
 */

import { Router } from 'express';
import { eq, and, isNull, desc, count, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  projects,
  dataSources,
  datasets,
  processingJobs,
} from '../db/schema.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validation.js';
import {
  createProjectSchema,
  updateProjectSchema,
} from '../../shared/validators.js';
import {
  sendSuccess,
  sendCreated,
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
 * GET /api/projects
 * List all projects for the current organisation
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = parsePaginationParams(req.query as any);
    const organisationId = req.user!.organisationId;

    // Get total count
    const [{ value: totalCount }] = await db
      .select({ value: count() })
      .from(projects)
      .where(
        and(
          eq(projects.organisationId, organisationId),
          isNull(projects.deletedAt)
        )
      );

    // Get projects with counts
    const projectList = await db.query.projects.findMany({
      where: and(
        eq(projects.organisationId, organisationId),
        isNull(projects.deletedAt)
      ),
      orderBy: desc(projects.updatedAt),
      limit,
      offset,
    });

    // Get counts for each project
    const projectsWithCounts = await Promise.all(
      projectList.map(async (project) => {
        const [sourceCount] = await db
          .select({ value: count() })
          .from(dataSources)
          .where(
            and(
              eq(dataSources.projectId, project.id),
              isNull(dataSources.deletedAt)
            )
          );

        const [datasetCount] = await db
          .select({ value: count() })
          .from(datasets)
          .where(
            and(
              eq(datasets.projectId, project.id),
              isNull(datasets.deletedAt)
            )
          );

        // Get last processed job
        const lastJob = await db.query.processingJobs.findFirst({
          where: and(
            eq(processingJobs.projectId, project.id),
            eq(processingJobs.status, 'completed')
          ),
          orderBy: desc(processingJobs.completedAt),
        });

        return {
          id: project.id,
          name: project.name,
          description: project.description,
          status: project.status,
          targetSchema: project.targetSchema,
          dataSourceCount: sourceCount.value,
          datasetCount: datasetCount.value,
          lastProcessedAt: lastJob?.completedAt?.toISOString() || null,
          createdAt: project.createdAt.toISOString(),
          updatedAt: project.updatedAt.toISOString(),
        };
      })
    );

    const pagination = calculatePagination(page, limit, totalCount);
    return sendPaginated(res, projectsWithCounts, pagination);
  })
);

/**
 * POST /api/projects
 * Create a new project
 */
router.post(
  '/',
  requireRole('admin', 'editor'),
  validateBody(createProjectSchema),
  asyncHandler(async (req, res) => {
    const { name, description, targetSchema } = req.body;
    const organisationId = req.user!.organisationId;
    const userId = req.user!.userId;

    const [project] = await db
      .insert(projects)
      .values({
        organisationId,
        userId,
        name,
        description,
        targetSchema: targetSchema || 'conversation',
        status: 'active',
      })
      .returning();

    return sendCreated(res, {
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        targetSchema: project.targetSchema,
        status: project.status,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
      },
    });
  })
);

/**
 * GET /api/projects/:projectId
 * Get a single project by ID
 */
router.get(
  '/:projectId',
  asyncHandler(async (req, res) => {
    const projectId = parseIntParam(req.params.projectId, 'projectId');
    const organisationId = req.user!.organisationId;

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

    // Get counts
    const [sourceCount] = await db
      .select({ value: count() })
      .from(dataSources)
      .where(
        and(
          eq(dataSources.projectId, project.id),
          isNull(dataSources.deletedAt)
        )
      );

    const [datasetCount] = await db
      .select({ value: count() })
      .from(datasets)
      .where(
        and(
          eq(datasets.projectId, project.id),
          isNull(datasets.deletedAt)
        )
      );

    return sendSuccess(res, {
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        targetSchema: project.targetSchema,
        status: project.status,
        dataSourceCount: sourceCount.value,
        datasetCount: datasetCount.value,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
      },
    });
  })
);

/**
 * PATCH /api/projects/:projectId
 * Update a project
 */
router.patch(
  '/:projectId',
  requireRole('admin', 'editor'),
  validateBody(updateProjectSchema),
  asyncHandler(async (req, res) => {
    const projectId = parseIntParam(req.params.projectId, 'projectId');
    const organisationId = req.user!.organisationId;
    const { name, description, status } = req.body;

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

    const updates: Partial<typeof projects.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (status !== undefined) updates.status = status;

    const [updatedProject] = await db
      .update(projects)
      .set(updates)
      .where(eq(projects.id, projectId))
      .returning();

    return sendSuccess(res, {
      project: {
        id: updatedProject.id,
        name: updatedProject.name,
        description: updatedProject.description,
        targetSchema: updatedProject.targetSchema,
        status: updatedProject.status,
        createdAt: updatedProject.createdAt.toISOString(),
        updatedAt: updatedProject.updatedAt.toISOString(),
      },
    });
  })
);

/**
 * DELETE /api/projects/:projectId
 * Soft delete a project
 */
router.delete(
  '/:projectId',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const projectId = parseIntParam(req.params.projectId, 'projectId');
    const organisationId = req.user!.organisationId;

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

    // Soft delete
    await db
      .update(projects)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(projects.id, projectId));

    return sendNoContent(res);
  })
);

/**
 * GET /api/projects/:projectId/summary
 * Get project summary statistics
 */
router.get(
  '/:projectId/summary',
  asyncHandler(async (req, res) => {
    const projectId = parseIntParam(req.params.projectId, 'projectId');
    const organisationId = req.user!.organisationId;

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

    // Get counts
    const [sourceCount] = await db
      .select({ value: count() })
      .from(dataSources)
      .where(
        and(
          eq(dataSources.projectId, projectId),
          isNull(dataSources.deletedAt)
        )
      );

    const [datasetCount] = await db
      .select({ value: count() })
      .from(datasets)
      .where(
        and(
          eq(datasets.projectId, projectId),
          isNull(datasets.deletedAt)
        )
      );

    // Get job counts
    const allJobs = await db.query.processingJobs.findMany({
      where: eq(processingJobs.projectId, projectId),
    });

    const successfulJobs = allJobs.filter((j) => j.status === 'completed');
    const failedJobs = allJobs.filter((j) => j.status === 'failed');

    // Get record counts
    const sourceRecords = await db
      .select({ total: sql<number>`COALESCE(SUM(record_count), 0)` })
      .from(dataSources)
      .where(
        and(
          eq(dataSources.projectId, projectId),
          isNull(dataSources.deletedAt)
        )
      );

    const outputRecords = await db
      .select({ total: sql<number>`COALESCE(SUM(record_count), 0)` })
      .from(datasets)
      .where(
        and(
          eq(datasets.projectId, projectId),
          isNull(datasets.deletedAt)
        )
      );

    // Get last processed
    const lastJob = await db.query.processingJobs.findFirst({
      where: and(
        eq(processingJobs.projectId, projectId),
        eq(processingJobs.status, 'completed')
      ),
      orderBy: desc(processingJobs.completedAt),
    });

    return sendSuccess(res, {
      summary: {
        projectId,
        dataSourceCount: sourceCount.value,
        recordCount: Number(sourceRecords[0]?.total) || 0,
        datasetCount: datasetCount.value,
        outputRecordCount: Number(outputRecords[0]?.total) || 0,
        jobCount: allJobs.length,
        successfulJobCount: successfulJobs.length,
        failedJobCount: failedJobs.length,
        lastProcessedAt: lastJob?.completedAt?.toISOString() || null,
      },
    });
  })
);

export default router;
