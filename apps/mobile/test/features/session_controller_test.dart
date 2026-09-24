import 'package:commerce_mobile/core/config/api_endpoint.dart';
import 'package:commerce_mobile/core/network/api_client.dart';
import 'package:commerce_mobile/core/storage/key_value_store.dart';
import 'package:commerce_mobile/core/storage/secure_token_store.dart';
import 'package:commerce_mobile/data/auth_repository.dart';
import 'package:commerce_mobile/features/auth/session_controller.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import '../support/fake_api.dart';

const _refreshKey = 'commerce.refresh_token';

/// The server's refresh contract as observed against the real API: every
/// refresh rotates the token, and presenting a spent one is treated as theft
/// and revokes the whole family — including the token that replaced it.
class _RotatingRefresh {
  _RotatingRefresh(String initial, {int generation = 1})
    : _valid = {initial},
      _counter = generation;

  final Set<String> _valid;
  final Set<String> _spent = {};
  int _counter;

  /// The access token most recently issued.
  String? latestAccess;
  bool revoked = false;
  Duration latency = Duration.zero;

  Future<http.Response> call(http.Request request) async {
    await Future<void>.delayed(latency);
    final token = FakeApi.body(request)['refreshToken'] as String;
    if (_spent.contains(token)) {
      revoked = true;
      _valid.clear();
      return FakeApi.error(
        401,
        'UNAUTHORIZED',
        'Refresh token has already been used',
      );
    }
    if (revoked || !_valid.remove(token)) {
      return FakeApi.error(401, 'UNAUTHORIZED', 'Invalid refresh token');
    }
    _spent.add(token);
    _counter++;
    final next = 'refresh-$_counter';
    _valid.add(next);
    latestAccess = 'access-$_counter';
    return FakeApi.ok(sessionJson(access: latestAccess!, refresh: next));
  }
}

