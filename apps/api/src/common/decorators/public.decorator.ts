import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'kora:isPublic';

/** Opts a route (or a whole controller) out of `SessionAuthGuard`'s 401. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
