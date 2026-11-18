import { SetMetadata } from '@nestjs/common';

export type ThrottlerName = 'auth' | 'api-token';

export const USE_THROTTLER_KEY = 'kora:use-throttler';

/**
 * Opts a route (or controller) in to the named throttler(s). Routes without it are not rate limited:
 * the global guard skips every named throttler that the route has not asked for.
 */
export const UseThrottler = (...names: ThrottlerName[]) => SetMetadata(USE_THROTTLER_KEY, names);
