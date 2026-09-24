import 'key_value_store.dart';

/// Where the refresh token lives between launches.
///
/// Only the refresh token is persisted. The access token is short-lived
/// (fifteen minutes) and stays in memory, so a copied device backup or a
/// compromised storage read yields at most a credential that must still be
/// exchanged — and exchanging it rotates it.
class SecureTokenStore {
  const SecureTokenStore(this._store);

  final KeyValueStore _store;

  static const _refreshTokenKey = 'commerce.refresh_token';

  Future<String?> readRefreshToken() => _store.read(_refreshTokenKey);

  Future<void> saveRefreshToken(String token) =>
      _store.write(_refreshTokenKey, token);

  Future<void> clear() => _store.delete(_refreshTokenKey);
}
