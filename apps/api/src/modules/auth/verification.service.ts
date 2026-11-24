import { Inject, Injectable } from '@nestjs/common';
import { ErrorCode } from '@kora/shared';
import { DomainError } from '../../common/errors/domain-error';
import { CryptoService } from '../../infra/crypto/crypto.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CLOCK, type Clock } from './session.service';

export type VerificationTokenType = 'email_verify' | 'password_reset';

const HOUR_MS = 60 * 60_000;
export const VERIFICATION_TTL_MS: Record<VerificationTokenType, number> = {
  email_verify: 24 * HOUR_MS,
  password_reset: HOUR_MS,
};

@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Issues a raw token (only its sha256 is stored) and invalidates earlier unused ones of that type. */
  async issue(userId: string, type: VerificationTokenType): Promise<string> {
    const token = this.crypto.randomToken(32);
    const now = this.clock.now();
    await this.prisma.client.$transaction([
      this.prisma.client.verificationToken.deleteMany({ where: { userId, type, usedAt: null } }),
      this.prisma.client.verificationToken.create({
        data: {
          userId,
          type,
          tokenHash: this.crypto.sha256(token),
          expiresAt: new Date(now.getTime() + VERIFICATION_TTL_MS[type]),
        },
      }),
    ]);
    return token;
  }

  /**
   * Single-use: the conditional update means concurrent consumers cannot both succeed. Unknown,
   * expired, used and wrong-type tokens are indistinguishable (422 TOKEN_INVALID).
   */
  async consume(token: string, type: VerificationTokenType): Promise<{ userId: string }> {
    const tokenHash = this.crypto.sha256(token);
    const now = this.clock.now();
    const claimed = await this.prisma.client.verificationToken.updateMany({
      where: { tokenHash, type, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) throw tokenInvalid();
    const row = await this.prisma.client.verificationToken.findUniqueOrThrow({
      where: { tokenHash },
      select: { userId: true },
    });
    return { userId: row.userId };
  }
}

const tokenInvalid = () =>
  new DomainError(ErrorCode.VALIDATION, 422, { fieldErrors: { token: ['TOKEN_INVALID'] } });
