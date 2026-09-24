/// Build-time configuration.
///
/// Only the *default* API base URL is compiled in. The one actually used is
/// held by [ApiEndpoint], which a tester can repoint from the server settings
/// screen without a rebuild — the internal-testing backend sits behind a
/// Cloudflare quick tunnel whose hostname changes on every restart, and a
/// compile-time-only URL would mean rebuilding and reinstalling the app each
/// time that happens.
class AppConfig {
  const AppConfig._();

  /// Override per build with
  /// `--dart-define=COMMERCE_API_BASE_URL=https://api.example.com/api/v1`.
  ///
  /// The default is the internal-testing tunnel. It is temporary by nature;
  /// replace it once the API has a stable hostname.
  static const defaultApiBaseUrl = String.fromEnvironment(
    'COMMERCE_API_BASE_URL',
    defaultValue:
        'https://promo-sheet-neighbor-traveling.trycloudflare.com/api/v1',
  );

  /// The only currency the API currently prices in.
  static const currency = 'ZMW';
}
