import 'package:app_update/app_update.dart';
import 'package:flutter/foundation.dart';

enum UpdateStage {
  /// Nothing checked yet this session.
  idle,
  checking,
  upToDate,
  available,

  /// Downloading (Android) or handing over to the install page (iOS).
  installing,

  /// This build cannot update itself: a store or development build.
  unavailable,
  failed,
}

/// The installed version, and whether a newer tester build is waiting.
///
/// Builds reach testers through Firebase App Distribution. Its SDK needs the
/// tester signed in, and signing in opens a web page — so the check on
/// launch only runs once someone has signed in by checking by hand, from
/// Account, at least once. Nobody gets a sign-in page they did not ask for.
class UpdateController extends ChangeNotifier {
  UpdateController(this._native);

  final AppUpdate _native;

  InstalledVersion? _installed;
  UpdateStage _stage = UpdateStage.idle;
  TesterRelease? _release;
  String? _message;
  double? _progress;
  bool _disposed = false;

  InstalledVersion? get installed => _installed;
  UpdateStage get stage => _stage;
  TesterRelease? get release => _release;

  /// Why the last check or install failed, in plain words.
  String? get message => _message;

  /// 0–1 while an Android update downloads.
  double? get progress => _progress;

  bool get busy =>
      _stage == UpdateStage.checking || _stage == UpdateStage.installing;

  Future<void> start() async {
    try {
      _installed = await _native.installed();
      _notify();
    } catch (_) {}
  }

  /// A quiet check on launch: only when it cannot open a sign-in page.
  /// Returns the waiting release, if any.
  Future<TesterRelease?> checkQuietly() async {
    try {
      if (!await _native.isSignedIn()) return null;
    } catch (_) {
      return null;
    }
    await check(quiet: true);
    return _stage == UpdateStage.available ? _release : null;
  }

  /// Checks now, signing the tester in first if they are not yet.
  ///
  /// [quiet] is the launch check: a failure there says nothing — the tester
  /// did not ask — and the row simply offers a check again.
  Future<void> check({bool quiet = false}) async {
    if (busy) return;
    _set(UpdateStage.checking);
    try {
      _release = await _native.check();
      _set(_release == null ? UpdateStage.upToDate : UpdateStage.available);
    } on UpdateException catch (error) {
      if (quiet) {
        _set(UpdateStage.idle);
      } else {
        _fail(error);
      }
    }
  }

  Future<void> install() async {
    if (_release == null || busy) return;
    _progress = null;
    _set(UpdateStage.installing);
    try {
      await _native.install(
        onProgress: (p) {
          _progress = p;
          _notify();
        },
      );
      // Android hands over to the system installer; iOS to the install
      // page. Either way this app is about to be replaced.
      _set(UpdateStage.available);
    } on UpdateException catch (error) {
      _fail(error);
    }
  }

  void _fail(UpdateException error) {
    _message = switch (error.failure) {
      UpdateFailure.unavailable =>
        'This build updates through the app store, not in the app.',
      UpdateFailure.signInCancelled =>
        'Sign in as a tester to check for new builds.',
      UpdateFailure.network =>
        "Couldn't reach Firebase. Check your connection and try again.",
      UpdateFailure.apiDisabled =>
        'In-app updates are switched off for this project. Enable the '
            'Firebase App Testers API in Google Cloud.',
      UpdateFailure.other => error.message,
    };
    _set(
      error.failure == UpdateFailure.unavailable
          ? UpdateStage.unavailable
          : UpdateStage.failed,
    );
  }

  void _set(UpdateStage stage) {
    _stage = stage;
    if (stage != UpdateStage.failed && stage != UpdateStage.unavailable) {
      _message = null;
    }
    _notify();
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}
