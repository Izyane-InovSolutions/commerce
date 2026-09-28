# Good for Goods

**Good for Goods, by iZyane.** The marketplace app for Android and iOS, from
one Flutter codebase, and a client of the Commerce API at `/api/v1` (the code
base keeps its "commerce" names).

- Architecture and delivery plan:
  [docs/mobile-architecture.md](../../docs/mobile-architecture.md)
- Internal testing builds, through Firebase App Distribution:
  [DISTRIBUTION.md](DISTRIBUTION.md)

## What it does

Browse, search and filter the catalogue; product pages with variants and
seller choice; cart; checkout with delivery quotes and **MTN MoMo / Airtel
Money** payment; payment status that recovers if the app is closed mid-payment;
order history and tracking; wishlist; profile and address book; sign up, sign
in, password reset, and a session that survives restarts.

## Run it

```bash
flutter pub get
flutter run                     # a connected device or simulator
```

The API address is compiled in with a default (see
`lib/core/config/app_config.dart`) and can be overridden per build:

```bash
flutter run --dart-define=COMMERCE_API_BASE_URL=https://api.example.com/api/v1
```

It can also be changed **inside the app** without rebuilding: Account → Server,
or the server icon on the sign-in screen. That exists because the internal-test
backend sits behind a Cloudflare quick tunnel whose hostname changes every time
it restarts. Changing server signs you out.

Release builds need HTTPS: Android and iOS both refuse plain `http://` by
default.

## Tests

```bash
flutter test                    # 82 unit, widget and design-system tests
```

They run against a scripted fake API (`test/support/fake_api.dart`), with
response fixtures captured from the real backend in `test/fixtures/`.

```bash
flutter test integration_test/purchase_flow_test.dart -d <device>
```

The integration test drives the real app against the **real API**: twice, it
registers a new account, buys a product — once by card with the sandbox test
card `4111 1111 1111 1111`, once with mobile money — and checks the order.
**It places a real order** — only point it at a test environment whose payment
gateway is a sandbox. The API allows 5 auth requests a minute per client, so
back-to-back runs can hit the limit.

## Design system

`lib/design/` is the app's own component library, built from Flutter's
widgets-layer primitives. The app runs on `WidgetsApp`, not `MaterialApp`; no
Material or Cupertino component, and no platform icon font, is used for
anything visible. It looks the same on iOS and Android:

- **Its own glyph set** (`glyphs.dart`): 41 outline glyphs on a 24-unit grid,
  written as SVG path data, with filled variants for active states. A test
  fails if `Icons.` appears anywhere in `lib/`.
- **One-row bars:** back, a left-aligned title and the actions share one line
  on every screen, and nothing collapses as the page scrolls.
