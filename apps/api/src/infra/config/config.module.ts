import { Global, Module } from '@nestjs/common';
import { loadEnv } from './env';

/** Injection token for the validated, typed env (`Env`). */
export const APP_CONFIG = Symbol('APP_CONFIG');

/**
 * Global config. Deliberately not @nestjs/config: we only need one validated, typed object, which a
 * plain factory provider gives us. Validation runs at module init so bad env fails boot.
 */
@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: () => loadEnv() }],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
