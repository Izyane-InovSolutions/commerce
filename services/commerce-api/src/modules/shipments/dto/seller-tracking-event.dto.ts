import { ShipmentStatus } from '@prisma/client';
import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

/** #37: only these statuses make sense coming from a seller (see
 * ShipmentsService.addSellerTrackingEvent, which re-validates this list
 * defensively — services must not trust controller-layer validation alone). */
export const SELLER_POSTABLE_TRACKING_STATUSES = [
  ShipmentStatus.IN_TRANSIT,
  ShipmentStatus.OUT_FOR_DELIVERY,
  ShipmentStatus.DELIVERED,
  ShipmentStatus.DELIVERY_FAILED,
  ShipmentStatus.EXCEPTION,
  ShipmentStatus.RETURN_TO_SENDER,
  ShipmentStatus.RETURNED,
] as const;

export class SellerTrackingEventDto {
  @IsIn(SELLER_POSTABLE_TRACKING_STATUSES)
  normalizedStatus!: ShipmentStatus;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsDateString()
  occurredAt!: string;
}
