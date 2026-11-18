import { Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigModule } from '../config/config.module';
import { CryptoModule } from './crypto.module';
import { CryptoService } from './crypto.service';

const valid = {
  DATABASE_URL: 'postgresql://kora:kora@localhost:5432/kora',
  REDIS_URL: 'redis://localhost:6379',
  APP_URL: 'http://localhost:5173',
  API_URL: 'http://localhost:3000',
  SESSION_SECRET: 'x'.repeat(32),
  ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  MAIL_FROM: 'Kora <noreply@kora.local>',
};

@Injectable()
class Consumer {
  constructor(readonly crypto: CryptoService) {}
}

// A feature module that does not import CryptoModule itself.
@Module({ providers: [Consumer] })
class FeatureModule {}

describe('CryptoModule', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is global: other modules can inject CryptoService without importing it', async () => {
    for (const [k, v] of Object.entries(valid)) vi.stubEnv(k, v);
    const mod = await Test.createTestingModule({
      imports: [ConfigModule, CryptoModule, FeatureModule],
    }).compile();
    expect(mod.get(Consumer).crypto).toBeInstanceOf(CryptoService);
  });
});
