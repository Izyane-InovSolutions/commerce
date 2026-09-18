import { IsString, MinLength } from 'class-validator';

/** No `version` field — ReviewReport has no version column (see
 * admin-reviews.service.ts's dismissReport for why the status-guarded
 * updateMany itself is the concurrency check here instead). */
export class DismissReportDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}
