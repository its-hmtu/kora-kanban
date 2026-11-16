import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter, type NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, new ExpressAdapter());
  configureApp(app);
  const port = Number.parseInt(process.env.PORT ?? '', 10);
  await app.listen(Number.isNaN(port) ? 3000 : port);
}

void bootstrap();
