import 'package:flutter/cupertino.dart' show CupertinoPage;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart' show Icons, MaterialPage;
import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../core/state/loader.dart';
import '../core/widgets/state_views.dart';
import '../design/design.dart';
import '../domain/account.dart';
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
import '../features/settings/server_settings_page.dart';
import '../features/wishlist/wishlist_page.dart';
import 'services.dart';
import 'shell.dart';

/// Routes that need an account and redirect to sign-in without one.
///
/// The Cart and Account *tabs* are deliberately not here: they render a
/// sign-in prompt in place, which is kinder than bouncing someone to a form
/// for tapping a tab.
const _protectedPrefixes = [
  '/checkout',
  '/wishlist',
  '/address',
  '/account/orders',
  '/account/addresses',
  '/account/profile',
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

/// Each platform's own page transition: Cupertino's slide with the
/// edge-swipe back gesture on Apple platforms, Material's elsewhere. Navigation
/// feel is muscle memory, so it is borrowed rather than reinvented.
Page<void> _page(GoRouterState state, Widget child) {
  final apple =
      defaultTargetPlatform == TargetPlatform.iOS ||
      defaultTargetPlatform == TargetPlatform.macOS;
  return apple
      ? CupertinoPage<void>(key: state.pageKey, child: child)
      : MaterialPage<void>(key: state.pageKey, child: child);
}

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

GoRouter buildRouter(AppServices services) {
  final session = services.session;

  return GoRouter(
    initialLocation: '/',
    refreshListenable: _SessionRouterRefresh(session),
    redirect: (context, state) {
      final location = state.matchedLocation;
      final status = session.status;

      if (status == SessionStatus.restoring ||
          status == SessionStatus.unreachable) {
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
              GoRoute(
                path: '/',
                pageBuilder: (_, state) => NoTransitionPage(
                  key: state.pageKey,
                  child: const HomePage(),
                ),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/search',
                pageBuilder: (_, state) => NoTransitionPage(
                  key: state.pageKey,
                  child: const SearchPage(),
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
          // Account pages live inside the Account tab, so they keep the tab
          // bar and a real back stack — and `go('/account/orders/:id')` from
          // anywhere (the payment screen) builds Account → Orders → Order
          // rather than an orphan screen with no way back.
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/account',
                pageBuilder: (_, state) => NoTransitionPage(
                  key: state.pageKey,
                  child: const AccountPage(),
                ),
                routes: [
                  GoRoute(
                    path: 'orders',
                    pageBuilder: (_, state) => _page(state, const OrdersPage()),
                    routes: [
                      GoRoute(
                        path: ':id',
                        pageBuilder: (_, state) => _page(
                          state,
                          OrderDetailPage(orderId: state.pathParameters['id']!),
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
              icon: Icons.location_off_outlined,
              title: 'This address no longer exists',
            ),
          );
        }
        return AddressFormPage(address: match);
      },
    );
  }
}
