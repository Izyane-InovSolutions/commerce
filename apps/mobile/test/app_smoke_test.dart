import 'dart:convert';
import 'dart:io';

import 'package:commerce_mobile/app/app.dart';
import 'package:commerce_mobile/app/services.dart';
import 'package:commerce_mobile/core/storage/key_value_store.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fake_api.dart';

/// Boots the real app — router, services, session restore — against a
/// scripted API, the way `main()` does.
Future<(AppServices, FakeApi)> boot(WidgetTester tester,
    {MemoryKeyValueStore? store, void Function(FakeApi api)? configure}) async {
  // A phone, not the default 800×600 test surface.
  tester.view.physicalSize = const Size(1170, 2532);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);

  final api = FakeApi();
  final page = jsonDecode(File('test/fixtures/product_page.json').readAsStringSync());
  final product = (page['data'] as List).first;
  // Pages like the real API: the fixture is page 1; later pages are empty.
  api.on('GET /catalog/products', (request) {
    final number = int.parse(request.url.queryParameters['page'] ?? '1');
    if (number == 1) return FakeApi.ok(page);
    return FakeApi.ok({
      'data': <Object>[],
      'meta': {'page': number, 'limit': 20, 'total': 2},
    });
  });
  api.on('GET /catalog/products/laptop-computer', (_) => FakeApi.ok(product));
  api.on('GET /catalog/categories', (_) => FakeApi.ok([
        {'id': 'c1', 'name': 'Electronics', 'slug': 'electronics', 'position': 0},
      ]));
  api.on('GET /catalog/brands', (_) => FakeApi.ok(<Object>[]));
  configure?.call(api);

  final services = await AppServices.create(
      store: store ?? MemoryKeyValueStore(), httpClient: api.client);
  await tester.pumpWidget(CommerceApp(services: services));
  await services.session.restore();
  await tester.pumpAndSettle();
  return (services, api);
}

void main() {
  testWidgets('a signed-out visitor lands on the storefront with products',
      (tester) async {
    await boot(tester);

    expect(find.text('Commerce'), findsOneWidget);
    expect(find.text('New arrivals'), findsOneWidget);
    expect(find.text('Electronics'), findsOneWidget);
    expect(find.text('Laptop'), findsOneWidget);
    expect(find.text('K4,500.00'), findsOneWidget);
  });

  testWidgets('opening a product shows its price and the add-to-cart action',
      (tester) async {
    await boot(tester);

    await tester.tap(find.text('Laptop'));
    await tester.pumpAndSettle();

    expect(find.text('Add to cart'), findsOneWidget);
    expect(find.text('Sold by Zawadi'), findsOneWidget);
  });

  testWidgets('adding to cart while signed out asks to sign in first',
      (tester) async {
    await boot(tester);
    await tester.tap(find.text('Laptop'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Add to cart'));
    await tester.pumpAndSettle();

    expect(find.text('Welcome back'), findsOneWidget);
  });

  testWidgets('the cart tab explains itself instead of bouncing to sign-in',
      (tester) async {
    await boot(tester);

    await tester.tap(find.byIcon(Icons.shopping_cart_outlined));
    await tester.pumpAndSettle();

    expect(find.text('Your cart lives in your account'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Sign in'), findsOneWidget);
  });

  testWidgets('a protected route redirects to sign-in and back after it',
      (tester) async {
    final (services, api) = await boot(tester);
    api.on('POST /auth/login', (_) => FakeApi.ok(sessionJson()));
    api.on('GET /cart', (_) => FakeApi.ok({'items': <Object>[], 'subtotal': 0, 'currency': 'ZMW'}));
    api.on('GET /wishlist', (_) => FakeApi.ok(<Object>[]));
    api.on('GET /orders', (_) => FakeApi.ok(<Object>[]));

    await tester.tap(find.byIcon(Icons.person_outline));
    await tester.pumpAndSettle();
    expect(find.text('Your account'), findsOneWidget);

    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextFormField, 'Email'), 'buyer@example.test');
    await tester.enterText(find.widgetWithText(TextFormField, 'Password'), 'correct horse');
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await tester.pumpAndSettle();

    expect(services.session.isSignedIn, isTrue);
    // Back where they started, now showing the signed-in account.
    expect(find.text('buyer@example.test'), findsOneWidget);
    expect(find.text('Orders'), findsOneWidget);

    await tester.tap(find.text('Orders'));
    await tester.pumpAndSettle();
    expect(find.text('No orders yet'), findsOneWidget);
  });

  testWidgets('an unreachable server at launch offers retry and settings',
      (tester) async {
    final store = MemoryKeyValueStore()..values['commerce.refresh_token'] = 'stored';
    final api = FakeApi();
    api.on('POST /auth/refresh', (_) => throw const SocketException('offline'));
    final services = await AppServices.create(store: store, httpClient: api.client);

    await tester.pumpWidget(CommerceApp(services: services));
    await services.session.restore();
    await tester.pumpAndSettle();

    expect(find.text('Try again'), findsOneWidget);
    expect(find.text('Server settings'), findsOneWidget);
    expect(store.values['commerce.refresh_token'], 'stored');
  });
}
