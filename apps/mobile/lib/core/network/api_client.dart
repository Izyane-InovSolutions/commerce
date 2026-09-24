import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/api_endpoint.dart';
import '../util/uuid.dart';
import 'api_exception.dart';

/// What the client needs from whoever owns the session.
///
/// Kept as an interface so the client never depends on the session
/// controller, and so tests can supply a token without one.
abstract interface class AccessTokenSource {
  /// The current access token, or null when signed out.
  String? get accessToken;

  /// Called after the API rejects the current access token. Implementations
  /// must be single-flight: the API rotates refresh tokens and treats reuse
  /// of a spent one as theft, revoking the entire session — so two
  /// concurrent renewals with the same refresh token sign the user out.
  ///
  /// [rejectedToken] is the token the API just refused. If it is no longer
  /// the current one, another request already renewed and this one only
  /// needs to retry — spending another rotation would be wasted at best.
  ///
  /// Returns true when a fresh access token is now available.
  Future<bool> renewAccessToken(String rejectedToken);
}

/// HTTP transport for the Commerce API.
///
/// Returns the unwrapped `data` of the API's `{data, meta}` envelope and
/// throws [ApiException] for everything else. Screens never touch this;
/// repositories do.
class ApiClient {
  ApiClient({
    required ApiEndpoint endpoint,
    http.Client? httpClient,
    this.timeout = const Duration(seconds: 20),
    this.retryDelays = const [
      Duration(milliseconds: 400),
      Duration(milliseconds: 1200),
    ],
  })  : _endpoint = endpoint,
        _http = httpClient ?? http.Client();

  final ApiEndpoint _endpoint;
  final http.Client _http;
  final Duration timeout;

  /// Back-off between retries of idempotent requests. Its length is the
  /// retry budget.
  final List<Duration> retryDelays;

  AccessTokenSource? tokenSource;

  Future<Object?> get(
    String path, {
    Map<String, Object?>? query,
    bool authenticated = true,
  }) =>
      _request('GET', path, query: query, authenticated: authenticated);

  Future<Object?> post(
    String path, {
    Object? body,
    Map<String, Object?>? query,
    Map<String, String>? headers,
    bool authenticated = true,
  }) =>
      _request('POST', path,
          body: body,
          query: query,
          headers: headers,
          authenticated: authenticated);

  Future<Object?> patch(
    String path, {
    Object? body,
    Map<String, Object?>? query,
    bool authenticated = true,
  }) =>
      _request('PATCH', path,
          body: body, query: query, authenticated: authenticated);

  Future<Object?> delete(
    String path, {
    Map<String, Object?>? query,
    bool authenticated = true,
  }) =>
      _request('DELETE', path, query: query, authenticated: authenticated);

  Uri resolve(String path, [Map<String, Object?>? query]) {
    final base = _endpoint.value;
    final joined = '${base.path.replaceAll(RegExp(r'/+$'), '')}'
        '/${path.replaceAll(RegExp(r'^/+'), '')}';

    final params = <String, dynamic>{};
    query?.forEach((key, value) {
      if (value == null) return;
      if (value is Iterable) {
        final items = value.map((item) => '$item').toList();
        if (items.isNotEmpty) params[key] = items;
      } else {
        final text = '$value';
        if (text.isNotEmpty) params[key] = text;
      }
    });

    return base.replace(
      path: joined,
      queryParameters: params.isEmpty ? null : params,
    );
  }

