import { Injectable } from '@nestjs/common';
import type { BoardRole, WorkspaceRole } from '@kora/shared';

/** Resource types a route can guard with `@RequirePermission`; extend as modules add resolvers. */
export type ResourceType = 'workspace' | 'board' | 'card' | 'column';

/** The caller's roles on a resource, read from the database — never from the client. */
export interface ResourceAccess {
  workspaceRole?: WorkspaceRole;
  /** Effective board role (contracts/permissions.md); absent for workspace-only resources. */
  boardRole?: BoardRole;
}

/**
 * Resolves a user's access to one resource. Must return `null` when the resource does not exist
 * or the user has no access to it (the API answers 404, leaking nothing — SC-005).
 */
export type ResourceAccessResolver = (
  id: string,
  userId: string,
) => Promise<ResourceAccess | null> | ResourceAccess | null;

/** Each domain module registers the resolver for its resource type(s) (e.g. in `onModuleInit`). */
@Injectable()
export class ResourceAccessRegistry {
  private readonly resolvers = new Map<ResourceType, ResourceAccessResolver>();

  register(resource: ResourceType, resolver: ResourceAccessResolver): void {
    if (this.resolvers.has(resource)) {
      throw new Error(`A resource access resolver is already registered for "${resource}"`);
    }
    this.resolvers.set(resource, resolver);
  }

  /** Throws (→ 500) when no resolver is registered: a wiring bug, not a missing resource. */
  async resolve(
    resource: ResourceType,
    id: string,
    userId: string,
  ): Promise<ResourceAccess | null> {
    const resolver = this.resolvers.get(resource);
    if (!resolver) throw new Error(`No resource access resolver registered for "${resource}"`);
    return resolver(id, userId);
  }
}
