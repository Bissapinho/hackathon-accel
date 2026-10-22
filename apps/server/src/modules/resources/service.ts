import type { Db } from '../../db/index.js';
import type { ProjectRole } from '../../db/types.js';
import { ApiError, notFound } from '../../errors.js';
import type { ProjectSummary, ProjectWithMembers, User } from './schemas.js';

export type Access = 'read' | 'write';

export function createResourcesService(db: Db) {
  async function getUser(userId: string): Promise<User | null> {
    const row = await db
      .selectFrom('meta.users')
      .select(['id', 'email', 'display_name'])
      .where('id', '=', userId)
      .executeTakeFirst();
    return row ? { id: row.id, email: row.email, displayName: row.display_name } : null;
  }

  async function getUserByEmail(email: string): Promise<User | null> {
    const row = await db
      .selectFrom('meta.users')
      .select(['id', 'email', 'display_name'])
      .where('email', '=', email.toLowerCase())
      .executeTakeFirst();
    return row ? { id: row.id, email: row.email, displayName: row.display_name } : null;
  }

  async function listUsers(): Promise<User[]> {
    const rows = await db.selectFrom('meta.users').select(['id', 'email', 'display_name']).orderBy('email').execute();
    return rows.map((r) => ({ id: r.id, email: r.email, displayName: r.display_name }));
  }

  async function listProjectsForUser(userId: string): Promise<ProjectSummary[]> {
    const rows = await db
      .selectFrom('meta.project_members as m')
      .innerJoin('meta.projects as p', 'p.id', 'm.project_id')
      .select(['p.id', 'p.name', 'p.description', 'm.role'])
      .where('m.user_id', '=', userId)
      .orderBy('p.created_at')
      .execute();
    return rows.map((r) => ({ id: r.id, name: r.name, description: r.description, role: r.role }));
  }

  async function getRole(projectId: string, userId: string): Promise<ProjectRole | null> {
    const row = await db
      .selectFrom('meta.project_members')
      .select('role')
      .where('project_id', '=', projectId)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return row?.role ?? null;
  }

  // The project role guard (04-api intro): viewer reads; editor and owner write.
  async function requireAccess(projectId: string, userId: string, access: Access): Promise<ProjectRole> {
    const role = await getRole(projectId, userId);
    if (!role) {
      throw notFound('This project', "it doesn't exist or you are not a member of it", 'Ask the project owner to add you.');
    }
    if (access === 'write' && role === 'viewer') {
      throw new ApiError(403, 'FORBIDDEN', 'You can look at this project but not change it.', {
        hint: 'Ask the project owner to make you an editor.',
      });
    }
    return role;
  }

  async function getProject(projectId: string, userId: string): Promise<ProjectWithMembers> {
    const role = await requireAccess(projectId, userId, 'read');
    const project = await db
      .selectFrom('meta.projects')
      .select(['id', 'name', 'description', 'created_at'])
      .where('id', '=', projectId)
      .executeTakeFirstOrThrow();
    const members = await db
      .selectFrom('meta.project_members as m')
      .innerJoin('meta.users as u', 'u.id', 'm.user_id')
      .select(['u.id', 'u.email', 'u.display_name', 'm.role'])
      .where('m.project_id', '=', projectId)
      .orderBy('u.email')
      .execute();
    return {
      id: project.id,
      name: project.name,
      description: project.description,
      role,
      createdAt: project.created_at.toISOString(),
      members: members.map((m) => ({ user: { id: m.id, email: m.email, displayName: m.display_name }, role: m.role })),
    };
  }

  return { getUser, getUserByEmail, listUsers, listProjectsForUser, getRole, requireAccess, getProject };
}

export type ResourcesService = ReturnType<typeof createResourcesService>;