void main() {
  late FakeApi api;
  late MemoryKeyValueStore store;
  late ApiClient client;
  late SessionController session;

  setUp(() {
    api = FakeApi();
    store = MemoryKeyValueStore();
    client = ApiClient(
      endpoint: ApiEndpoint.fixed(Uri.parse('https://api.example.test/api/v1')),
      httpClient: api.client,
      retryDelays: const [],
    );
    session = SessionController(
      auth: AuthRepository(client),
      tokens: SecureTokenStore(store),
    );
    client.tokenSource = session;
  });

  group('restore', () {
    test('with nothing stored is signed out', () async {
      await session.restore();
      expect(session.status, SessionStatus.signedOut);
      expect(api.requests, isEmpty);
    });

    test('resumes a stored session and persists the rotated token', () async {
      store.values[_refreshKey] = 'refresh-1';
      api.on('POST /auth/refresh', _RotatingRefresh('refresh-1').call);

      await session.restore();

      expect(session.status, SessionStatus.signedIn);
      expect(session.user!.email, 'buyer@example.test');
      expect(session.accessToken, 'access-2');
      // The old token is dead the moment the server replies; the new one
      // must already be on disk.
      expect(store.values[_refreshKey], 'refresh-2');
    });

    test('a refused token signs out and is removed from storage', () async {
      store.values[_refreshKey] = 'revoked';
      api.on('POST /auth/refresh', _RotatingRefresh('something-else').call);

      await session.restore();

      expect(session.status, SessionStatus.signedOut);
      expect(store.values.containsKey(_refreshKey), isFalse);
    });

    test('an unreachable server keeps the token and offers a retry', () async {
      store.values[_refreshKey] = 'refresh-1';
      api.on(
        'POST /auth/refresh',
        (_) => throw http.ClientException('offline'),
      );

      await session.restore();

      expect(session.status, SessionStatus.unreachable);
      expect(
        store.values[_refreshKey],
        'refresh-1',
        reason: 'being offline says nothing about whether the session is valid',
      );
    });
  });

  group('renewal', () {
    setUp(() async {
      store.values[_refreshKey] = 'refresh-1';
      api.on('POST /auth/refresh', _RotatingRefresh('refresh-1').call);
      await session.restore(); // now signed in with access-2 / refresh-2
      api.requests.clear();
    });

    test(
      'concurrent 401s share ONE refresh — two would revoke the session',
      () async {
        final refresh = _RotatingRefresh('refresh-2', generation: 2)
          ..latency = const Duration(milliseconds: 30);
        api.on('POST /auth/refresh', refresh.call);
        // The current access token (access-2) has expired server-side: every
        // data request rejects anything but a token issued after this point.
        api.on(
          'GET /cart',
          (r) =>
              refresh.latestAccess != null &&
                  r.headers['Authorization'] == 'Bearer ${refresh.latestAccess}'
              ? FakeApi.ok({'items': <Object>[]})
              : FakeApi.error(401, 'UNAUTHORIZED', 'Token expired'),
        );

        final results = await Future.wait([
          client.get('/cart'),
          client.get('/cart'),
          client.get('/cart'),
          client.get('/cart'),
        ]);

        expect(results, everyElement({'items': <Object>[]}));
        expect(api.calls('POST /auth/refresh'), hasLength(1));
        expect(refresh.revoked, isFalse);
        expect(session.status, SessionStatus.signedIn);
        expect(store.values[_refreshKey], 'refresh-3');
      },
    );

    test(
      'a request rejected with an already-replaced token just retries',
      () async {
        // The session is on access-2. A request that went out with an older
        // token and came back 401 must not spend another rotation.
        expect(await session.renewAccessToken('access-1'), isTrue);
        expect(api.calls('POST /auth/refresh'), isEmpty);
      },
    );

    test(
      'a refused refresh ends the session and flags it as expired',
      () async {
        api.on(
          'POST /auth/refresh',
          (_) => FakeApi.error(
            401,
            'UNAUTHORIZED',
            'Refresh token has already been used',
          ),
        );

        expect(await session.renewAccessToken('access-2'), isFalse);
        expect(session.status, SessionStatus.signedOut);
        expect(session.takeExpiredNotice(), isTrue);
        expect(session.takeExpiredNotice(), isFalse, reason: 'reported once');
        expect(store.values.containsKey(_refreshKey), isFalse);
      },
    );

    test('a refresh that cannot reach the server keeps the session', () async {
      api.on(
        'POST /auth/refresh',
        (_) => throw http.ClientException('offline'),
      );
      expect(await session.renewAccessToken('access-2'), isFalse);
      expect(session.status, SessionStatus.signedIn);
      expect(store.values[_refreshKey], 'refresh-2');
    });
  });

  group('sign in and out', () {
    test('sign-in stores only the refresh token', () async {
      api.on(
        'POST /auth/login',
        (_) => FakeApi.ok(sessionJson(access: 'a-login', refresh: 'r-login')),
      );
      await session.signIn('buyer@example.test', 'correct horse');

      expect(session.isSignedIn, isTrue);
      expect(store.values, {
        _refreshKey: 'r-login',
      }, reason: 'the access token stays in memory');
    });

    test(
      'sign-out revokes on the server while still authorised, then clears',
      () async {
        api.on(
          'POST /auth/login',
          (_) => FakeApi.ok(sessionJson(access: 'a-login', refresh: 'r-login')),
        );
        api.on('POST /auth/logout', (_) => http.Response('', 204));
        await session.signIn('buyer@example.test', 'correct horse');

        await session.signOut();

        final logout = api.calls('POST /auth/logout').single;
        // /auth/logout is not @Public on the API; it needs the bearer token.
        expect(logout.headers['Authorization'], 'Bearer a-login');
        expect(FakeApi.body(logout)['refreshToken'], 'r-login');
        expect(session.status, SessionStatus.signedOut);
        expect(store.values, isEmpty);
      },
    );

    test(
      'sign-out still completes locally if the server is unreachable',
      () async {
        api.on('POST /auth/login', (_) => FakeApi.ok(sessionJson()));
        api.on(
          'POST /auth/logout',
          (_) => throw http.ClientException('offline'),
        );
        await session.signIn('buyer@example.test', 'correct horse');

        await session.signOut();
        expect(session.status, SessionStatus.signedOut);
        expect(store.values, isEmpty);
      },
    );
  });
}
