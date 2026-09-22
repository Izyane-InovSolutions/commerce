import { IsInt, IsUUID } from 'class-validator';

export class AssignWorkItemDto {
  @IsUUID()
  assigneeUserId!: string;

  @IsInt()
  version!: number;
}
