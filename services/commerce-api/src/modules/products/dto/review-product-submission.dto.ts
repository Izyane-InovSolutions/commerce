import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Product has no `version` column (unlike Seller), so this doesn't carry
 * one — the review itself is the atomic guard: it only succeeds while the
 * submission is still PENDING (see ProductsService.reviewSubmission), the
 * same race-safety a version check gives, without needing one.
 */
export class ReviewProductSubmissionDto {
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  @Matches(/\S/)
  reason!: string;
}
