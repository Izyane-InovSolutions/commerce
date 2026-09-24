import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../core/network/api_client.dart';
import '../../core/network/api_exception.dart';
import '../../core/storage/secure_token_store.dart';
import '../../data/auth_repository.dart';
import '../../domain/auth.dart';

enum SessionStatus {
  /// Launch: checking whether a stored session can be resumed.
  restoring,

  /// A stored session exists but the server could not be reached to resume
  /// it. The session is kept — nothing says it is invalid — and the user is
  /// offered a retry rather than a sign-in form.
  unreachable,
  signedOut,
  signedIn,
}

/// Owns the signed-in identity and the tokens behind it.
///
/// The access token lives only in memory. The refresh token lives in secure
/// storage, and the API rotates it on every use and treats reuse of a spent
/// one as theft — revoking the whole session. Two rules follow, and this
/// class is where both are enforced:
///
///  * a new refresh token is written to storage before anything else happens
///    with it, since the old one is already dead the moment the server
///    replies; and
///  * only one refresh is ever in flight, however many requests hit a 401 at
///    once.
class SessionController extends ChangeNotifier implements AccessTokenSource {
  SessionController({
    required AuthRepository auth,
    required SecureTokenStore tokens,
  })  : _auth = auth,
        _tokens = tokens;

  final AuthRepository _auth;
  final SecureTokenStore _tokens;

  SessionStatus _status = SessionStatus.restoring;
  AuthUser? _user;
  String? _accessToken;
  Future<_RefreshResult>? _inflight;
  ApiException? _restoreError;
  bool _expired = false;

  SessionStatus get status => _status;
  AuthUser? get user => _user;
  bool get isSignedIn => _status == SessionStatus.signedIn;
  ApiException? get restoreError => _restoreError;

  @override
  String? get accessToken => _accessToken;

  /// True once, after a session ends because the server refused to renew it.
  /// The UI reads and clears it to explain the sudden sign-out.
  bool takeExpiredNotice() {
    final value = _expired;
    _expired = false;
    return value;
  }

  Future<void> restore() async {
    _restoreError = null;
    _setStatus(SessionStatus.restoring);

    final stored = await _tokens.readRefreshToken();
    if (stored == null) {
      _setStatus(SessionStatus.signedOut);
      return;
    }

    final result = await _refreshOnce();
    switch (result) {
      case _RefreshResult.renewed:
        break; // _adopt already moved us to signedIn.
      case _RefreshResult.rejected:
        _setStatus(SessionStatus.signedOut);
      case _RefreshResult.unreachable:
        _setStatus(SessionStatus.unreachable);
    }
  }

  Future<void> signIn(String email, String password) async {
    await _adopt(await _auth.login(email, password));
  }

  Future<void> register(String email, String password) async {
    await _adopt(await _auth.register(email, password));
  }

  Future<void> signOut() async {
    final stored = await _tokens.readRefreshToken();
    if (stored != null && _accessToken != null) {
      // Best effort, and it has to happen first: the API needs a valid access
      // token to accept the logout. If it fails the session still ends here;
      // it will lapse on the server when the refresh token expires.
      try {
        await _auth.logout(stored).timeout(const Duration(seconds: 5));
      } catch (_) {}
    }
    await _clear();
    _setStatus(SessionStatus.signedOut);
  }

  /// Drops the session locally without telling the server — for when the
  /// server itself has changed and these tokens mean nothing to it.
  Future<void> forget() async {
    await _clear();
    _setStatus(SessionStatus.signedOut);
  }

  @override
  Future<bool> renewAccessToken(String rejectedToken) async {
    if (_accessToken != null && _accessToken != rejectedToken) {
      return true; // Someone else already renewed; just retry.
    }
    final result = await _refreshOnce();
    return result == _RefreshResult.renewed;
  }

  /// Every caller during a refresh shares the one in flight.
  Future<_RefreshResult> _refreshOnce() =>
      _inflight ??= _doRefresh().whenComplete(() => _inflight = null);

  Future<_RefreshResult> _doRefresh() async {
    final stored = await _tokens.readRefreshToken();
    if (stored == null) {
      await _expire();
      return _RefreshResult.rejected;
    }
    try {
      await _adopt(await _auth.refresh(stored));
      return _RefreshResult.renewed;
    } on ApiException catch (error) {
      final definitive = error.isUnauthorized ||
          (error.kind == ApiErrorKind.http &&
              error.statusCode != null &&
              error.statusCode! >= 400 &&
              error.statusCode! < 500 &&
              error.statusCode != 429);
      if (definitive) {
        await _expire();
        return _RefreshResult.rejected;
      }
      // Offline, timed out, rate limited or a server fault: nothing says the
      // session is bad, so keep it and let the caller fail this one request.
      _restoreError = error;
      return _RefreshResult.unreachable;
    }
  }

  Future<void> _adopt(AuthSession session) async {
    await _tokens.saveRefreshToken(session.refreshToken);
    _accessToken = session.accessToken;
    _user = session.user;
    _restoreError = null;
    _setStatus(SessionStatus.signedIn);
  }

  Future<void> _expire() async {
    final wasSignedIn = _status == SessionStatus.signedIn;
    await _clear();
    _expired = wasSignedIn;
    _setStatus(SessionStatus.signedOut);
  }

  Future<void> _clear() async {
    _accessToken = null;
    _user = null;
    await _tokens.clear();
  }

  void _setStatus(SessionStatus status) {
    _status = status;
    notifyListeners();
  }
}

enum _RefreshResult { renewed, rejected, unreachable }
