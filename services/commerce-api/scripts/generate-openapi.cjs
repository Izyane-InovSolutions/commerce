/* Generate wire schemas before TypeScript erases aliases, generics and Prisma types. */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const configPath = path.join(root, 'tsconfig.build.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const program = ts.createProgram(parsed.fileNames, parsed.options);
const checker = program.getTypeChecker();
const schemas = {};
const cache = new Map();
const operations = {};

function decorators(node) {
  return (
    (ts.canHaveDecorators(node) ? ts.getDecorators(node) : [])
      ?.map((d) => d.expression)
      .filter(ts.isCallExpression) ?? []
  );
}
function dec(node, name) {
  return decorators(node).find((d) => d.expression.getText() === name);
}
function value(node) {
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNumericLiteral(node))
    return ts.isNumericLiteral(node) ? Number(node.text) : node.text;
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isAsExpression(node) || ts.isParenthesizedExpression(node))
    return value(node.expression);
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(value);
  if (ts.isRegularExpressionLiteral(node))
    return node.text.slice(1, node.text.lastIndexOf('/'));
  const type = checker.getTypeAtLocation(node);
  if (type.isLiteral()) return type.value;
  let symbol = checker.getSymbolAtLocation(node);
  if (symbol?.flags & ts.SymbolFlags.Alias)
    symbol = checker.getAliasedSymbol(symbol);
  const declaration = symbol?.valueDeclaration;
  if (declaration?.initializer && declaration.initializer !== node)
    return value(declaration.initializer);
  return undefined;
}
function constraints(node, schema) {
  const result = { ...schema };
  for (const d of decorators(node)) {
    const name = d.expression.getText();
    const args = d.arguments.map(value);
    const each = d.arguments.some((a) => /each:\s*true/.test(a.getText()));
    const targets = each
      ? result.items
        ? [result.items]
        : (result.anyOf?.flatMap((s) => (s.items ? [s.items] : [s])) ?? [
            result,
          ])
      : [result];
    for (const target of targets) {
      if (name === 'IsInt') target.type = 'integer';
      if (name === 'IsEmail') target.format = 'email';
      if (name === 'IsUUID') target.format = 'uuid';
      if (name === 'IsDate') {
        target.type = 'string';
        target.format = 'date-time';
      }
      const keywords = {
        Min: 'minimum',
        Max: 'maximum',
        MinLength: 'minLength',
        MaxLength: 'maxLength',
        ArrayMinSize: 'minItems',
        ArrayMaxSize: 'maxItems',
        Matches: 'pattern',
      };
      if (keywords[name] && args[0] !== undefined)
        target[keywords[name]] = args[0];
      if (name === 'Length') {
        target.minLength = args[0];
        target.maxLength = args[1] ?? args[0];
      }
      if (name === 'IsNotEmpty' && target.type === 'string')
        target.minLength = 1;
      if (name === 'IsSlug') target.pattern = '^[a-z0-9]+(-[a-z0-9]+)*$';
      if (name === 'IsIn') target.enum = args[0];
      if (name === 'ArrayUnique') target.uniqueItems = true;
      if (name === 'NotEquals') target.not = { enum: [args[0]] };
    }
    if (name === 'IsOptional') result.nullable = true;
  }
  const initial = value(node.initializer);
  if (initial !== undefined) result.default = initial;
  return result;
}
function schema(type, input = false) {
  const flags = ts.TypeFlags;
  if (['JsonValue', 'InputJsonValue'].includes(type.aliasSymbol?.name))
    return {
      description: 'JSON value; may be an object, array, scalar or null.',
      nullable: true,
    };
  if (type.isUnion()) {
    const members = type.types.filter(
      (t) => !(t.flags & (flags.Undefined | flags.Null)),
    );
    const nullable = type.types.some((t) => t.flags & flags.Null);
    let result;
    if (members.every((t) => t.flags & flags.BooleanLike))
      result = { type: 'boolean' };
    else if (members.every((t) => t.isLiteral()))
      result = {
        type: typeof members[0].value === 'number' ? 'number' : 'string',
        enum: members.map((t) => t.value),
      };
    else
      result =
        members.length === 1
          ? schema(members[0], input)
          : { anyOf: members.map((t) => schema(t, input)) };
    return nullable
      ? result.$ref
        ? { type: 'object', allOf: [result], nullable: true }
        : { ...result, nullable: true }
      : result;
  }
  if (type.flags & flags.StringLike)
    return {
      type: 'string',
      ...(type.isLiteral() ? { enum: [type.value] } : {}),
    };
  if (type.flags & flags.NumberLike)
    return {
      type: 'number',
      ...(type.isLiteral() ? { enum: [type.value] } : {}),
    };
  if (type.flags & flags.BooleanLike) return { type: 'boolean' };
  if (type.flags & (flags.Void | flags.Undefined)) return undefined;
  if (type.flags & flags.Null) return { nullable: true };
  if (type.symbol?.name === 'Date')
    return { type: 'string', format: 'date-time' };
  if (type.flags & flags.BigIntLike)
    return {
      type: 'integer',
      format: 'int64',
      description: '64-bit integer; serialization depends on the endpoint.',
    };
  if (checker.isArrayType(type))
    return {
      type: 'array',
      items: schema(checker.getTypeArguments(type)[0], input),
    };
  if (type.flags & (flags.Any | flags.Unknown))
    throw new Error(`Unspecified contract type: ${checker.typeToString(type)}`);
  const key = `${input}:${type.id}`;
  if (cache.has(key)) return { $ref: `#/components/schemas/${cache.get(key)}` };
  const base =
    (type.aliasSymbol?.name ?? type.symbol?.name ?? 'Object').replace(
      /[^a-zA-Z0-9_]/g,
      '',
    ) || 'Object';
  let name = `${input ? 'Input' : ''}${base}`;
  for (let i = 2; schemas[name]; i++)
    name = `${input ? 'Input' : ''}${base}${i}`;
  cache.set(key, name);
  const result = { type: 'object', properties: {} };
  schemas[name] = result;
  const required = [];
  for (const property of checker.getPropertiesOfType(type)) {
    const node = property.valueDeclaration ?? property.declarations?.[0];
    if (!node || ts.isMethodDeclaration(node) || ts.isMethodSignature(node))
      continue;
    const field = schema(
      checker.getTypeOfSymbolAtLocation(property, node),
      input,
    );
    if (!field) continue;
    result.properties[property.name] = input ? constraints(node, field) : field;
    if (
      !(property.flags & ts.SymbolFlags.Optional) &&
      !(input && dec(node, 'IsOptional'))
    )
      required.push(property.name);
  }
  if (required.length) result.required = required;
  const indexType = checker.getIndexTypeOfType(type, ts.IndexKind.String);
  if (indexType)
    result.additionalProperties =
      indexType.flags & (flags.Any | flags.Unknown)
        ? true
        : schema(indexType, input);
  else if (input) result.additionalProperties = false;
  return { $ref: `#/components/schemas/${name}` };
}
function resolve(s) {
  return s.$ref ? schemas[s.$ref.split('/').pop()] : s;
}
const json = (s) => ({ 'application/json': { schema: s } });
const error = {
  type: 'object',
  required: ['error', 'requestId'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message', 'details'],
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        details: {
          type: 'array',
          items: {
            type: 'object',
            required: ['message'],
            properties: {
              field: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    requestId: { type: 'string' },
  },
};
schemas.ErrorEnvelope = error;
const meta = {
  type: 'object',
  required: ['requestId'],
  properties: { requestId: { type: 'string' } },
};
for (const source of program
  .getSourceFiles()
  .filter((s) => s.fileName.endsWith('.controller.ts'))
  .sort((a, b) => a.fileName.localeCompare(b.fileName))) {
  for (const controller of source.statements.filter(ts.isClassDeclaration)) {
    if (!dec(controller, 'Controller')) continue;
    for (const method of controller.members.filter(ts.isMethodDeclaration)) {
      const route = decorators(method).find((d) =>
        ['Get', 'Post', 'Patch', 'Put', 'Delete', 'Head', 'Options'].includes(
          d.expression.getText(),
        ),
      );
      if (!route) continue;
      const id = `${controller.name.text}_${method.name.getText()}`;
      const publicRoute = dec(method, 'Public') || dec(controller, 'Public');
      const optional =
        dec(method, 'OptionalAuth') || dec(controller, 'OptionalAuth');
      const roles = dec(method, 'Roles') ?? dec(controller, 'Roles');
      const operation = {
        operationId: id,
        tags: [
          value(dec(controller, 'Controller').arguments[0]) ||
            controller.name.text,
        ],
        parameters: [],
        security: publicRoute
          ? []
          : optional
            ? [{}, { bearer: [] }]
            : [{ bearer: [] }],
        responses: {},
      };
      if (roles)
        operation.description = `Required role: ${roles.arguments.map(value).join(' or ')}.`;
      for (const param of method.parameters) {
        const body = dec(param, 'Body');
        if (body)
          operation.requestBody = {
            required: true,
            content: json(schema(checker.getTypeAtLocation(param), true)),
          };
        const binding = decorators(param).find((d) =>
          ['Query', 'Param', 'Headers', 'GuestToken'].includes(
            d.expression.getText(),
          ),
        );
        if (binding) {
          const kind = binding.expression.getText();
          const location = {
            Query: 'query',
            Param: 'path',
            Headers: 'header',
            GuestToken: 'header',
          }[kind];
          const fieldName =
            kind === 'GuestToken'
              ? 'x-guest-token'
              : value(binding.arguments[0]);
          const fieldSchema = schema(checker.getTypeAtLocation(param), true);
          if (fieldName) {
            if (binding.arguments.some((a) => a.getText() === 'ParseUUIDPipe'))
              fieldSchema.format = 'uuid';
            operation.parameters.push({
              name: fieldName,
              in: location,
              required:
                location === 'path' ||
                (!param.questionToken &&
                  !checker
                    .typeToString(checker.getTypeAtLocation(param))
                    .includes('undefined')),
              schema: fieldSchema,
            });
          } else {
            const object = resolve(fieldSchema);
            for (const [name, field] of Object.entries(object.properties))
              operation.parameters.push({
                name,
                in: location,
                required: object.required?.includes(name) ?? false,
                schema: field,
                ...(field.type === 'array' || field.anyOf
                  ? { style: 'form', explode: true }
                  : {}),
              });
          }
        }
        if (dec(param, 'UploadedFile'))
          operation.requestBody = {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  required: ['file'],
                  properties: { file: { type: 'string', format: 'binary' } },
                },
              },
            },
          };
      }
      const status =
        value(dec(method, 'HttpCode')?.arguments[0]) ??
        (route.expression.getText() === 'Post' ? 201 : 200);
      const returnType = checker.getAwaitedType(
        checker.getReturnTypeOfSignature(
          checker.getSignatureFromDeclaration(method),
        ),
      );
      const data = schema(returnType);
      const raw = method.parameters.some(
        (p) => dec(p, 'Res') && !dec(p, 'Res').arguments.length,
      );
      operation.responses[status] = {
        description: status === 204 ? 'No content' : 'Success',
        ...(status === 204
          ? {}
          : {
              content: raw
                ? Object.fromEntries(
                    [
                      'image/jpeg',
                      'image/png',
                      'image/webp',
                      'application/pdf',
                    ].map((mime) => [
                      mime,
                      { schema: { type: 'string', format: 'binary' } },
                    ]),
                  )
                : json({
                    type: 'object',
                    required: data ? ['data', 'meta'] : ['meta'],
                    properties: { ...(data ? { data } : {}), meta },
                  }),
            }),
      };
      operation.responses.default = {
        description:
          'Error response (validation, authentication, authorization, missing resources, conflicts, rate limits or server errors).',
        content: json({ $ref: '#/components/schemas/ErrorEnvelope' }),
      };
      if (id === 'CartController_addItem')
        operation.responses[status].headers = {
          'x-guest-token': {
            description:
              'Issued when a new guest cart is created. Send this token on subsequent guest requests.',
            schema: { type: 'string' },
          },
        };
      if (id === 'PaymentsController_webhook') {
        operation.description =
          'Provider integration is pending. The signature format and payload fields are not yet defined; the current provider returns 503. Send the provider JSON payload as raw request bytes.';
        operation.parameters.find(
          (p) => p.name === 'x-webhook-signature',
        ).required = true;
        operation.requestBody = {
          required: true,
          content: json({
            type: 'object',
            additionalProperties: true,
            description:
              'Provider-defined payload; contract pending integration.',
          }),
        };
        operation.responses['503'] = {
          description: 'Payment provider integration unavailable',
          content: json({ $ref: '#/components/schemas/ErrorEnvelope' }),
        };
      }
      operations[id] = operation;
    }
  }
}
const output = `${JSON.stringify({ operations, schemas }, null, 2)}\n`;
const target = path.join(root, 'src/common/openapi/contracts.generated.json');
if (process.argv.includes('--check')) {
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== output)
    throw new Error(
      'Swagger contracts are stale. Run npm run swagger:generate.',
    );
} else {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, output);
}
console.log(
  `Swagger contracts: ${Object.keys(operations).length} endpoints, ${Object.keys(schemas).length} schemas.`,
);
