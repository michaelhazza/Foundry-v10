/**
 * Database seed script for development
 */

import { db, closeConnection } from './index.js';
import { organisations, users, teamMembers } from './schema.js';
import { hashPassword } from '../lib/password.js';

async function seed() {
  console.log('Seeding database...');

  try {
    // Create test organisation
    const [org] = await db
      .insert(organisations)
      .values({
        name: 'Test Organisation',
        slug: 'test-org',
        subscriptionTier: 'pro',
        subscriptionStatus: 'active',
      })
      .returning();

    console.log('Created organisation:', org.name);

    // Create admin user
    const adminPassword = await hashPassword('AdminTest123!');
    const [admin] = await db
      .insert(users)
      .values({
        organisationId: org.id,
        email: 'admin@test.foundry.dev',
        passwordHash: adminPassword,
        name: 'Admin User',
        role: 'admin',
        status: 'active',
      })
      .returning();

    await db.insert(teamMembers).values({
      organisationId: org.id,
      userId: admin.id,
      role: 'admin',
    });

    console.log('Created admin user:', admin.email);

    // Create editor user
    const editorPassword = await hashPassword('EditorTest123!');
    const [editor] = await db
      .insert(users)
      .values({
        organisationId: org.id,
        email: 'editor@test.foundry.dev',
        passwordHash: editorPassword,
        name: 'Editor User',
        role: 'user',
        status: 'active',
        invitedBy: admin.id,
      })
      .returning();

    await db.insert(teamMembers).values({
      organisationId: org.id,
      userId: editor.id,
      role: 'editor',
    });

    console.log('Created editor user:', editor.email);

    // Create viewer user
    const viewerPassword = await hashPassword('ViewerTest123!');
    const [viewer] = await db
      .insert(users)
      .values({
        organisationId: org.id,
        email: 'viewer@test.foundry.dev',
        passwordHash: viewerPassword,
        name: 'Viewer User',
        role: 'user',
        status: 'active',
        invitedBy: admin.id,
      })
      .returning();

    await db.insert(teamMembers).values({
      organisationId: org.id,
      userId: viewer.id,
      role: 'viewer',
    });

    console.log('Created viewer user:', viewer.email);

    console.log('Seed completed successfully');
  } catch (error) {
    console.error('Seed failed:', error);
    throw error;
  } finally {
    await closeConnection();
  }
}

seed();
