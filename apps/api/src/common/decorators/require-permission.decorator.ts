import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@kora/shared';
import type { ResourceType } from '../access/resource-access.registry';

export const REQUIRE_PERMISSION_KEY = 'kora:requirePermission';

export interface PermissionRequirement {
  permission: Permission;
  /** Which resolver in `ResourceAccessRegistry` decides the caller's roles. */
  resource: ResourceType;
  /** Route param holding the resource id, e.g. 'wid' | 'bid' | 'id'. */
  param: string;
}

/**
 * Declares the permission (from @kora/shared) a route needs on the resource named by a route
 * param. Enforced by `PermissionGuard`: no access → 404, missing permission → 403.
 */
export const RequirePermission = (
  permission: Permission,
  target: { resource: ResourceType; param: string },
) =>
  SetMetadata<string, PermissionRequirement>(REQUIRE_PERMISSION_KEY, {
    permission,
    resource: target.resource,
    param: target.param,
  });
