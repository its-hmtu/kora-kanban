import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../src/generated/prisma/client';
import { getPrisma } from './test-app';

/** Creates a verified user with a unique realistic email. Extend with other entities per story. */
export async function createUser(overrides: Partial<Prisma.UserUncheckedCreateInput> = {}) {
  const prisma = await getPrisma();
  const tag = randomUUID().slice(0, 8);
  const data: Prisma.UserUncheckedCreateInput = {
    email: `user.${tag}@example.com`,
    name: `Test User ${tag}`,
    emailVerifiedAt: new Date(),
    ...overrides,
  };
  return prisma.client.user.create({ data });
}
