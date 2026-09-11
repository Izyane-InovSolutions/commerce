import { ValidationPipe, type ValidationError } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded, type Request } from 'express';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { ValidationException } from './common/http/validation-exception';
import { AppLogger } from './infrastructure/logging/app-logger.service';

const REQUEST_BODY_LIMIT = '1mb';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: false });

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

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('Commerce API').setVersion('v1').build(),
  );
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
