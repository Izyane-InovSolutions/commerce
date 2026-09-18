import { IsInt } from 'class-validator';

/** approve has no `reason` — approving is not a decline/hold decision, so
 * there is nothing to justify beyond the actor and audit trail. */
export class ApproveModerationDto {
  @IsInt()
  version!: number;
}
