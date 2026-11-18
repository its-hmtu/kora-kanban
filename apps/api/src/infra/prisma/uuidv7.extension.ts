import { Prisma } from '../../generated/prisma/client';
import { uuidv7 } from 'uuidv7';

type WithOptionalId = { id?: unknown };
type Args = { data: unknown };
type Handler = (params: {
  args: Args;
  query: (args: Args) => Promise<unknown>;
}) => Promise<unknown>;

const withId = <T extends WithOptionalId>(row: T): T =>
  row.id == null ? { ...row, id: uuidv7() } : row;

const withIds = (data: unknown): unknown =>
  Array.isArray(data) ? data.map(withId) : withId(data as WithOptionalId);

const assignIds: Handler = ({ args, query }) => {
  return query({ ...args, data: withIds(args.data) });
};

type UpsertArgs = { where: unknown; create: unknown; update: unknown };
const assignUpsertId = ({
  args,
  query,
}: {
  args: UpsertArgs;
  query: (args: UpsertArgs) => Promise<unknown>;
}) => query({ ...args, create: withId(args.create as WithOptionalId) });

/**
 * Query-layer handlers that fill in a uuid v7 `id` for top-level creates (and the create branch of
 * upsert) when the caller gave none (data-model.md: all ids are UUIDv7). Nested creates and
 * connectOrCreate (relation writes) are not covered; pass `id`
 * explicitly there.
 */
export const uuidv7Query = {
  create: assignIds,
  createMany: assignIds,
  createManyAndReturn: assignIds,
  upsert: assignUpsertId,
};

export const uuidv7Extension = Prisma.defineExtension({
  name: 'uuidv7-ids',
  query: { $allModels: uuidv7Query },
});
