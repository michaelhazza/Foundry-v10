/**
 * Data source routes
 * @see API Contract Section 3.3
 */

import { Router } from 'express';
import { eq, and, isNull, desc, count } from 'drizzle-orm';
import multer from 'multer';
import path from 'path';
import { db } from '../db/index.js';
import {
  dataSources,
  projects,
  oauthConnections,
} from '../db/schema.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validation.js';
import {
  createApiDataSourceSchema,
  updateDataSourceSchema,
} from '../../shared/validators.js';
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

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, '/tmp/uploads');
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      'text/csv',
      'application/json',
      'application/xml',
      'text/xml',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    const allowedExtensions = ['.csv', '.json', '.xml', '.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new BadRequestError('Invalid file type. Allowed: CSV, JSON, XML, XLSX'));
    }
  },
});

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
 * GET /api/projects/:projectId/data-sources
 * List data sources for a project
 */
router.get(
  '/projects/:projectId/data-sources',
  asyncHandler(async (req, res) => {
    const projectId = parseIntParam(req.params.projectId, 'projectId');
    const organisationId = req.user!.organisationId;
    const { page, limit, offset } = parsePaginationParams(req.query as any);

    await verifyProjectAccess(projectId, organisationId);

    // Get total count
    const [{ value: totalCount }] = await db
      .select({ value: count() })
      .from(dataSources)
      .where(
        and(
          eq(dataSources.projectId, projectId),
          isNull(dataSources.deletedAt)
        )
      );

    // Get data sources
    const sources = await db.query.dataSources.findMany({
      where: and(
        eq(dataSources.projectId, projectId),
        isNull(dataSources.deletedAt)
      ),
      orderBy: desc(dataSources.createdAt),
      limit,
      offset,
    });

    const formattedSources = sources.map((source) => ({
      id: source.id,
      projectId: source.projectId,
      name: source.name,
      type: source.type,
      format: source.format,
      status: source.status,
      recordCount: source.recordCount,
      fileSize: source.fileSize,
      errorMessage: source.errorMessage,
      createdAt: source.createdAt.toISOString(),
      updatedAt: source.updatedAt.toISOString(),
    }));

    const pagination = calculatePagination(page, limit, totalCount);
    return sendPaginated(res, formattedSources, pagination);
  })
);

/**
 * POST /api/projects/:projectId/data-sources/upload
 * Upload a file as data source
 */
router.post(
  '/projects/:projectId/data-sources/upload',
  requireRole('admin', 'editor'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const projectId = parseIntParam(req.params.projectId, 'projectId');
    const organisationId = req.user!.organisationId;

    await verifyProjectAccess(projectId, organisationId);

    if (!req.file) {
      throw new BadRequestError('No file uploaded');
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    let format = 'unknown';
    if (ext === '.csv') format = 'csv';
    else if (ext === '.json') format = 'json';
    else if (ext === '.xml') format = 'xml';
    else if (['.xlsx', '.xls'].includes(ext)) format = 'xlsx';

    const [source] = await db
      .insert(dataSources)
      .values({
        organisationId,
        projectId,
        name: req.body.name || req.file.originalname,
        type: 'file',
        format,
        filePath: req.file.path,
        fileSize: req.file.size,
        status: 'pending',
        metadata: JSON.stringify({
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
        }),
      })
      .returning();

    // TODO: In production, upload to S3 and process file for record count
    // For now, mark as ready
    await db
      .update(dataSources)
      .set({ status: 'ready', updatedAt: new Date() })
      .where(eq(dataSources.id, source.id));

    return sendCreated(res, {
      dataSource: {
        id: source.id,
        projectId: source.projectId,
        name: source.name,
        type: source.type,
        format: source.format,
        status: 'ready',
        fileSize: source.fileSize,
        createdAt: source.createdAt.toISOString(),
      },
    });
  })
);

/**
 * POST /api/projects/:projectId/data-sources/api
 * Create API data source from OAuth connection
 */
router.post(
  '/projects/:projectId/data-sources/api',
  requireRole('admin', 'editor'),
  validateBody(createApiDataSourceSchema),
  asyncHandler(async (req, res) => {
    const projectId = parseIntParam(req.params.projectId, 'projectId');
    const organisationId = req.user!.organisationId;
    const { connectionId, name } = req.body;

    await verifyProjectAccess(projectId, organisationId);

    // Verify connection exists and belongs to org
    const connection = await db.query.oauthConnections.findFirst({
      where: and(
        eq(oauthConnections.id, connectionId),
        eq(oauthConnections.organisationId, organisationId),
        eq(oauthConnections.isActive, 1)
      ),
    });

    if (!connection) {
      throw new NotFoundError('OAuth connection not found');
    }

    const [source] = await db
      .insert(dataSources)
      .values({
        organisationId,
        projectId,
        name,
        type: 'api',
        format: 'json',
        status: 'pending',
        connectionId: connection.id,
        metadata: JSON.stringify({
          provider: connection.provider,
        }),
      })
      .returning();

    return sendCreated(res, {
      dataSource: {
        id: source.id,
        projectId: source.projectId,
        name: source.name,
        type: source.type,
        format: source.format,
        status: source.status,
        createdAt: source.createdAt.toISOString(),
      },
    });
  })
);

