import { BadRequestException, ValidationError } from '@nestjs/common';

import { ErrorDetail } from './response-envelope';

function flattenErrors(
  errors: ValidationError[],
  parentPath = '',
): ErrorDetail[] {
  return errors.flatMap((error) => {
    const path = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    const ownDetails = Object.values(error.constraints ?? {}).map(
      (message) => ({
        field: path,
        message,
      }),
    );
    const childDetails = error.children?.length
      ? flattenErrors(error.children, path)
      : [];

    return [...ownDetails, ...childDetails];
  });
}

export class ValidationException extends BadRequestException {
  constructor(errors: ValidationError[]) {
    super({
      message: 'The request is invalid',
      details: flattenErrors(errors),
    });
  }
}
