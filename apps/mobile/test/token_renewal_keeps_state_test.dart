import 'package:commerce_mobile/core/storage/key_value_store.dart';
import 'package:commerce_mobile/design/design.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'app_smoke_test.dart' show boot;
import 'support/fake_api.dart';

void main() {
  testWidgets(
    'a background token renewal does not wipe a form the user is filling in',
    (tester) async {
      final store = MemoryKeyValueStore()
        ..values['commerce.refresh_token'] = 'refresh-1';
      var generation = 1;
      final (services, api) = await boot(
        tester,
        store: store,
        configure: (api) {
          api.on('POST /auth/refresh', (_) {
            generation++;
            return FakeApi.ok(
              sessionJson(
                access: 'access-$generation',
                refresh: 'refresh-$generation',
              ),
            );
          });
          api.on(
            'GET /cart',
            (_) => FakeApi.ok({'items': <Object>[], 'subtotal': 0}),
          );
          api.on('GET /wishlist', (_) => FakeApi.ok(<Object>[]));
        },
      );
      expect(services.session.isSignedIn, isTrue);

      GoRouter.of(
        tester.element(find.byType(PageScaffold).first),
      ).push('/address/new');
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(InputFormField, 'Full name'),
        'Half-typed Name',
      );

      // Fifteen minutes later the access token expires and is renewed.
      expect(
        await services.session.renewAccessToken(services.session.accessToken!),
        isTrue,
      );
      await tester.pumpAndSettle();

      expect(
        find.text('Half-typed Name'),
        findsOneWidget,
        reason:
            'renewing a token is not an auth change and must not rebuild pages',
      );
    },
  );

  testWidgets(
    'a session that ends while on a protected page sends the user to sign in',
    (tester) async {
      final store = MemoryKeyValueStore()
        ..values['commerce.refresh_token'] = 'refresh-1';
      var refused = false;
      final (services, api) = await boot(
        tester,
        store: store,
        configure: (api) {
          api.on(
            'POST /auth/refresh',
            (_) => refused
                ? FakeApi.error(
                    401,
                    'UNAUTHORIZED',
                    'Refresh token has already been used',
                  )
                : FakeApi.ok(
                    sessionJson(access: 'access-2', refresh: 'refresh-2'),
                  ),
          );
          api.on(
            'GET /cart',
            (_) => FakeApi.ok({'items': <Object>[], 'subtotal': 0}),
          );
          api.on('GET /wishlist', (_) => FakeApi.ok(<Object>[]));
          api.on('GET /users/me/addresses', (_) => FakeApi.ok(<Object>[]));
        },
      );

      GoRouter.of(
        tester.element(find.byType(PageScaffold).first),
      ).go('/account/addresses');
      await tester.pumpAndSettle();
      expect(find.text('No saved addresses'), findsOneWidget);

      // The server revokes the session (say, it was used from another device).
      refused = true;
      expect(await services.session.renewAccessToken('access-2'), isFalse);
      await tester.pumpAndSettle();

      expect(
        find.text('Your cart, orders and saved items are waiting.'),
        findsOneWidget,
      );
      expect(
        find.text('Your session has ended. Sign in again to continue.'),
        findsOneWidget,
      );
    },
  );
}
