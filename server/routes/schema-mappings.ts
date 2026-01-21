/**
 * Schema mapping routes
 * @see API Contract Section 3.4
 */

import { Router } from 'express';
import { eq, and, isNull, desc, count } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  schemaMappings,
  dataSources,
  projects,
} from '../db/schema.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validation.js';
import {
  createSchemaMappingSchema,
  updateSchemaMappingSchema,
} from '../../shared/validators.js';
import {
  sendSuccess,
  sendCreated,
  sendNoContent,
  sendPaginated,
} from '../lib/response.js';
import { NotFoundError, ForbiddenError, ConflictError } from '../errors/index.js';
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
 * GET /api/projects/:projectId/schema-mappings
 * List schema mappings for a project
 */
router.get(
  '/projects/:projectId/schema-mappings',
  asyncHandler(async (req, res) => {
    const projectId = parseIntParam(req.params.projectId, 'projectId');
    const organisationId = req.user!.organisationId;
    const { page, limit, offset } = parsePaginationParams(req.query as any);

    await verifyProjectAccess(projectId, organisationId);

    // Get total count
    const [{ value: totalCount }] = await db
      .select({ value: count() })
      .from(schemaMappings)
      .where(eq(schemaMappings.projectId, projectId));

    // Get mappings with data source info
    const mappings = await db.query.schemaMappings.findMany({
      where: eq(schemaMappings.projectId, projectId),
      with: { dataSource: true },
      orderBy: desc(schemaMappings.createdAt),
      limit,
      offset,
    });

    const formattedMappings = mappings.map((mapping) => ({
      id: mapping.id,
      projectId: mapping.projectId,
      dataSourceId: mapping.dataSourceId,
      dataSourceName: mapping.dataSource?.name || null,
      mappingConfig: JSON.parse(mapping.mappingConfig),
      piiConfig: JSON.parse(mapping.piiConfig),
      filterConfig: mapping.filterConfig ? JSON.parse(mapping.filterConfig) : null,
      isActive: mapping.isActive === 1,
      createdAt: mapping.createdAt.toISOString(),
      updatedAt: mapping.updatedAt.toISOString(),
    }));

    const pagination = calculatePagination(page, limit, totalCount);
    return sendPaginated(res, formattedMappings, pagination);
  })
);

/**
 * POST /api/projects/:projectId/schema-mappings
 * Create a new schema mapping
 */
router.post(
  '/projects/:projectId/schema-mappings',
  requireRole('admin', 'editor'),
  validateBody(createSchemaMappingSchema),
  asyncHandler(async (req, res) => {
    const projectId = parseIntParam(req.params.projectId, 'projectId');
    const organisationId = req.user!.organisationId;
    const { dataSourceId, mappingConfig, piiConfig, filterConfig } = req.body;

    await verifyProjectAccess(projectId, organisationId);

    // Verify data source exists and belongs to project
    const dataSource = await db.query.dataSources.findFirst({
      where: and(
        eq(dataSources.id, dataSourceId),
        eq(dataSources.projectId, projectId),
        isNull(dataSources.deletedAt)
      ),
    });

    if (!dataSource) {
      throw new NotFoundError('Data source not found in this project');
    }

    // Check for existing mapping
    const existingMapping = await db.query.schemaMappings.findFirst({
      where: eq(schemaMappings.dataSourceId, dataSourceId),
    });

    if (existingMapping) {
      throw new ConflictError('A mapping already exists for this data source');
    }

    const [mapping] = await db
      .insert(schemaMappings)
      .values({
        organisationId,
        projectId,
        dataSourceId,
        mappingConfig: JSON.stringify(mappingConfig),
        piiConfig: JSON.stringify(piiConfig),
        filterConfig: filterConfig ? JSON.stringify(filterConfig) : null,
        isActive: 1,
      })
      .returning();

    return sendCreated(res, {
      schemaMapping: {
        id: mapping.id,
        projectId: mapping.projectId,
        dataSourceId: mapping.dataSourceId,
        mappingConfig,
        piiConfig,
        filterConfig,
        isActive: true,
        createdAt: mapping.createdAt.toISOString(),
        updatedAt: mapping.updatedAt.toISOString(),
      },
    });
  })
);

