export const SESSION_REVOKED_EVENT = 'session.revoked';

/**
 * Emitted (via `@nestjs/event-emitter`) whenever sessions end: one session (`sessionId`, from
 * logout or rotation) or all of a user's sessions (`all: true`, from logout-all or a password
 * reset). The realtime gateway (US5) consumes it to disconnect the affected sockets.
 */
export class SessionRevokedEvent {
  readonly userId: string;
  readonly sessionId?: string;
  readonly all: boolean;

  constructor(init: { userId: string; sessionId?: string; all: boolean }) {
    this.userId = init.userId;
    if (init.sessionId !== undefined) this.sessionId = init.sessionId;
    this.all = init.all;
  }
}
