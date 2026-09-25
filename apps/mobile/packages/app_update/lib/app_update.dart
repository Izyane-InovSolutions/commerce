import 'package:flutter/services.dart';

/// The version the operating system says is installed.
class InstalledVersion {
  const InstalledVersion({required this.version, required this.build});

  /// `0.1.0` — the marketing version.
  final String version;

  /// `212` — Android's version code, iOS's CFBundleVersion. Each build sent
  /// to testers has a higher one.
  final String build;

  @override
  String toString() => '$version ($build)';
}

/// A newer build waiting for this tester on Firebase App Distribution.
class TesterRelease {
  const TesterRelease({required this.version, required this.build, this.notes});

  final String version;
  final String build;
  final String? notes;
}

enum UpdateFailure {
  /// Not a build installed through App Distribution, or the platform has no
  /// in-app updates here (a debug build, a simulator).
  unavailable,

  /// The tester closed the sign-in page.
  signInCancelled,

  /// Offline, or Firebase could not be reached.
  network,

  /// The Firebase App Testers API is not enabled for the project.
  apiDisabled,

  /// Anything else; [UpdateException.message] says what.
  other,
}

class UpdateException implements Exception {
  const UpdateException(this.failure, this.message);

  final UpdateFailure failure;
  final String message;

  @override
  String toString() => 'UpdateException($failure): $message';
}

/// Talks to the native side: the version from the OS, and Firebase App
/// Distribution's tester SDK for updates.
///
/// On Android the SDK downloads and installs the new APK itself; on iOS it
/// finds the release and [install] opens its install page. Either way the
/// tester signs in to App Distribution once, the first time they check.
class AppUpdate {
  const AppUpdate();

  static const _channel = MethodChannel('com.izyane.appupdate');

  Future<InstalledVersion> installed() async {
    final info = await _channel.invokeMapMethod<String, Object?>('installed');
    return InstalledVersion(
      version: info?['version'] as String? ?? '?',
      build: info?['build'] as String? ?? '?',
    );
  }

  /// Whether the tester has signed in to App Distribution on this device, so
  /// a check will not open a sign-in page.
  Future<bool> isSignedIn() =>
      _call<bool>('isSignedIn').then((v) => v ?? false);

  /// The newer build for this tester, or null when this one is current.
  /// Opens the App Distribution sign-in the first time.
  Future<TesterRelease?> check() async {
    final release = await _call<Map<Object?, Object?>>('check');
    if (release == null) return null;
    return TesterRelease(
      version: release['version'] as String? ?? '?',
      build: release['build'] as String? ?? '?',
      notes: release['notes'] as String?,
    );
  }

  /// Installs the release [check] found. On Android the SDK downloads it
  /// and hands it to the system installer; [onProgress] reports 0–1 while
  /// it downloads. On iOS this opens the install page.
  Future<void> install({void Function(double progress)? onProgress}) async {
    if (onProgress != null) {
      _channel.setMethodCallHandler((call) async {
        if (call.method == 'progress') {
          onProgress((call.arguments as num).toDouble());
        }
      });
    }
    try {
      await _call<void>('install');
    } finally {
      _channel.setMethodCallHandler(null);
    }
  }

  Future<T?> _call<T>(String method) async {
    try {
      return await _channel.invokeMethod<T>(method);
    } on MissingPluginException {
      throw const UpdateException(
        UpdateFailure.unavailable,
        'In-app updates are not available on this platform.',
      );
    } on PlatformException catch (error) {
      throw UpdateException(switch (error.code) {
        'unavailable' => UpdateFailure.unavailable,
        'sign-in-cancelled' => UpdateFailure.signInCancelled,
        'network' => UpdateFailure.network,
        'api-disabled' => UpdateFailure.apiDisabled,
        _ => UpdateFailure.other,
      }, error.message ?? error.code);
    }
  }
}
