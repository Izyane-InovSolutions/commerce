import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SecureTokenStore {
  const SecureTokenStore({
    FlutterSecureStorage storage = const FlutterSecureStorage(),
  }) : _storage = storage;

  final FlutterSecureStorage _storage;

  static const _refreshTokenKey = 'commerce.refresh_token';

  Future<String?> readRefreshToken() {
    return _storage.read(key: _refreshTokenKey);
  }

  Future<void> saveRefreshToken(String token) {
    return _storage.write(key: _refreshTokenKey, value: token);
  }

  Future<void> clear() {
    return _storage.delete(key: _refreshTokenKey);
  }
}
