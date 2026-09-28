import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

import { booleanQuery } from '../../../common/pagination/boolean-query.transform';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';

export class ListNotificationsQueryDto extends PaginationQueryDto {
  /** true = only unread; false = only read; absent = everything. */
  @IsOptional()
  @Transform(booleanQuery)
  @IsBoolean()
  unread?: boolean;
}
