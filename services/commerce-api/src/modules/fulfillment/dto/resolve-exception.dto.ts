import { IsIn, IsString, MinLength } from 'class-validator';

export const RESOLVE_EXCEPTION_ACTIONS = ['resume', 'cancel_quantity'] as const;
export type ResolveExceptionAction = (typeof RESOLVE_EXCEPTION_ACTIONS)[number];

export class ResolveExceptionDto {
  @IsIn(RESOLVE_EXCEPTION_ACTIONS)
  action!: ResolveExceptionAction;

  @IsString()
  @MinLength(1)
  resolution!: string;
}
