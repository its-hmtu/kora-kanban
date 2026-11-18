import { Global, Module } from '@nestjs/common';
import { ResourceAccessRegistry } from './resource-access.registry';

@Global()
@Module({ providers: [ResourceAccessRegistry], exports: [ResourceAccessRegistry] })
export class AccessModule {}
