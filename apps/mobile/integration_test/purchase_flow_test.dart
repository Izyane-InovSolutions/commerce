// End-to-end against a REAL Commerce API — whatever the build's default base
// URL points at (see AppConfig), or COMMERCE_API_BASE_URL if given.
//
//   flutter test integration_test/purchase_flow_test.dart -d <device>
//
// It registers a throwaway account and places a real order, so point it only
// at a test environment whose payment gateway is a sandbox.
import 'package:commerce_mobile/app/app.dart';
import 'package:commerce_mobile/app/services.dart';
import 'package:commerce_mobile/core/storage/key_value_store.dart';
import 'package:commerce_mobile/design/design.dart';
import 'package:commerce_mobile/features/catalog/search_page.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

/// Pumps until [finder] matches, for screens waiting on the real network —
/// where pumpAndSettle would spin forever on progress indicators.
Future<void> pumpUntil(
  WidgetTester tester,
  Finder finder, {
  Duration timeout = const Duration(seconds: 45),
}) async {
  final deadline = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(deadline)) {
    await tester.pump(const Duration(milliseconds: 200));
    if (finder.evaluate().isNotEmpty) return;
  }
  throw TestFailure('Timed out waiting for $finder');
}

/// Lets transitions finish and holds the screen long enough to be captured.
Future<void> linger(WidgetTester tester) async {
  for (var i = 0; i < 12; i++) {
    await tester.pump(const Duration(milliseconds: 150));
  }
}

Future<void> tapWhenVisible(WidgetTester tester, Finder finder) async {
  await pumpUntil(tester, finder);
  await tester.ensureVisible(finder.first);
  await tester.pump(const Duration(milliseconds: 300));
  await tester.tap(finder.first);
  await tester.pump(const Duration(milliseconds: 300));
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('a new customer can buy something end to end', (tester) async {
    // A fresh in-memory store: no keychain residue from other runs.
    final services = await AppServices.create(store: MemoryKeyValueStore());
    await tester.pumpWidget(CommerceApp(services: services));
    await services.session.restore();

    // Storefront loads from the live API.
    await pumpUntil(tester, find.text('New arrivals'));
    await pumpUntil(tester, find.bySemanticsLabel(RegExp(r'^Laptop, K')));
    await linger(tester);

    // Create an account from the Account tab.
    await tester.tap(find.text('Account'));
    await linger(tester);
    await tapWhenVisible(
      tester,
      find.widgetWithText(Button, 'Create an account'),
    );
    await linger(tester);
    final email =
        'mobile-e2e-${DateTime.now().millisecondsSinceEpoch}@example.test';
    Finder field(String label) => find.widgetWithText(InputFormField, label);
    await pumpUntil(tester, field('Email'));
    await tester.enterText(field('Email'), email);
    await tester.enterText(field('Password'), 'MobileE2e123!');
    await tester.enterText(field('Confirm password'), 'MobileE2e123!');
    await tapWhenVisible(tester, find.widgetWithText(Button, 'Create account'));
    // Not find.text(email): the email is already on screen, in the form's
    // own field. The signed-in Account screen is the real signal.
    await pumpUntil(tester, find.widgetWithText(ListRow, 'Sign out'));
    expect(services.session.isSignedIn, isTrue);
    await linger(tester);

    // Find a product through search.
    await tester.tap(find.text('Search'));
    await pumpUntil(tester, find.byKey(SearchPage.fieldKey));
    await tester.enterText(find.byKey(SearchPage.fieldKey), 'Aria');
    await pumpUntil(tester, find.text('1 product'));
    await linger(tester);
    await tapWhenVisible(tester, find.text('Aria Wireless Earbuds'));
    await linger(tester);

    // Add it to the cart.
    await tapWhenVisible(tester, find.widgetWithText(Button, 'Add to cart'));
    await pumpUntil(tester, find.text('Added to your cart'));
    expect(services.cart.itemCount, 1);
    await linger(tester);

    // Cart → checkout.
    await tester.tap(find.bySemanticsLabel('Back').last);
    await linger(tester);
    await tester.tap(find.text('Cart'));
    await linger(tester);
    await tapWhenVisible(tester, find.widgetWithText(Button, 'Check out'));
    await linger(tester);

    // A brand-new account has no address yet: add one from checkout.
    await tapWhenVisible(
      tester,
      find.widgetWithText(ListRow, 'Add an address'),
    );
    await pumpUntil(tester, find.text('New address'));
    await tester.enterText(field('Full name'), 'E2E Buyer');
    await tester.enterText(field('Phone (optional)'), '0971234567');
    await tester.enterText(field('Address line 1'), 'Plot 12 Cairo Rd');
    await tester.enterText(field('City'), 'Lusaka');
    await tester.enterText(field('Postal code'), '10101');
    await linger(tester);
    await tapWhenVisible(tester, find.widgetWithText(Button, 'Save address'));

    // Back on checkout: the server's quote arrives and the mobile money
    // number is pre-filled from the address.
    await pumpUntil(tester, find.text('Summary'));
    // Let the address form finish sliding away before counting what is shown.
    await linger(tester);
    expect(find.text('New address'), findsNothing);
    expect(find.text('E2E Buyer'), findsOneWidget);
    final pay = find.widgetWithText(Button, 'Pay with MTN MoMo');
    await pumpUntil(tester, pay);
    await linger(tester);

    // Place the order; the sandbox gateway approves mobile money by itself.
    await tapWhenVisible(tester, pay);
    await pumpUntil(
      tester,
      find.text('Payment received'),
      timeout: const Duration(seconds: 90),
    );
    expect(services.cart.itemCount, 0, reason: 'checkout empties the cart');
    await linger(tester);

    // The order is there, and it is paid according to the API.
    await tapWhenVisible(tester, find.widgetWithText(Button, 'View order'));
    await pumpUntil(tester, find.text('Aria Wireless Earbuds'));
    expect(find.text('Payment received'), findsOneWidget);
    // The item row is one screen-reader stop that includes its price.
    expect(find.bySemanticsLabel(RegExp(r'K220\.00')), findsWidgets);
    await linger(tester);

    // The payment screen replaced the whole stack to get here; there must
    // still be a way back — to the order list, inside the Account tab.
    await tester.tap(find.bySemanticsLabel('Back').last);
    await pumpUntil(tester, find.text('Orders'));
    await pumpUntil(
      tester,
      find.bySemanticsLabel(RegExp(r'^Order [0-9A-F]{8}, ')),
    );
    await linger(tester);
    await linger(tester);
  });
}
