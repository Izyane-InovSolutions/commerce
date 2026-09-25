import 'dart:async';

import 'package:flutter/cupertino.dart' show CupertinoPage;
import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../core/config/app_config.dart';
import '../core/state/loader.dart';
import '../core/widgets/state_views.dart';
import '../design/design.dart';
import '../domain/account.dart';
import '../domain/checkout.dart';
import '../domain/seller_catalog.dart';
import '../domain/selling.dart';
import '../features/account/account_page.dart';
import '../features/account/address_form_page.dart';
import '../features/account/addresses_page.dart';
import '../features/account/profile_page.dart';
import '../features/auth/password_reset_page.dart';
import '../features/auth/register_page.dart';
import '../features/auth/session_controller.dart';
import '../features/auth/sign_in_page.dart';
import '../features/auth/startup_page.dart';
import '../features/cart/cart_page.dart';
import '../features/catalog/category_page.dart';
import '../features/catalog/product_page.dart';
import '../features/catalog/search_page.dart';
import '../features/checkout/checkout_page.dart';
import '../features/checkout/payment_status_page.dart';
import '../features/home/home_page.dart';
import '../features/orders/order_detail_page.dart';
import '../features/orders/orders_page.dart';
import '../features/selling/apply_page.dart';
import '../features/selling/earnings_page.dart';
import '../features/selling/listing_form_page.dart';
import '../features/selling/payouts_page.dart';
import '../features/selling/products_page.dart';
import '../features/selling/returns_page.dart';
import '../features/selling/reviews_page.dart';
import '../features/selling/storefront_page.dart';
import '../features/selling/listings_page.dart';
import '../features/selling/seller_orders_page.dart';
import '../features/selling/selling_page.dart';
import '../features/selling/stock_page.dart';
import '../features/settings/server_settings_page.dart';
import '../features/shop/storefront_page.dart' as shop;
import '../features/wishlist/wishlist_page.dart';
import 'services.dart';
import 'shell.dart';

/// Routes that need an account and redirect to sign-in without one.
///
/// The Cart and Selling tabs and the Account screen are deliberately not
/// here: they render a sign-in prompt in place, which is kinder than
/// bouncing someone to a form for tapping a tab.
const _protectedPrefixes = [
  '/checkout',
  '/wishlist',
  '/address',
  '/account/orders',
  '/account/addresses',
  '/account/profile',
  '/selling/orders',
  '/selling/listings',
  '/selling/stock',
  '/selling/earnings',
  '/selling/apply',
  '/selling/products',
  '/selling/returns',
  '/selling/reviews',
  '/selling/payouts',
  '/selling/storefront',
];

bool isProtectedLocation(String location) => _protectedPrefixes.any(
  (prefix) => location == prefix || location.startsWith('$prefix/'),
);

/// Only an in-app path is honoured as a post-sign-in destination. Once deep
/// links exist, `from` becomes attacker-reachable — the same open-redirect
/// shape fixed in the web apps' sign-in actions.
String? safeFrom(String? from) {
  if (from == null || from.isEmpty) return null;
  if (!from.startsWith('/') ||
      from.startsWith('//') ||
      from.startsWith('/\\')) {
    return null;
  }
  return from;
}

/// One page transition on every platform: the horizontal slide with an
/// edge-swipe back, borrowed from Cupertino because it shows where you came
/// from and lets a thumb go back without reaching for the top corner.
/// Android's system back and predictive-back gestures still pop the route.
Page<void> _page(GoRouterState state, Widget child) =>
    CupertinoPage<void>(key: state.pageKey, child: child);

String _encode(GoRouterState state) =>
    Uri.encodeComponent(state.uri.toString());

/// Tells the router to re-evaluate its redirects only on the session changes
/// that need one: leaving the startup gate, and a session ending while a
/// protected route is open.
///
/// Deliberately *not* on every session notification. A refresh makes
/// go_router re-parse the current location asynchronously and rebuild pushed
/// pages in place; if an auth page pops in the meantime, the re-parse lands
/// afterwards and puts it back, blank. So an interactive sign-in — which the
/// auth pages finish themselves — and token renewals, which change nothing
/// about where the user may be, are both filtered out.
class _SessionRouterRefresh extends ChangeNotifier {
  _SessionRouterRefresh(this._session) : _last = _session.status {
    _session.addListener(_changed);
  }

  final SessionController _session;
  SessionStatus _last;

  void _changed() {
    final previous = _last;
    final next = _session.status;
    _last = next;
    if (next == previous) return;
    if (previous == SessionStatus.signedOut && next == SessionStatus.signedIn) {
      return;
    }
    notifyListeners();
  }

  @override
  void dispose() {
    _session.removeListener(_changed);
    super.dispose();
  }
}

