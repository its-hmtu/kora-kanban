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
  configureApp(app, app.get<Env>(APP_CONFIG));
  const port = Number.parseInt(process.env.PORT ?? '', 10);
  await app.listen(Number.isNaN(port) ? 3000 : port);
}

void bootstrap();
