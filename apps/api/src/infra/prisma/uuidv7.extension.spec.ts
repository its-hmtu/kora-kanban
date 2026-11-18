import { describe, expect, it, vi } from 'vitest';
import { uuid } from '@kora/shared';
import { uuidv7Query } from './uuidv7.extension';

const V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuidv7Query', () => {
  it('create: assigns a uuid v7 id when none is given', async () => {
    const query = vi.fn().mockResolvedValue({});
    await uuidv7Query.create({ args: { data: { name: 'Ada' } }, query });
    const { data } = query.mock.calls[0]![0];
    expect(data.id).toMatch(V7);
    expect(uuid.safeParse(data.id).success).toBe(true);
    expect(data.name).toBe('Ada');
  });

  it('create: respects an explicit id', async () => {
    const query = vi.fn().mockResolvedValue({});
    await uuidv7Query.create({ args: { data: { id: 'explicit', name: 'Ada' } }, query });
    expect(query.mock.calls[0]![0].data.id).toBe('explicit');
  });

  it('createMany: assigns distinct ids to rows lacking one and keeps explicit ones', async () => {
    const query = vi.fn().mockResolvedValue({ count: 3 });
    await uuidv7Query.createMany({
      args: { data: [{ name: 'a' }, { id: 'keep', name: 'b' }, { name: 'c' }] },
      query,
    });
    const rows = query.mock.calls[0]![0].data as { id: string }[];
    expect(rows[0]!.id).toMatch(V7);
    expect(rows[1]!.id).toBe('keep');
    expect(rows[2]!.id).toMatch(V7);
    expect(rows[0]!.id).not.toBe(rows[2]!.id);
    expect(rows[0]!.id < rows[2]!.id).toBe(true); // time-sortable, monotonic
  });

  it('createMany: accepts a single object as data', async () => {
    const query = vi.fn().mockResolvedValue({ count: 1 });
    await uuidv7Query.createMany({ args: { data: { name: 'a' } }, query });
    expect(query.mock.calls[0]![0].data.id).toMatch(V7);
  });

  it('createManyAndReturn: behaves like createMany', async () => {
    const query = vi.fn().mockResolvedValue([]);
    await uuidv7Query.createManyAndReturn({ args: { data: [{ name: 'a' }] }, query });
    expect(query.mock.calls[0]![0].data[0].id).toMatch(V7);
  });

  it('does not mutate the caller args', async () => {
    const query = vi.fn().mockResolvedValue({});
    const args = { data: { name: 'Ada' } };
    await uuidv7Query.create({ args, query });
    expect(args.data).toEqual({ name: 'Ada' });
  });
});
