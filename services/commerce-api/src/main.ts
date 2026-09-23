import { ValidationPipe, type ValidationError } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded, type Request } from 'express';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { ValidationException } from './common/http/validation-exception';
import { createApiDocument } from './common/openapi/create-api-document';
import { AppLogger } from './infrastructure/logging/app-logger.service';

const REQUEST_BODY_LIMIT = '1mb';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  // In production this runs behind a reverse proxy, so the socket's peer
  // address is the proxy, not the caller. Left uncorrected, ThrottlerGuard
  // buckets every visitor under that one address and the global 100 req/min
  // limit becomes a cap on the entire platform rather than on one client.
  //
  // Only private ranges are trusted — the Docker network the proxy sits on.
  // Express then walks X-Forwarded-For right to left, skipping those, and
  // stops at the first public address. A caller cannot forge that: the edge
  // appends the address it observed to the right of anything supplied.
  app.set('trust proxy', 'loopback, linklocal, uniquelocal');

  app.useLogger(app.get(AppLogger));
  app.use(helmet());
  app.use(
    json({
      limit: REQUEST_BODY_LIMIT,
      // Webhook signature verification needs the raw bytes, which are
      // otherwise discarded once the body is parsed as JSON.
      verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(urlencoded({ limit: REQUEST_BODY_LIMIT, extended: true }));

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
      exceptionFactory: (errors: ValidationError[]): ValidationException =>
        new ValidationException(errors),
    }),
  );
  app.enableShutdownHooks();

  const document = createApiDocument(app);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