/**
 * GET /api/schema-mappings/:mappingId
 * Get a single schema mapping
 */
router.get(
  '/:mappingId',
  asyncHandler(async (req, res) => {
    const mappingId = parseIntParam(req.params.mappingId, 'mappingId');
    const organisationId = req.user!.organisationId;

    const mapping = await db.query.schemaMappings.findFirst({
      where: eq(schemaMappings.id, mappingId),
      with: { dataSource: true },
    });

    if (!mapping) {
      throw new NotFoundError('Schema mapping not found');
    }

    if (mapping.organisationId !== organisationId) {
      throw new ForbiddenError('Access denied to this schema mapping');
    }

    return sendSuccess(res, {
      schemaMapping: {
        id: mapping.id,
        projectId: mapping.projectId,
        dataSourceId: mapping.dataSourceId,
        dataSourceName: mapping.dataSource?.name || null,
        mappingConfig: JSON.parse(mapping.mappingConfig),
        piiConfig: JSON.parse(mapping.piiConfig),
        filterConfig: mapping.filterConfig ? JSON.parse(mapping.filterConfig) : null,
        isActive: mapping.isActive === 1,
        createdAt: mapping.createdAt.toISOString(),
        updatedAt: mapping.updatedAt.toISOString(),
      },
    });
  })
);

/**
 * PATCH /api/schema-mappings/:mappingId
 * Update a schema mapping
 */
router.patch(
  '/:mappingId',
  requireRole('admin', 'editor'),
  validateBody(updateSchemaMappingSchema),
  asyncHandler(async (req, res) => {
    const mappingId = parseIntParam(req.params.mappingId, 'mappingId');
    const organisationId = req.user!.organisationId;
    const { mappingConfig, piiConfig, filterConfig, isActive } = req.body;

    const mapping = await db.query.schemaMappings.findFirst({
      where: eq(schemaMappings.id, mappingId),
    });

    if (!mapping) {
      throw new NotFoundError('Schema mapping not found');
    }

    if (mapping.organisationId !== organisationId) {
      throw new ForbiddenError('Access denied to this schema mapping');
    }

    const updates: Partial<typeof schemaMappings.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (mappingConfig !== undefined) {
      updates.mappingConfig = JSON.stringify(mappingConfig);
    }
    if (piiConfig !== undefined) {
      updates.piiConfig = JSON.stringify(piiConfig);
    }
    if (filterConfig !== undefined) {
      updates.filterConfig = JSON.stringify(filterConfig);
    }
    if (isActive !== undefined) {
      updates.isActive = isActive ? 1 : 0;
    }

    const [updated] = await db
      .update(schemaMappings)
      .set(updates)
      .where(eq(schemaMappings.id, mappingId))
      .returning();

    return sendSuccess(res, {
      schemaMapping: {
        id: updated.id,
        projectId: updated.projectId,
        dataSourceId: updated.dataSourceId,
        mappingConfig: JSON.parse(updated.mappingConfig),
        piiConfig: JSON.parse(updated.piiConfig),
        filterConfig: updated.filterConfig ? JSON.parse(updated.filterConfig) : null,
        isActive: updated.isActive === 1,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  })
);

/**
 * DELETE /api/schema-mappings/:mappingId
 * Delete a schema mapping
 */
router.delete(
  '/:mappingId',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const mappingId = parseIntParam(req.params.mappingId, 'mappingId');
    const organisationId = req.user!.organisationId;

    const mapping = await db.query.schemaMappings.findFirst({
      where: eq(schemaMappings.id, mappingId),
    });

    if (!mapping) {
      throw new NotFoundError('Schema mapping not found');
    }

    if (mapping.organisationId !== organisationId) {
      throw new ForbiddenError('Access denied to this schema mapping');
    }

    await db.delete(schemaMappings).where(eq(schemaMappings.id, mappingId));

    return sendNoContent(res);
  })
);

export default router;
