import { Injectable, type ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { ThrottlerLimitDetail } from '@nestjs/throttler/dist/throttler.guard.interface';

/**
 * @nestjs/throttler only emits `Retry-After-<name>` for named throttlers; clients and the 429
 * contract expect the plain `Retry-After` header (whole seconds), so set it before throwing.
 */
@Injectable()
export class KoraThrottlerGuard extends ThrottlerGuard {
  protected override async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const { res } = this.getRequestResponse(context);
    this.setResponseHeader(res, 'Retry-After', Math.max(1, detail.timeToBlockExpire));
    return super.throwThrottlingException(context, detail);
  }
}
