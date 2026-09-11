import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type {
  OpenAPIObject,
  OperationObject,
  SchemaObject,
} from '@nestjs/swagger';

import contracts from './contracts.generated.json';

/** Combine Nest's route discovery with contracts generated from the source types. */
export function createApiDocument(app: INestApplication): OpenAPIObject {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Commerce API')
      .setVersion('v1')
      .setDescription(
        'JSON successes contain data and meta.requestId. Errors contain error and requestId. Guest cart requests may send x-guest-token. Payment provider integration is pending.',
      )
      .addBearerAuth()
      .build(),
  );
  const generated = contracts as unknown as {
    operations: Record<string, OperationObject>;
    schemas: Record<string, SchemaObject>;
  };
  const seen = new Set<string>();
  for (const item of Object.values(document.paths)) {
    for (const verb of [
      'get',
      'post',
      'put',
      'patch',
      'delete',
      'head',
      'options',
    ] as const) {
      const operation = item[verb];
      if (!operation) continue;
      const id = operation.operationId ?? '';
      const contract = generated.operations[id];
      if (!contract)
        throw new Error(
          `Missing Swagger contract for ${id}; run swagger:generate`,
        );
      Object.assign(operation, contract);
      seen.add(id);
    }
  }
  for (const id of Object.keys(generated.operations)) {
    if (!seen.has(id))
      throw new Error(`Stale Swagger contract: ${id}; run swagger:generate`);
  }
  document.components = { ...document.components, schemas: generated.schemas };
  return document;
}
