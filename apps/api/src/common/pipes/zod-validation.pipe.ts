import { Body, Query, type PipeTransform } from '@nestjs/common';
import { ErrorCode } from '@kora/shared';
import { z } from 'zod';
import { DomainError } from '../errors/domain-error';

export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new DomainError(ErrorCode.VALIDATION, 422, { ...z.flattenError(result.error) });
    }
    return result.data;
  }
}

export const ZodBody = <T extends z.ZodType>(schema: T): ParameterDecorator =>
  Body(new ZodValidationPipe(schema));

export const ZodQuery = <T extends z.ZodType>(schema: T): ParameterDecorator =>
  Query(new ZodValidationPipe(schema));
