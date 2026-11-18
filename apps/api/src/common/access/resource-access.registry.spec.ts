import { describe, expect, it } from 'vitest';
import { ResourceAccessRegistry } from './resource-access.registry';

describe('ResourceAccessRegistry', () => {
  it('resolves through the resolver registered for the resource type', async () => {
    const registry = new ResourceAccessRegistry();
    registry.register('board', async (id, userId) =>
      id === 'b1' && userId === 'u1' ? { boardRole: 'VIEWER' } : null,
    );
    await expect(registry.resolve('board', 'b1', 'u1')).resolves.toEqual({ boardRole: 'VIEWER' });
    await expect(registry.resolve('board', 'b1', 'u2')).resolves.toBeNull();
  });

  it('accepts synchronous resolvers', async () => {
    const registry = new ResourceAccessRegistry();
    registry.register('workspace', () => ({ workspaceRole: 'OWNER' }));
    await expect(registry.resolve('workspace', 'w', 'u')).resolves.toEqual({
      workspaceRole: 'OWNER',
    });
  });

  it('refuses a second resolver for the same resource type (no silent override)', () => {
    const registry = new ResourceAccessRegistry();
    registry.register('card', () => null);
    expect(() => registry.register('card', () => ({ boardRole: 'ADMIN' }))).toThrow(
      /already registered/,
    );
  });

  it('throws (a programming error → 500) for a resource type with no resolver', async () => {
    await expect(new ResourceAccessRegistry().resolve('column', 'c', 'u')).rejects.toThrow(
      /No resource access resolver registered for "column"/,
    );
  });
});