- **A floating dock** for the tabs (Shop, Search, Cart, Selling; Account opens
  from the Shop screen's profile button): a raised capsule above the page that
  follows light and dark mode, neither platform's bar.
- **Filled, borderless fields and tags.** A ring appears only on focus or
  error; a selected tag turns solid ink.
- **Notices drop from the top**, in the dock's colours, rather than rising as a
  snackbar.

Patterns are borrowed where they earn it:

- **From Cupertino:** large titles that collapse into the bar, inset grouped
  lists, the sliding segmented control, action sheets in place of pop-up menus,
  press-to-dim feedback, pull to refresh, and the slide-with-edge-swipe page
  transition (used on both platforms; Android's system back still works).
- **From Material:** keyboard focus rings, state tracking, and a bolder
  selected state (the selected tab's glyph fills in).
- **Kept native per platform:** only text selection and the copy/paste menu —
  muscle memory.

The signature element is `Price`: a small raised **K**, heavy tabular whole
kwacha, small ngwee. On any screen with a price, the price is the loudest
thing. Screen readers hear it as one amount.

Rules for working in it:

- **Tokens live in `lib/design/tokens.dart` only.** Colour, type, spacing,
  radius and motion; no component hard-codes a value. Rebranding means editing
  that one file.
- **Contrast is tested.** `test/design/design_system_test.dart` checks every
  text-on-background pairing, in light and dark, against WCAG AA. A palette
  change that would be unreadable fails the build.
- **Build on `Pressable`.** It carries semantics, keyboard activation, the focus
  ring, press feedback and haptics, so no tappable thing can forget them.
- **Large text must not overflow.** A test renders the storefront and product
  page at 1.6× text size; any overflow fails it.
- Typeface: Schibsted Grotesk (variable, OFL — licence in `assets/fonts/`).

## Structure

```text
lib/
├── app/        wiring: services, router, tab shell
├── core/       API client, config, storage, loaders, shared widgets
├── data/       repositories — the only code that talks to the API
├── design/     the design system
├── domain/     typed models, parsed defensively from API responses
└── features/   screens and their controllers, one folder per area
```

Screens never touch HTTP; they call controllers or repositories. Prices,
totals, stock and payment state always come from the API as-is.

## Things to know

- **Refresh tokens rotate, and reuse revokes the session.** The API treats a
  spent refresh token as theft and kills the whole session. So
  `SessionController` refreshes single-flight, and persists the new token before
  anything else. There's a test that fails if two refreshes ever go out
  together.
- **Checkout is idempotent.** One UUID v4 key per attempt, reused on retry, so a
  dropped connection can't create a second order or charge twice.
- **Card payments send the raw card to the API**, as the web storefront does;
  there's no hosted payment page or SDK. That puts the app in PCI scope, so card
  data is held in memory only, for the checkout screen. It's never stored,
  logged or put in a route; card fields turn off autocorrect, suggestions and
  keyboard learning; and it's wiped once the order is placed. See
  `lib/domain/card.dart`.
- **Cards settle inside the checkout request.** A decline comes back straight
  away (the API cancels that order and keeps the cart), so checkout shows it in
  place and uses a new idempotency key for the retry. American Express isn't
  accepted: the API only takes a 3-digit security code. Cards are charged in US
  dollars (`UNIFIED_PAYMENTS_CARD_CURRENCY` on the server), and checkout says
  so.
- **Selling** (`lib/features/selling`, `/sellers/me/*`) is the seller portal on
  a phone:
  - **Applying:** apply to sell, or resubmit after a rejection.
  - **Catalog:** submit new products with photos for review, and create
    listings from the catalog. For each listing: price, on sale or hidden,
    details while hidden, archive.
  - **Orders:** accept or decline, pack, send with a courier and tracking
    number, post tracking updates, cancel what hasn't been sent.
  - **Stock:** recount stock and see its history.
  - **Money:** earnings and the ledger; payout accounts, and asking for a
    payout.
  - **Customers:** returns (read-only; the Good for Goods team handles them), and
    reviews and ratings.
  - **Shop details:** name, web address and description.

  Promotions, customer lists and sales insights aren't in the app because the
  API has no endpoints for them yet; the web portal's pages for them are
  placeholders too.

  Uploads (application documents, product photos) go through `file_picker`,
  one file at a time: reserve a slot, then PUT the bytes as multipart to the
  signed address. On Android this needs `android.builtInKotlin=true`, since
  file_picker leaves its Kotlin to AGP 9's built-in Kotlin support.

  Approval makes a customer a seller on the server, but a token's role is fixed
  when it's minted, and the listings and stock endpoints check it. So the
  dashboard renews the session once when the token still says customer.
- **The Shop tab is built from rails** (`lib/features/shop`). Each rail scrolls
  sideways and shows three tiles with a peek of the next:
  - recently viewed, based on your search, your wishlist, more like what you
    viewed;
  - deals, shop by category, top rated, recommended sellers, under K500.

  The API has no recommendations or promotions, so every rail is worked out
  from real listings and says why an item is there:
  - **Deals** are items sold for less than another seller's price, or with a
    delivery charge of zero.
  - **Sellers** are ranked by their storefront rating, then by how often
    they're the cheapest.

  Views and searches are kept on the phone only (`BrowsingHistory`), and
  cleared on sign-out.
- **Price sorting and most filters run on the phone.** The API accepts
  `price:asc` but ignores it, and only filters by search, category and brand.
  So price, rating, stock, free delivery and returnable filters, and the price
  sorts, apply to loaded results. When a filter is on, the list reads ahead up
  to 200 results to find matches, and says so if there are more.
- **Not built yet** (the plan's platform-services phase): push notifications,
  deep links (so the password-reset code is pasted in rather than opened from
  the email), crash reporting and analytics.
- Identifiers are `com.izyane.commerce_mobile` (Android) and
  `com.izyane.commerceMobile` (iOS). Change them before the first store upload;
  they're hard to change after.
- `flutter_secure_storage` doesn't support Swift Package Manager yet; Flutter
  warns this will become an error in a future release.
