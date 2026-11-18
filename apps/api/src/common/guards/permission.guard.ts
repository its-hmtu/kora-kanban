import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ErrorCode,
  hasBoardPermission,
  hasWorkspacePermission,
  uuid,
  type BoardPermission,
  type Permission,
  type WorkspacePermission,
} from '@kora/shared';
import type { Request } from 'express';
import { ResourceAccessRegistry, type ResourceAccess } from '../access/resource-access.registry';
import {
  REQUIRE_PERMISSION_KEY,
  type PermissionRequirement,
} from '../decorators/require-permission.decorator';
import { DomainError } from '../errors/domain-error';

/**
 * Global permission guard (registered as APP_GUARD after SessionAuthGuard and CsrfGuard in T037).
 * Routes without `@RequirePermission` pass. Otherwise the caller's roles come only from the
 * resolver registered for the resource type: `null` → 404 NOT_FOUND; a `workspace.*` permission
 * is checked against `workspaceRole`, a `board.*` permission against the effective `boardRole`;
 * missing → 403 FORBIDDEN.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly registry: ResourceAccessRegistry,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<PermissionRequirement | undefined>(
      REQUIRE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requirement) return true;

    const req = context.switchToHttp().getRequest<Request>();
    // SessionAuthGuard normally answers first; this covers @Public() routes that need a permission.
    if (!req.user) throw new DomainError(ErrorCode.UNAUTHENTICATED, 401);

    const id = req.params[requirement.param];
    if (typeof id !== 'string') {
      // Absent, or a wildcard (array) param: a wiring bug → 500, never a 404.
      throw new Error(
        `@RequirePermission param "${requirement.param}" is not a single route param of ${req.route?.path ?? req.path}`,
      );
    }
    // Ids are uuids; anything else cannot name a resource.
    if (!uuid.safeParse(id).success) throw new DomainError(ErrorCode.NOT_FOUND, 404);

    const access = await this.registry.resolve(requirement.resource, id, req.user.id);
    if (!access) throw new DomainError(ErrorCode.NOT_FOUND, 404);
    if (!allows(access, requirement.permission)) throw new DomainError(ErrorCode.FORBIDDEN, 403);
    return true;
  }
}

function allows(access: ResourceAccess, permission: Permission): boolean {
  if (permission.startsWith('workspace.')) {
    return (
      access.workspaceRole !== undefined &&
      hasWorkspacePermission(access.workspaceRole, permission as WorkspacePermission)
    );
  }
  return (
    access.boardRole !== undefined &&
    hasBoardPermission(access.boardRole, permission as BoardPermission)
  );
}
