import { Type, plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
  ValidateIf,
  validateSync,
} from 'class-validator';

enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  @IsUrl({ protocols: ['postgresql', 'postgres'], require_tld: false })
  DATABASE_URL!: string;

  @IsUrl({ protocols: ['postgresql', 'postgres'], require_tld: false })
  SHADOW_DATABASE_URL!: string;

  @MinLength(32)
  JWT_SECRET!: string;

  @Type(() => Number)
  @IsInt()
  @Min(60)
  ACCESS_TOKEN_TTL_SECONDS = 900;

  @Type(() => Number)
  @IsInt()
  @Min(60)
  REFRESH_TOKEN_TTL_SECONDS = 2_592_000;

  @IsString()
  @IsNotEmpty()
  MEDIA_STORAGE_PATH = '.data/media';

  @MinLength(32)
  MEDIA_SIGNING_SECRET!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  MEDIA_MAX_FILE_SIZE_BYTES = 10_485_760;

  @Type(() => Number)
  @IsInt()
  @Min(60)
  MEDIA_URL_TTL_SECONDS = 900;

  @IsUrl({ require_tld: false })
  UNIFIED_PAYMENTS_API_URL = 'http://72.62.61.21:9002';

  @IsOptional()
  @IsString()
  @MinLength(1)
  UNIFIED_PAYMENTS_API_KEY?: string;

  @IsOptional()
  @IsString()
  UNIFIED_PAYMENTS_MERCHANT_ID?: string;

  @ValidateIf(
    (_object, value) => value !== undefined && value !== '',
  )
  @IsOptional()
  @IsUrl({ require_tld: false })
  UNIFIED_PAYMENTS_CALLBACK_URL?: string;
}

export function validate(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(`Environment validation failed: ${errors.toString()}`);
  }

  return validatedConfig;
}
