import 'api_exception.dart';

/// Runs a parse step and reports a malformed response the same way as any
/// other API failure, so screens have one error path, not two.
T parseResponse<T>(T Function() parse) {
  try {
    return parse();
  } on FormatException catch (error) {
    throw ApiException(
      kind: ApiErrorKind.badResponse,
      message: 'The server sent a response this app could not read.',
      code: 'BAD_RESPONSE: ${error.message}',
    );
  } on TypeError {
    throw const ApiException(
      kind: ApiErrorKind.badResponse,
      message: 'The server sent a response this app could not read.',
      code: 'BAD_RESPONSE',
    );
  }
}
