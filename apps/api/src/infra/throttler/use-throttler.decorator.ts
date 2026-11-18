import { applyDecorators, SetMetadata } from '@nestjs/common';

export type ThrottlerName = 'auth' | 'auth-ip' | 'api-token';

export const USE_THROTTLER_KEY = 'kora:use-throttler';

const enable = (...names: ThrottlerName[]) => SetMetadata(USE_THROTTLER_KEY, names);

/**
 * Rate limits an authentication route with both caps: 10/min per IP+email (`auth`) and
 * 30/min per IP (`auth-ip`). Routes without a throttle decorator are not rate limited: the global
 * guard skips every named throttler the route has not enabled.
 */
export const AuthThrottle = () => applyDecorators(enable('auth', 'auth-ip'));

/** Rate limits a route per API token (100/min). */
export const ApiTokenThrottle = () => applyDecorators(enable('api-token'));
