import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ReviewReportReason } from '@prisma/client';

export class ReportReviewDto {
  @IsEnum(ReviewReportReason)
  reason!: ReviewReportReason;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  details?: string;
}
