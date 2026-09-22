import { Transform } from 'class-transformer';
import {
  FulfillmentStatus,
  OrderStatus,
  ReturnStatus,
} from '@prisma/client';
import {
  IsArray,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsUUID,
} from 'class-validator';

// Accepts either a comma-separated string ("A,B") or repeated query keys
// (?x=A&x=B), matching ProductQueryDto's array-query convention.
const toArray = ({ value }: { value: unknown }): unknown[] => {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'string') {
    return value.split(',').map((entry) => entry.trim());
  }
  return [value];
};

export class OperationsMetricsQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsEnum(OrderStatus, { each: true })
  orderStatuses?: OrderStatus[];

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsEnum(FulfillmentStatus, { each: true })
  fulfillmentStatuses?: FulfillmentStatus[];

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsEnum(ReturnStatus, { each: true })
  returnStatuses?: ReturnStatus[];
}
