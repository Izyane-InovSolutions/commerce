import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

typedef Handler = FutureOr<http.Response> Function(http.Request request);

/// A scripted Commerce API. Handlers are keyed `'METHOD /path'` (the path
/// after `/api/v1`), and every request is recorded for assertions.
class FakeApi {
  final Map<String, Handler> _handlers = {};
  final List<http.Request> requests = [];

  late final http.Client client = MockClient((request) async {
    requests.add(request);
    final path = request.url.path.replaceFirst(RegExp(r'^/api/v1'), '');
    final handler = _handlers['${request.method} $path'];
    if (handler == null) {
      return error(404, 'NOT_FOUND', 'No fake for ${request.method} $path');
    }
    return handler(request);
  });

  void on(String route, Handler handler) => _handlers[route] = handler;

  List<http.Request> calls(String route) {
    final parts = route.split(' ');
    return requests
        .where(
          (r) =>
              r.method == parts[0] &&
              r.url.path.replaceFirst(RegExp(r'^/api/v1'), '') == parts[1],
        )
        .toList();
  }

  static http.Response ok(Object? data, {int status = 200}) => http.Response(
    jsonEncode({
      'data': data,
      'meta': {'requestId': 'req-ok'},
    }),
    status,
    headers: {'content-type': 'application/json'},
  );

  static http.Response error(
    int status,
    String code,
    String message, {
    List<Map<String, String>> details = const [],
  }) => http.Response(
    jsonEncode({
      'error': {'code': code, 'message': message, 'details': details},
      'requestId': 'req-err',
    }),
    status,
    headers: {'content-type': 'application/json'},
  );

  static Map<String, Object?> body(http.Request request) =>
      jsonDecode(request.body) as Map<String, Object?>;
}

Map<String, Object?> sessionJson({
  String access = 'access-1',
  String refresh = 'refresh-1',
  String role = 'CUSTOMER',
}) => {
  'accessToken': access,
  'refreshToken': refresh,
  'tokenType': 'Bearer',
  'expiresIn': 900,
  'user': {'id': 'user-1', 'email': 'buyer@example.test', 'role': role},
};
