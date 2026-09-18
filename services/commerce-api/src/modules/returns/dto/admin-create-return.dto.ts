import { IsUUID } from 'class-validator';

import { CreateReturnDto } from './create-return.dto';

export class AdminCreateReturnDto extends CreateReturnDto {
  @IsUUID()
  orderId!: string;

  @IsUUID()
  userId!: string;
}
