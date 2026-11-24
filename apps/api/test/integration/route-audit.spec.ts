import { Controller, Get, Post, type INestApplication } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { afterAll, describe, expect, it } from 'vitest';
import { IS_PUBLIC_KEY, Public } from '../../src/common/decorators/public.decorator';
import {
  REQUIRE_PERMISSION_KEY,
  RequirePermission,
} from '../../src/common/decorators/require-permission.decorator';
import { closeHarness, createTestApp } from '../setup/test-app';

/**
 * Routes that are authenticated-only by design: any signed-in user may call them and they name no
 * resource to check a permission against. Entries are `Controller.method`. Keep this list short.
 */
const AUTHENTICATED_ONLY: readonly string[] = ['AuthController.logout', 'AuthController.logoutAll'];

/** Every controller route in the app that has neither `@Public()` nor `@RequirePermission(...)`. */
function unguardedRoutes(app: INestApplication): string[] {
  const reflector = new Reflector();
  const found: string[] = [];
  for (const module of app.get(ModulesContainer).values()) {
    for (const { metatype } of module.controllers.values()) {
      if (typeof metatype !== 'function') continue;
      const controller = metatype as abstract new (...args: never[]) => unknown;
      for (const name of routeHandlerNames(controller)) {
        const handler = (controller.prototype as Record<string, () => unknown>)[name]!;
        const targets = [handler, controller];
        const isPublic = reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets);
        const permission = reflector.getAllAndOverride<unknown>(REQUIRE_PERMISSION_KEY, targets);
        if (!isPublic && !permission) found.push(`${controller.name}.${name}`);
      }
    }
  }
  return found.sort();
}

/** Methods (own and inherited) carrying Nest route metadata. */
function routeHandlerNames(controller: abstract new (...args: never[]) => unknown): string[] {
  const names = new Set<string>();
  for (
    let proto: object | null = controller.prototype as object;
    proto && proto !== Object.prototype;
    proto = Object.getPrototypeOf(proto) as object | null
  ) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      const value: unknown = Reflect.get(proto, name);
      if (name === 'constructor' || typeof value !== 'function') continue;
      if (
        Reflect.hasMetadata(METHOD_METADATA, value) &&
        Reflect.hasMetadata(PATH_METADATA, value)
      ) {
        names.add(name);
      }
    }
  }
  return [...names];
}

@Controller('fixture')
class FixtureController {
  @Get('open')
  @Public()
  open() {}

  @Get('workspaces/:wid')
  @RequirePermission('workspace.view', { resource: 'workspace', param: 'wid' })
  guarded() {}

  @Post('forgotten')
  forgotten() {}

  helper() {}
}

@Public()
@Controller('fixture-public')
class PublicFixtureController {
  @Get()
  index() {}
}

afterAll(closeHarness);

describe('route audit', () => {
  it('flags routes with neither @Public() nor @RequirePermission(...)', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [FixtureController, PublicFixtureController],
    }).compile();
    const app = moduleRef.createNestApplication();
    expect(unguardedRoutes(app)).toEqual(['FixtureController.forgotten']);
    await app.close();
  });

  it('every AppModule route is @Public(), @RequirePermission(...) or allowlisted', async () => {
    const app = await createTestApp();
    const unexpected = unguardedRoutes(app).filter((r) => !AUTHENTICATED_ONLY.includes(r));
    expect(unexpected).toEqual([]);
  });
});