GoRouter buildRouter(
  AppServices services, {
  Duration splash = AppConfig.splashMinimum,
}) {
  final session = services.session;

  // The splash stays for at least [splash], however quickly the session
  // settles, so the wordmark is seen on every cold start.
  final splashShown = ValueNotifier(splash == Duration.zero);
  if (!splashShown.value) Timer(splash, () => splashShown.value = true);

  return GoRouter(
    initialLocation: '/',
    refreshListenable: Listenable.merge([
      _SessionRouterRefresh(session),
      splashShown,
    ]),
    redirect: (context, state) {
      final location = state.matchedLocation;
      final status = session.status;

      if (status == SessionStatus.restoring ||
          status == SessionStatus.unreachable ||
          !splashShown.value) {
        // Server settings stay reachable from the startup gate: a stale
        // tunnel hostname is the likeliest reason the gate is showing.
        if (location == '/startup' || location == '/settings/server') {
          return null;
        }
        return '/startup?from=${_encode(state)}';
      }
      if (location == '/startup') {
        return safeFrom(state.uri.queryParameters['from']) ?? '/';
      }

      // Leaving /sign-in and /register after success is the pages' own job
      // (see leaveAuthPage). A redirect here would fire on the sign-in
      // transition too, and go_router answers a redirect of a *pushed* route
      // by rebuilding it in place — leaving the user on a blank form.
      final signedIn = status == SessionStatus.signedIn;
      if (!signedIn && isProtectedLocation(location)) {
        return '/sign-in?from=${_encode(state)}';
      }
      return null;
    },
    routes: [
      GoRoute(
        path: '/startup',
        pageBuilder: (_, state) => _page(state, const StartupPage()),
      ),
      GoRoute(
        path: '/settings/server',
        pageBuilder: (_, state) => _page(state, const ServerSettingsPage()),
      ),
      GoRoute(
        path: '/sign-in',
        pageBuilder: (_, state) =>
            _page(state, SignInPage(from: state.uri.queryParameters['from'])),
      ),
      GoRoute(
        path: '/register',
        pageBuilder: (_, state) =>
            _page(state, RegisterPage(from: state.uri.queryParameters['from'])),
      ),
      GoRoute(
        path: '/password-reset',
        pageBuilder: (_, state) => _page(state, const PasswordResetPage()),
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => AppShell(shell: shell),
        branches: [
          StatefulShellBranch(
            routes: [
              // Account opens from the Shop screen's profile button, so its
              // pages stack on the Shop tab: they keep the dock and a real
              // back stack, and `go('/account/orders/:id')` from anywhere
              // (the payment screen) builds Shop → Account → Orders → Order
              // rather than an orphan screen with no way back.
              GoRoute(
                path: '/',
                pageBuilder: (_, state) => NoTransitionPage(
                  key: state.pageKey,
                  child: const HomePage(),
                ),
                routes: [
                  GoRoute(
                    path: 'account',
                    pageBuilder: (_, state) =>
                        _page(state, const AccountPage()),
                    routes: [
                      GoRoute(
                        path: 'orders',
                        pageBuilder: (_, state) =>
                            _page(state, const OrdersPage()),
                        routes: [
                          GoRoute(
                            path: ':id',
                            pageBuilder: (_, state) => _page(
                              state,
                              OrderDetailPage(
                                orderId: state.pathParameters['id']!,
                              ),
                            ),
                          ),
                        ],
                      ),
                      GoRoute(
                        path: 'profile',
                        pageBuilder: (_, state) =>
                            _page(state, const ProfilePage()),
                      ),
                      GoRoute(
                        path: 'addresses',
                        pageBuilder: (_, state) =>
                            _page(state, const AddressesPage()),
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/search',
                pageBuilder: (_, state) => NoTransitionPage(
                  key: state.pageKey,
                  child: SearchPage(query: state.uri.queryParameters['q']),
                ),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/cart',
                pageBuilder: (_, state) => NoTransitionPage(
                  key: state.pageKey,
                  child: const CartPage(),
                ),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/selling',
                pageBuilder: (_, state) => NoTransitionPage(
                  key: state.pageKey,
                  child: const SellingPage(),
                ),
                routes: [
                  GoRoute(
                    path: 'orders',
                    pageBuilder: (_, state) =>
                        _page(state, const SellerOrdersPage()),
                    routes: [
                      GoRoute(
                        path: ':id',
                        pageBuilder: (_, state) => _page(
                          state,
                          SellerOrderPage(id: state.pathParameters['id']!),
                        ),
                      ),
                    ],
                  ),
                  GoRoute(
                    path: 'apply',
                    pageBuilder: (_, state) => _page(
                      state,
                      ApplyPage(
                        rejected: state.extra is SellerAccount
                            ? state.extra! as SellerAccount
                            : null,
                      ),
                    ),
                  ),
                  GoRoute(
                    path: 'listings',
                    pageBuilder: (_, state) =>
                        _page(state, const ListingsPage()),
                    routes: [
                      GoRoute(
                        path: 'new',
                        pageBuilder: (_, state) => _page(
                          state,
                          ListingFormPage(
                            product: state.extra is CatalogProduct
                                ? state.extra! as CatalogProduct
                                : null,
                          ),
                        ),
                      ),
                      GoRoute(
                        path: 'edit',
                        // Needs the listing in hand; without it (a restored
                        // route) there is nothing to edit, so start a new one.
                        pageBuilder: (_, state) => _page(
                          state,
                          ListingFormPage(
                            listing: state.extra is Listing
                                ? state.extra! as Listing
                                : null,
                          ),
                        ),
                      ),
                    ],
                  ),
                  GoRoute(
                    path: 'products',
                    pageBuilder: (_, state) =>
                        _page(state, const ProductsPage()),
                    routes: [
                      GoRoute(
                        path: 'new',
                        pageBuilder: (_, state) =>
                            _page(state, const SubmitProductPage()),
                      ),
                      GoRoute(
                        path: ':id',
                        pageBuilder: (_, state) => _page(
                          state,
                          SubmissionPage(id: state.pathParameters['id']!),
                        ),
                      ),
                    ],
                  ),
                  GoRoute(
                    path: 'returns',
                    pageBuilder: (_, state) =>
                        _page(state, const ReturnsPage()),
                  ),
                  GoRoute(
                    path: 'reviews',
                    pageBuilder: (_, state) =>
                        _page(state, const ReviewsPage()),
                  ),
                  GoRoute(
                    path: 'payouts',
                    pageBuilder: (_, state) =>
                        _page(state, const PayoutsPage()),
                  ),
                  GoRoute(
                    path: 'storefront',
                    redirect: (_, state) =>
                        state.extra is SellerAccount ? null : '/selling',
                    pageBuilder: (_, state) => _page(
                      state,
                      StorefrontPage(account: state.extra! as SellerAccount),
                    ),
                  ),
                  GoRoute(
                    path: 'stock',
                    pageBuilder: (_, state) => _page(state, const StockPage()),
                  ),
                  GoRoute(
                    path: 'earnings',
                    pageBuilder: (_, state) =>
                        _page(state, const EarningsPage()),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
      GoRoute(
        path: '/category/:slug',
        pageBuilder: (_, state) => _page(
          state,
          CategoryPage(
            slug: state.pathParameters['slug']!,
            title: state.extra is String ? state.extra! as String : null,
          ),
        ),
      ),
      GoRoute(
        path: '/product/:slug',
        pageBuilder: (_, state) =>
            _page(state, ProductPage(slug: state.pathParameters['slug']!)),
      ),
      GoRoute(
        path: '/seller/:slug',
        pageBuilder: (_, state) => _page(
          state,
          shop.StorefrontPage(
            slug: state.pathParameters['slug']!,
            name: state.extra is String ? state.extra! as String : null,
          ),
        ),
      ),
      GoRoute(
        path: '/wishlist',
        pageBuilder: (_, state) => _page(state, const WishlistPage()),
      ),
      GoRoute(
        path: '/checkout',
        pageBuilder: (_, state) => _page(state, const CheckoutPage()),
      ),
      GoRoute(
        path: '/checkout/payment/:paymentId',
        pageBuilder: (_, state) => _page(
          state,
          PaymentStatusPage(
            paymentId: state.pathParameters['paymentId']!,
            orderId: state.uri.queryParameters['order'],
            method: state.uri.queryParameters['method'] == 'card'
                ? PaymentMethod.card
                : PaymentMethod.mobileMoney,
          ),
        ),
      ),
      // The address form covers the screen, as a form should, and is reached
      // both from the address book and from checkout — which awaits the
      // saved address it pops with.
      GoRoute(
        path: '/address/new',
        pageBuilder: (_, state) => _page(state, const AddressFormPage()),
      ),
      GoRoute(
        path: '/address/:id',
        pageBuilder: (_, state) => _page(
          state,
          state.extra is Address
              ? AddressFormPage(address: state.extra! as Address)
              : _AddressById(id: state.pathParameters['id']!),
        ),
      ),
    ],
  );
}

/// Opening an address edit without the address in hand — a restored route,
/// later a deep link — looks it up rather than failing.
class _AddressById extends StatefulWidget {
  const _AddressById({required this.id});

  final String id;

  @override
  State<_AddressById> createState() => _AddressByIdState();
}

class _AddressByIdState extends State<_AddressById> {
  late final Loader<List<Address>> _addresses;
  bool _initialised = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialised) return;
    _initialised = true;
    _addresses = Loader(context.services.account.addresses);
  }

  @override
  void dispose() {
    _addresses.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return LoaderView(
      loader: _addresses,
      builder: (context, addresses) {
        final match = addresses.where((a) => a.id == widget.id).firstOrNull;
        if (match == null) {
          return const PageScaffold(
            title: 'Address',
            body: EmptyState(
              icon: Glyphs.pinOff,
              title: 'This address no longer exists',
            ),
          );
        }
        return AddressFormPage(address: match);
      },
    );
  }
}
