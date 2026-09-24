import '../core/network/api_client.dart';
import '../core/network/guarded.dart';
import '../core/network/json.dart';
import '../domain/auth.dart';

class AuthRepository {
  const AuthRepository(this._api);

  final ApiClient _api;

  Future<AuthSession> login(String email, String password) async {
    final data = await _api.post(
      '/auth/login',
      body: {'email': email.trim(), 'password': password},
      authenticated: false,
    );
    return parseResponse(() => AuthSession.fromJson(asJson(data)));
  }

  Future<AuthSession> register(String email, String password) async {
    final data = await _api.post(
      '/auth/register',
      body: {'email': email.trim(), 'password': password},
      authenticated: false,
    );
    return parseResponse(() => AuthSession.fromJson(asJson(data)));
  }

  /// Exchanges a refresh token for a new pair. The token passed in is spent
  /// the moment this succeeds — the caller must persist the new one before
  /// doing anything else.
  Future<AuthSession> refresh(String refreshToken) async {
    final data = await _api.post(
      '/auth/refresh',
      body: {'refreshToken': refreshToken},
      authenticated: false,
    );
    return parseResponse(() => AuthSession.fromJson(asJson(data)));
  }

  Future<void> logout(String refreshToken) async {
    await _api.post('/auth/logout', body: {'refreshToken': refreshToken});
  }

  Future<void> requestPasswordReset(String email) async {
    await _api.post(
      '/auth/password-reset/request',
      body: {'email': email.trim()},
      authenticated: false,
    );
  }

  Future<void> confirmPasswordReset(String token, String newPassword) async {
    await _api.post(
      '/auth/password-reset/confirm',
      body: {'token': token.trim(), 'newPassword': newPassword},
      authenticated: false,
    );
  }
}
