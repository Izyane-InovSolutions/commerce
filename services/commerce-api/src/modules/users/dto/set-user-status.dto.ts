import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Body of `POST /admin/users/:id/disable` and `/enable`. */
export class SetUserStatusDto {
  /** Recorded in the audit event, not on the user. */
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  @Matches(/\S/)
  reason?: string;
}
