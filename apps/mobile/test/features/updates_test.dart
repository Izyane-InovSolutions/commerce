import 'package:app_update/app_update.dart';
import 'package:commerce_mobile/features/updates/update_controller.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeUpdate implements AppUpdate {
  bool signedIn = false;
  TesterRelease? release;
  UpdateException? failure;
  int checks = 0;
  final progress = <double>[];

  @override
  Future<InstalledVersion> installed() async =>
      const InstalledVersion(version: '0.1.0', build: '212');

  @override
  Future<bool> isSignedIn() async => signedIn;

  @override
  Future<TesterRelease?> check() async {
    checks++;
    if (failure != null) throw failure!;
    signedIn = true;
    return release;
  }

  @override
  Future<void> install({void Function(double progress)? onProgress}) async {
    for (final p in [0.25, 0.5, 1.0]) {
      progress.add(p);
      onProgress?.call(p);
    }
  }
}

void main() {
  late _FakeUpdate native;
  late UpdateController updates;

  setUp(() async {
    native = _FakeUpdate();
    updates = UpdateController(native);
    await updates.start();
  });

  test('knows the installed version', () {
    expect(updates.installed.toString(), '0.1.0 (212)');
  });

  test('the launch check never opens a sign-in page', () async {
    native.release = const TesterRelease(version: '0.1.0', build: '215');
    expect(await updates.checkQuietly(), isNull);
    expect(native.checks, 0, reason: 'not signed in to App Distribution yet');

    await updates.check(); // by hand, from Account: signs in
    expect(updates.stage, UpdateStage.available);

    expect((await updates.checkQuietly())!.build, '215');
  });

  test('says when this build is the latest', () async {
    await updates.check();
    expect(updates.stage, UpdateStage.upToDate);
  });

  test('installs with progress', () async {
    native.release = const TesterRelease(version: '0.1.0', build: '215');
    await updates.check();
    final seen = <double?>[];
    updates.addListener(() => seen.add(updates.progress));
    await updates.install();
    expect(native.progress, [0.25, 0.5, 1.0]);
    expect(seen, containsAllInOrder([0.25, 0.5, 1.0]));
  });

  test('explains failures in plain words', () async {
    native.failure = const UpdateException(
      UpdateFailure.unavailable,
      'NOT_IMPLEMENTED',
    );
    await updates.check();
    expect(updates.stage, UpdateStage.unavailable);
    expect(updates.message, contains('app store'));

    native.failure = const UpdateException(
      UpdateFailure.signInCancelled,
      'cancelled',
    );
    await updates.check();
    expect(updates.stage, UpdateStage.failed);
    expect(updates.message, contains('Sign in as a tester'));
  });

  test('a failed launch check says nothing', () async {
    native.signedIn = true;
    native.failure = const UpdateException(
      UpdateFailure.other,
      'Tester is not signed in',
    );
    expect(await updates.checkQuietly(), isNull);
    expect(updates.stage, UpdateStage.idle);
    expect(updates.message, isNull);
  });
}
