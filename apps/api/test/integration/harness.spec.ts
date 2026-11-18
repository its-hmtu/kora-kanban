import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { uuid } from '@kora/shared';
import { createUser } from '../setup/factories';
import { closeHarness, getPrisma, getRedis, resetDb } from '../setup/test-app';

const V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('integration harness', () => {
  beforeEach(resetDb);
  afterAll(closeHarness);

  it('createUser persists a user visible through the real client', async () => {
    const user = await createUser({ name: 'Ada' });
    const prisma = await getPrisma();
    const found = await prisma.client.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(found.name).toBe('Ada');
    expect(found.email).toMatch(/@example\.com$/);
  });

  it('createUser generates unique emails', async () => {
    const [a, b] = await Promise.all([createUser(), createUser()]);
    expect(a.email).not.toBe(b.email);
  });

  it('resetDb truncates tables and flushes redis', async () => {
    const prisma = await getPrisma();
    const redis = await getRedis();
    await createUser();
    await redis.set('k', 'v');
    expect(await redis.get('k')).toBe('v');
    expect(await prisma.client.user.count()).toBe(1);

    await resetDb();

    expect(await prisma.client.user.count()).toBe(0);
    expect(await redis.get('k')).toBeNull();
  });

  it('email uniqueness is case-insensitive (citext)', async () => {
    await createUser({ email: 'Grace@Example.com' });
    await expect(createUser({ email: 'grace@example.COM' })).rejects.toMatchObject({
      code: 'P2002',
    });
    const prisma = await getPrisma();
    const found = await prisma.client.user.findUnique({ where: { email: 'GRACE@example.com' } });
    expect(found?.email).toBe('Grace@Example.com');
  });
});

describe('uuid v7 ids via the real client', () => {
  beforeEach(resetDb);
  afterAll(closeHarness);

  it('create returns a uuid v7 id', async () => {
    const user = await createUser();
    expect(user.id).toMatch(V7);
    expect(uuid.safeParse(user.id).success).toBe(true);
  });

  it('upsert assigns a uuid v7 id on the create branch and keeps it on update', async () => {
    const prisma = await getPrisma();
    const created = await prisma.client.user.upsert({
      where: { email: 'u@example.com' },
      update: { name: 'Second' },
      create: { email: 'u@example.com', name: 'First' },
    });
    expect(created.id).toMatch(V7);
    const updated = await prisma.client.user.upsert({
      where: { email: 'u@example.com' },
      update: { name: 'Second' },
      create: { email: 'u@example.com', name: 'First' },
    });
    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe('Second');
  });

  it('nested create assigns a uuid v7 id to the child row', async () => {
    const prisma = await getPrisma();
    const user = await prisma.client.user.create({
      data: {
        email: 'n@example.com',
        name: 'Nested',
        sessions: {
          create: [{ tokenHash: 'h1', expiresAt: new Date(Date.now() + 60_000) }],
        },
      },
      include: { sessions: true },
    });
    expect(user.id).toMatch(V7);
    expect(user.sessions).toHaveLength(1);
    expect(user.sessions[0]!.id).toMatch(V7);
  });
});
