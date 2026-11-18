import { Module } from '@nestjs/common';
import { TestResetController } from './test-reset.controller';

/** Test-only routes; AppModule imports this only when NODE_ENV=test. */
@Module({ controllers: [TestResetController] })
export class TestResetModule {}