/**
 * GET /api/data-sources/:sourceId
 * Get a single data source
 */
router.get(
  '/:sourceId',
  asyncHandler(async (req, res) => {
    const sourceId = parseIntParam(req.params.sourceId, 'sourceId');
    const organisationId = req.user!.organisationId;

    const source = await db.query.dataSources.findFirst({
      where: and(
        eq(dataSources.id, sourceId),
        isNull(dataSources.deletedAt)
      ),
    });

    if (!source) {
      throw new NotFoundError('Data source not found');
    }

    if (source.organisationId !== organisationId) {
      throw new ForbiddenError('Access denied to this data source');
    }

    return sendSuccess(res, {
      dataSource: {
        id: source.id,
        projectId: source.projectId,
        name: source.name,
        type: source.type,
        format: source.format,
        status: source.status,
        recordCount: source.recordCount,
        fileSize: source.fileSize,
        errorMessage: source.errorMessage,
        metadata: source.metadata ? JSON.parse(source.metadata) : null,
        createdAt: source.createdAt.toISOString(),
        updatedAt: source.updatedAt.toISOString(),
      },
    });
  })
);

/**
 * GET /api/data-sources/:sourceId/preview
 * Preview first 100 rows of data source
 */
router.get(
  '/:sourceId/preview',
  asyncHandler(async (req, res) => {
    const sourceId = parseIntParam(req.params.sourceId, 'sourceId');
    const organisationId = req.user!.organisationId;

    const source = await db.query.dataSources.findFirst({
      where: and(
        eq(dataSources.id, sourceId),
        isNull(dataSources.deletedAt)
      ),
    });

    if (!source) {
      throw new NotFoundError('Data source not found');
    }

    if (source.organisationId !== organisationId) {
      throw new ForbiddenError('Access denied to this data source');
    }

    // TODO: Implement actual file parsing
    // For now, return mock preview data
    return sendSuccess(res, {
      preview: {
        columns: ['id', 'message', 'timestamp', 'sender'],
        rows: [
          { id: 1, message: 'Hello', timestamp: '2024-01-01', sender: 'user' },
          { id: 2, message: 'Hi there', timestamp: '2024-01-01', sender: 'agent' },
        ],
        totalRows: source.recordCount || 2,
      },
    });
  })
);

/**
 * PATCH /api/data-sources/:sourceId
 * Update a data source
 */
router.patch(
  '/:sourceId',
  requireRole('admin', 'editor'),
  validateBody(updateDataSourceSchema),
  asyncHandler(async (req, res) => {
    const sourceId = parseIntParam(req.params.sourceId, 'sourceId');
    const organisationId = req.user!.organisationId;
    const { name } = req.body;

    const source = await db.query.dataSources.findFirst({
      where: and(
        eq(dataSources.id, sourceId),
        isNull(dataSources.deletedAt)
      ),
    });

    if (!source) {
      throw new NotFoundError('Data source not found');
    }

    if (source.organisationId !== organisationId) {
      throw new ForbiddenError('Access denied to this data source');
    }

    const updates: Partial<typeof dataSources.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (name !== undefined) updates.name = name;

    const [updated] = await db
      .update(dataSources)
      .set(updates)
      .where(eq(dataSources.id, sourceId))
      .returning();

    return sendSuccess(res, {
      dataSource: {
        id: updated.id,
        projectId: updated.projectId,
        name: updated.name,
        type: updated.type,
        format: updated.format,
        status: updated.status,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  })
);

/**
 * DELETE /api/data-sources/:sourceId
 * Soft delete a data source
 */
router.delete(
  '/:sourceId',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const sourceId = parseIntParam(req.params.sourceId, 'sourceId');
    const organisationId = req.user!.organisationId;

    const source = await db.query.dataSources.findFirst({
      where: and(
        eq(dataSources.id, sourceId),
        isNull(dataSources.deletedAt)
      ),
    });

    if (!source) {
      throw new NotFoundError('Data source not found');
    }

    if (source.organisationId !== organisationId) {
      throw new ForbiddenError('Access denied to this data source');
    }

    await db
      .update(dataSources)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(dataSources.id, sourceId));

    return sendNoContent(res);
  })
);

export default router;
