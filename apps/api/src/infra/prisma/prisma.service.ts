import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { uuidv7Extension } from './uuidv7.extension';

/**
 * Owns the Prisma client. Use `prisma.client` for queries: it is the base client extended so that
 * creates get uuid v7 ids. (Composition rather than inheritance because `$extends` returns a new
 * client type that a `PrismaClient` subclass cannot be.)
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }).$extends(uuidv7Extension);

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
