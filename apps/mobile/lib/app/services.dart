import 'package:flutter/widgets.dart';
import 'package:http/http.dart' as http;

import '../core/config/api_endpoint.dart';
import '../core/files/file_source.dart';
import '../core/network/api_client.dart';
import '../core/storage/key_value_store.dart';
import '../core/storage/secure_token_store.dart';
import '../data/auth_repository.dart';
import '../data/catalog_repository.dart';
import '../data/commerce_repositories.dart';
import '../data/media_repository.dart';
import '../data/selling_repository.dart';
import '../features/auth/session_controller.dart';
import '../features/cart/cart_controller.dart';
import '../features/shop/browsing_history.dart';
import '../features/wishlist/wishlist_controller.dart';

/// Everything the app is wired from, built once at launch.
///
/// Plain constructor injection behind one [InheritedWidget] — the
/// architecture doc asks for ChangeNotifier-level state to start with, and
/// this is enough to keep screens off the network while staying swappable in
/// tests.
class AppServices {
  AppServices._({
    required this.endpoint,
    required this.api,
    required this.session,
    required this.auth,
    required this.catalog,
    required this.carts,
    required this.wishlists,
    required this.account,
    required this.checkout,
    required this.orders,
    required this.selling,
    required this.media,
    required this.files,
    required this.cart,
    required this.wishlist,
    required this.history,
  });

  static Future<AppServices> create({
    KeyValueStore store = const SecureKeyValueStore(),
    http.Client? httpClient,
    FileSource files = const PlatformFileSource(),
  }) async {
    final endpoint = await ApiEndpoint.load(store);
    final api = ApiClient(endpoint: endpoint, httpClient: httpClient);
    final auth = AuthRepository(api);
    final session = SessionController(
      auth: auth,
      tokens: SecureTokenStore(store),
    );
    api.tokenSource = session;

    final catalog = CatalogRepository(api);
    final carts = CartRepository(api);
    final wishlists = WishlistRepository(api);

    final services = AppServices._(
      endpoint: endpoint,
      api: api,
      session: session,
      auth: auth,
      catalog: catalog,
      carts: carts,
      wishlists: wishlists,
      account: AccountRepository(api),
      checkout: CheckoutRepository(api),
      orders: OrderRepository(api),
      selling: SellingRepository(api),
      media: MediaRepository(api),
      files: files,
      cart: CartController(carts: carts, catalog: catalog, session: session),
      wishlist: WishlistController(
        wishlist: wishlists,
        catalog: catalog,
        session: session,
      ),
      history: BrowsingHistory(store: store, session: session),
    );
    await services.history.load();

    // Tokens minted by one backend are meaningless to another, so repointing
    // the app drops the session rather than sending them somewhere new.
    endpoint.addListener(() {
      session.forget();
      services.catalog.clearCache();
      services.selling.clearCache();
    });
    return services;
  }

  final ApiEndpoint endpoint;
  final ApiClient api;
  final SessionController session;
  final AuthRepository auth;
  final CatalogRepository catalog;
  final CartRepository carts;
  final WishlistRepository wishlists;
  final AccountRepository account;
  final CheckoutRepository checkout;
  final OrderRepository orders;
  final SellingRepository selling;
  final MediaRepository media;
  final FileSource files;
  final CartController cart;
  final WishlistController wishlist;
  final BrowsingHistory history;
}

class AppScope extends InheritedWidget {
  const AppScope({super.key, required this.services, required super.child});

  final AppServices services;

  static AppServices of(BuildContext context) {
    final scope = context.getInheritedWidgetOfExactType<AppScope>();
    assert(scope != null, 'AppScope is missing above this widget');
    return scope!.services;
  }

  @override
  bool updateShouldNotify(AppScope oldWidget) => services != oldWidget.services;
}

extension AppServicesContext on BuildContext {
  AppServices get services => AppScope.of(this);
}