  Future<Object?> _request(
    String method,
    String path, {
    Object? body,
    Map<String, Object?>? query,
    Map<String, String>? headers,
    required bool authenticated,
  }) async {
    // Only reads are retried. A POST that timed out may well have been
    // processed; replaying it could, say, place an order twice. Checkout
    // carries its own idempotency key for exactly that reason.
    final retryable = method == 'GET';
    var attempt = 0;
    var renewed = false;

    while (true) {
      final token = authenticated ? tokenSource?.accessToken : null;
      final requestId = uuidV4();
      final http.Response response;

      try {
        response = await _dispatch(
          method,
          resolve(path, query),
          body: body,
          headers: {
            'Accept': 'application/json',
            'X-Request-Id': requestId,
            if (body != null) 'Content-Type': 'application/json',
            if (token != null) 'Authorization': 'Bearer $token',
            ...?headers,
          },
        ).timeout(timeout);
      } on TimeoutException {
        if (retryable && attempt < retryDelays.length) {
          await Future<void>.delayed(retryDelays[attempt++]);
          continue;
        }
        throw ApiException(
          kind: ApiErrorKind.timeout,
          message: 'The server took too long to respond. Please try again.',
          requestId: requestId,
        );
      } on Exception {
        if (retryable && attempt < retryDelays.length) {
          await Future<void>.delayed(retryDelays[attempt++]);
          continue;
        }
        throw ApiException(
          kind: ApiErrorKind.network,
          message: "Couldn't reach the server. Check your connection, or the "
              'server address in settings.',
          requestId: requestId,
        );
      }

      // One renewal per request, and only when a token was actually sent: a
      // 401 on an anonymous request means "sign in", not "refresh".
      if (response.statusCode == 401 &&
          token != null &&
          !renewed &&
          tokenSource != null) {
        renewed = true;
        if (await tokenSource!.renewAccessToken(token)) {
          continue;
        }
      }

      if (retryable &&
          attempt < retryDelays.length &&
          const {502, 503, 504}.contains(response.statusCode)) {
        await Future<void>.delayed(retryDelays[attempt++]);
        continue;
      }

      return _decode(response, requestId);
    }
  }

  Future<http.Response> _dispatch(
    String method,
    Uri uri, {
    Object? body,
    required Map<String, String> headers,
  }) {
    final encoded = body == null ? null : jsonEncode(body);
    return switch (method) {
      'GET' => _http.get(uri, headers: headers),
      'POST' => _http.post(uri, headers: headers, body: encoded),
      'PATCH' => _http.patch(uri, headers: headers, body: encoded),
      'DELETE' => _http.delete(uri, headers: headers, body: encoded),
      _ => throw ArgumentError.value(method, 'method'),
    };
  }

  Object? _decode(http.Response response, String requestId) {
    final status = response.statusCode;
    Object? json;
    var readable = true;

    if (response.bodyBytes.isNotEmpty) {
      try {
        json = jsonDecode(utf8.decode(response.bodyBytes));
      } on FormatException {
        readable = false;
      }
    }

    if (status >= 200 && status < 300) {
      if (response.bodyBytes.isEmpty) {
        return null;
      }
      if (json is Map<String, Object?> && json.containsKey('data')) {
        return json['data'];
      }
      throw ApiException(
        kind: ApiErrorKind.badResponse,
        statusCode: status,
        message: 'The server sent a response this app could not read.',
        requestId: requestId,
      );
    }

    final serverRequestId = json is Map<String, Object?>
        ? json['requestId']?.toString() ?? requestId
        : requestId;
    final error = json is Map<String, Object?> ? json['error'] : null;

    if (error is Map<String, Object?>) {
      final fields = <String, String>{};
      final details = error['details'];
      if (details is List) {
        for (final detail in details) {
          if (detail is Map<String, Object?> &&
              detail['field'] is String &&
              detail['message'] is String) {
            fields.putIfAbsent(
                detail['field']! as String, () => detail['message']! as String);
          }
        }
      }
      throw ApiException(
        kind: ApiErrorKind.http,
        statusCode: status,
        code: error['code']?.toString(),
        message: _friendlyMessage(status, error['message']?.toString()),
        fieldErrors: fields,
        requestId: serverRequestId,
      );
    }

    // Not the API talking: a tunnel or proxy error page, typically. 530 and
    // 1033-style pages are what Cloudflare returns when the tunnel is down.
    throw ApiException(
      kind: readable ? ApiErrorKind.http : ApiErrorKind.badResponse,
      statusCode: status,
      message: status >= 500
          ? 'The server is unavailable right now. Please try again shortly.'
          : _friendlyMessage(status, null),
      requestId: serverRequestId,
    );
  }

  String _friendlyMessage(int status, String? serverMessage) {
    if (status == 429) {
      return 'Too many requests. Please wait a moment and try again.';
    }
    if (status >= 500) {
      return 'Something went wrong on our side. Please try again.';
    }
    if (serverMessage != null && serverMessage.trim().isNotEmpty) {
      return serverMessage;
    }
    return switch (status) {
      401 => 'Please sign in to continue.',
      403 => "You don't have access to that.",
      404 => "That couldn't be found.",
      _ => 'The request could not be completed.',
    };
  }

  void close() => _http.close();
}
