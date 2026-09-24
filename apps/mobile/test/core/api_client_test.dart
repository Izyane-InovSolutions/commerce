import 'package:commerce_mobile/core/config/api_endpoint.dart';
import 'package:commerce_mobile/core/network/api_client.dart';
import 'package:commerce_mobile/core/network/api_exception.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import '../support/fake_api.dart';

class _Tokens implements AccessTokenSource {
  _Tokens(this.accessToken, {this.renewTo});

  @override
  String? accessToken;
  final String? renewTo;
  int renewals = 0;

  @override
  Future<bool> renewAccessToken(String rejectedToken) async {
    renewals++;
    if (renewTo == null) return false;
    accessToken = renewTo;
    return true;
  }
}

void main() {
  late FakeApi api;
  late ApiClient client;

  setUp(() {
    api = FakeApi();
    client = ApiClient(
      endpoint: ApiEndpoint.fixed(Uri.parse('https://api.example.test/api/v1')),
      httpClient: api.client,
      retryDelays: const [Duration.zero, Duration.zero],
    );
  });

  test('unwraps the {data, meta} envelope', () async {
    api.on('GET /health', (_) => FakeApi.ok({'status': 'ok'}));
    expect(await client.get('/health'), {'status': 'ok'});
  });

  test('joins paths under the versioned base and encodes the query', () async {
    api.on('GET /catalog/products', (_) => FakeApi.ok(<Object>[]));
    await client.get('/catalog/products',
        query: {'q': 'ear buds', 'page': 2, 'brandSlug': null, 'ids': ['a', 'b']});
    final url = api.requests.single.url;
    expect(url.path, '/api/v1/catalog/products');
    expect(url.queryParameters['q'], 'ear buds');
    expect(url.queryParameters['page'], '2');
    expect(url.queryParameters.containsKey('brandSlug'), isFalse);
    expect(url.queryParametersAll['ids'], ['a', 'b']);
  });

  test("decodes the API's error envelope, including field errors", () async {
    api.on('POST /auth/login', (_) => FakeApi.error(400, 'VALIDATION_ERROR',
        'The request is invalid', details: [
          {'field': 'email', 'message': 'email must be an email'},
        ]));

    final error = await client
        .post('/auth/login', body: {}, authenticated: false)
        .then<ApiException?>((_) => null, onError: (Object e) => e as ApiException);

    expect(error!.statusCode, 400);
    expect(error.code, 'VALIDATION_ERROR');
    expect(error.message, 'The request is invalid');
    expect(error.fieldErrors, {'email': 'email must be an email'});
    expect(error.requestId, 'req-err');
  });

  test('a non-JSON error page (a tunnel that is down) reads as unavailable',
      () async {
    api.on('POST /cart/items',
        (_) => http.Response('<html>Cloudflare Tunnel error</html>', 530));
    await expectLater(
      client.post('/cart/items', body: {}),
      throwsA(isA<ApiException>()
          .having((e) => e.kind, 'kind', ApiErrorKind.badResponse)
          .having((e) => e.message, 'message', contains('unavailable'))),
    );
  });

  test('sends a request id and passes custom headers through', () async {
    api.on('POST /checkout', (_) => FakeApi.ok({}));
    await client.post('/checkout', body: {}, headers: {'Idempotency-Key': 'key-1'});
    final headers = api.requests.single.headers;
    expect(headers['X-Request-Id'], isNotEmpty);
    expect(headers['Idempotency-Key'], 'key-1');
  });

  group('retries', () {
    test('a GET is retried through a transient 503', () async {
      var attempts = 0;
      api.on('GET /catalog/categories', (_) => ++attempts < 3
          ? http.Response('busy', 503)
          : FakeApi.ok(<Object>[]));
      expect(await client.get('/catalog/categories'), isEmpty);
      expect(attempts, 3);
    });

    test('a POST is never retried — it may already have been processed',
        () async {
      var attempts = 0;
      api.on('POST /checkout', (_) {
        attempts++;
        return http.Response('busy', 503);
      });
      await expectLater(client.post('/checkout', body: {}), throwsA(isA<ApiException>()));
      expect(attempts, 1);
    });

    test('a GET that cannot connect gives up as a network error', () async {
      api.on('GET /health', (_) => throw http.ClientException('connection refused'));
      await expectLater(
        client.get('/health'),
        throwsA(isA<ApiException>().having((e) => e.kind, 'kind', ApiErrorKind.network)),
      );
      expect(api.requests, hasLength(3)); // first try + two retries
    });
  });

  group('authentication', () {
    test('attaches the bearer token', () async {
      client.tokenSource = _Tokens('token-a');
      api.on('GET /cart', (_) => FakeApi.ok({}));
      await client.get('/cart');
      expect(api.requests.single.headers['Authorization'], 'Bearer token-a');
    });

    test('on a 401 renews once and retries with the new token', () async {
      final tokens = _Tokens('stale', renewTo: 'fresh');
      client.tokenSource = tokens;
      api.on('GET /cart', (request) =>
          request.headers['Authorization'] == 'Bearer fresh'
              ? FakeApi.ok({'items': <Object>[]})
              : FakeApi.error(401, 'UNAUTHORIZED', 'Token expired'));

      expect(await client.get('/cart'), {'items': <Object>[]});
      expect(tokens.renewals, 1);
      expect(api.requests, hasLength(2));
    });

    test('a renewal that fails surfaces the 401 rather than looping', () async {
      final tokens = _Tokens('stale');
      client.tokenSource = tokens;
      api.on('GET /cart', (_) => FakeApi.error(401, 'UNAUTHORIZED', 'Token expired'));

      await expectLater(client.get('/cart'),
          throwsA(isA<ApiException>().having((e) => e.isUnauthorized, '401', true)));
      expect(tokens.renewals, 1);
    });

    test('an anonymous request that gets a 401 does not try to renew', () async {
      final tokens = _Tokens(null, renewTo: 'fresh');
      client.tokenSource = tokens;
      api.on('GET /cart', (_) => FakeApi.error(401, 'UNAUTHORIZED', 'Sign in'));
      await expectLater(client.get('/cart'), throwsA(isA<ApiException>()));
      expect(tokens.renewals, 0);
    });
  });

  test('times out slow requests', () async {
    final slow = ApiClient(
      endpoint: ApiEndpoint.fixed(Uri.parse('https://api.example.test/api/v1')),
      httpClient: api.client,
      timeout: const Duration(milliseconds: 20),
      retryDelays: const [],
    );
    api.on('POST /checkout', (_) async {
      await Future<void>.delayed(const Duration(milliseconds: 200));
      return FakeApi.ok({});
    });
    await expectLater(
      slow.post('/checkout', body: {}),
      throwsA(isA<ApiException>().having((e) => e.kind, 'kind', ApiErrorKind.timeout)),
    );
  });
}
