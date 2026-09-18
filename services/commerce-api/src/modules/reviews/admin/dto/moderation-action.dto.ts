import { IsInt, IsString, MinLength } from 'class-validator';

/** Shared by hide/remove/restore — each requires a non-empty reason,
 * mirroring RejectReturnDto's `rejectionReason` convention. */
export class ModerationActionDto {
  @IsInt()
  version!: number;

  @IsString()
  @MinLength(1)
  reason!: string;
}
