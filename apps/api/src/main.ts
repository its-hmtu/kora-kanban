import './load-env';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter, type NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { APP_CONFIG } from './infra/config/config.module';
import type { Env } from './infra/config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, new ExpressAdapter(), {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  // SIGTERM/SIGINT → onModuleDestroy/onApplicationShutdown, so Prisma and Redis close cleanly.
  app.enableShutdownHooks();
  const config = app.get<Env>(APP_CONFIG);
  configureApp(app, config);
  await app.listen(config.PORT);
}

bootstrap().catch((err: unknown) => {
  console.error('API failed to start', err);
  process.exit(1);
});
