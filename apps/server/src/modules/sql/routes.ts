import type { FastifyInstance } from 'fastify';
import { requireProject } from '../../auth.js';
import { projectParamsSchema } from '../resources/schemas.js';
import type { ResourcesService } from '../resources/service.js';
import { sqlRequestSchema } from './schemas.js';
import type { SqlService } from './service.js';

// POST /api/projects/:pid/sql (04-api §1 Objects): {sql} → SqlResponse. Read-only role, 5 s, 500 rows,
// only SELECT / WITH. Any project member may run it (it can't write).
export function registerSqlRoutes(app: FastifyInstance, deps: { sql: SqlService; resources: ResourcesService }): void {
  app.post('/api/projects/:pid/sql', async (req) => {
    const { pid } = projectParamsSchema.parse(req.params);
    await requireProject(req, deps.resources, pid, 'read');
    return deps.sql.run(pid, sqlRequestSchema.parse(req.body));
  });
}
