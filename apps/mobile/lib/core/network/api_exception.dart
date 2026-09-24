enum ApiErrorKind {
  /// No response at all: offline, DNS failure, refused, TLS failure.
  network,

  /// Sent, but no response inside the client timeout.
  timeout,

  /// The API answered with an error status.
  http,

  /// The API answered, but not with anything this client can read — most
  /// often an HTML error page from the tunnel or a proxy in front of it.
  badResponse,
}

/// Every failure the network layer can produce, in one shape.
///
/// The API's error envelope is `{error: {code, message, details: [{field,
/// message}]}, requestId}`. That is decoded here once, so no screen ever has
/// to know it exists.
class ApiException implements Exception {
  const ApiException({
    required this.kind,
    required this.message,
    this.statusCode,
    this.code,
    this.fieldErrors = const {},
    this.requestId,
  });

  final ApiErrorKind kind;
  final int? statusCode;

  /// The API's machine-readable code, e.g. `VALIDATION_ERROR`, `NOT_FOUND`.
  final String? code;

  /// Safe to show to a person as-is.
  final String message;

  /// Validation failures keyed by request field, for putting under inputs.
  final Map<String, String> fieldErrors;

  /// Correlates this failure with the API's own logs. Worth showing on error
  /// screens: a tester can quote it and the backend log line is one grep away.
  final String? requestId;

  bool get isUnauthorized => statusCode == 401;
  bool get isNotFound => statusCode == 404;
  bool get isConnectivity =>
      kind == ApiErrorKind.network || kind == ApiErrorKind.timeout;

  @override
  String toString() =>
      'ApiException(${statusCode ?? kind.name}${code == null ? '' : ' $code'}): '
      '$message${requestId == null ? '' : ' [request $requestId]'}';
}

/// Turns anything a controller catches into something a screen can show.
String describeError(Object error) {
  if (error is ApiException) {
    return error.message;
  }
  return 'Something went wrong. Please try again.';
}
