import type { Db } from './index.js';
import type { ProjectRole } from './types.js';

export const SEED_PROJECT_NAME = 'Kumo 2025';

export const SEED_USERS: { email: string; displayName: string; role: ProjectRole }[] = [
  { email: 'ada@kumo.test', displayName: 'Ada', role: 'owner' },
  { email: 'ben@kumo.test', displayName: 'Ben', role: 'viewer' },
];

// Demo users and the project "Kumo 2025". Idempotent: running it twice changes nothing.
export async function seed(db: Db): Promise<{ projectId: string; userIds: Record<string, string> }> {
  return db.transaction().execute(async (trx) => {
    const userIds: Record<string, string> = {};
    for (const u of SEED_USERS) {
      const row = await trx
        .insertInto('meta.users')
        .values({ email: u.email, display_name: u.displayName })
        .onConflict((oc) => oc.column('email').doUpdateSet({ display_name: u.displayName }))
        .returning('id')
        .executeTakeFirstOrThrow();
      userIds[u.email] = row.id;
    }

    const owner = SEED_USERS[0]!;
    const existing = await trx
      .selectFrom('meta.projects')
      .select('id')
      .where('name', '=', SEED_PROJECT_NAME)
      .orderBy('created_at')
      .executeTakeFirst();
    const projectId =
      existing?.id ??
      (
        await trx
          .insertInto('meta.projects')
          .values({
            name: SEED_PROJECT_NAME,
            description: "Kumo's NetSuite 2025 exports",
            created_by: userIds[owner.email]!,
          })
          .returning('id')
          .executeTakeFirstOrThrow()
      ).id;

    for (const u of SEED_USERS) {
      await trx
        .insertInto('meta.project_members')
        .values({ project_id: projectId, user_id: userIds[u.email]!, role: u.role })
        .onConflict((oc) => oc.columns(['project_id', 'user_id']).doUpdateSet({ role: u.role }))
        .execute();
    }
    return { projectId, userIds };
  });
}
