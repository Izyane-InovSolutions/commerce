package com.izyane.appupdate;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import androidx.annotation.NonNull;

import com.google.android.gms.tasks.Task;
import com.google.android.gms.tasks.Tasks;
import com.google.firebase.appdistribution.AppDistributionRelease;
import com.google.firebase.appdistribution.FirebaseAppDistribution;
import com.google.firebase.appdistribution.FirebaseAppDistributionException;

import java.util.HashMap;
import java.util.Map;

import io.flutter.embedding.engine.plugins.FlutterPlugin;
import io.flutter.plugin.common.MethodCall;
import io.flutter.plugin.common.MethodChannel;

/**
 * The installed version, and Firebase App Distribution's tester updates.
 *
 * <p>Written in Java so the plugin needs no Kotlin Gradle plugin of its own.
 */
public class AppUpdatePlugin implements FlutterPlugin, MethodChannel.MethodCallHandler {
  private MethodChannel channel;
  private Context context;
  private final Handler main = new Handler(Looper.getMainLooper());

  @Override
  public void onAttachedToEngine(@NonNull FlutterPluginBinding binding) {
    context = binding.getApplicationContext();
    channel = new MethodChannel(binding.getBinaryMessenger(), "com.izyane.appupdate");
    channel.setMethodCallHandler(this);
  }

  @Override
  public void onDetachedFromEngine(@NonNull FlutterPluginBinding binding) {
    channel.setMethodCallHandler(null);
    channel = null;
  }

  @Override
  public void onMethodCall(@NonNull MethodCall call, @NonNull MethodChannel.Result result) {
    try {
      switch (call.method) {
        case "installed":
          result.success(installed());
          break;
        case "isSignedIn":
          result.success(FirebaseAppDistribution.getInstance().isTesterSignedIn());
          break;
        case "check":
          check(result, true);
          break;
        case "install":
          FirebaseAppDistribution.getInstance()
              .updateApp()
              .addOnProgressListener(progress -> {
                long total = progress.getApkFileTotalBytes();
                if (total > 0 && channel != null) {
                  double share = (double) progress.getApkBytesDownloaded() / total;
                  main.post(() -> {
                    if (channel != null) channel.invokeMethod("progress", share);
                  });
                }
              })
              .addOnSuccessListener(ignored -> result.success(null))
              .addOnFailureListener(error -> fail(result, error));
          break;
        default:
          result.notImplemented();
      }
    } catch (IllegalStateException error) {
      // No Firebase app configured in this build.
      result.error("unavailable", error.getMessage(), null);
    }
  }

  /**
   * Signs the tester in if needed — checkForNewRelease does not; it only
   * answers for a tester who is already signed in — then checks. A sign-in
   * the SDK remembers but the server no longer accepts (after a reinstall,
   * say) fails with an authentication error; that is signed out and tried
   * once more from scratch.
   */
  private void check(MethodChannel.Result result, boolean retry) {
    FirebaseAppDistribution distribution = FirebaseAppDistribution.getInstance();
    Task<Void> signedIn =
        distribution.isTesterSignedIn() ? Tasks.forResult(null) : distribution.signInTester();
    signedIn
        .onSuccessTask(ignored -> distribution.checkForNewRelease())
        .addOnSuccessListener(release -> result.success(describe(release)))
        .addOnFailureListener(
            error -> {
              if (retry && isAuthenticationFailure(error)) {
                distribution.signOutTester();
                check(result, false);
              } else {
                fail(result, error);
              }
            });
  }

  private static boolean isAuthenticationFailure(Exception error) {
    return error instanceof FirebaseAppDistributionException
        && "AUTHENTICATION_FAILURE"
            .equals(((FirebaseAppDistributionException) error).getErrorCode().name());
  }

  private Map<String, Object> installed() throws IllegalStateException {
    try {
      PackageInfo info =
          context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
      long code =
          Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
              ? info.getLongVersionCode()
              : info.versionCode;
      Map<String, Object> map = new HashMap<>();
      map.put("version", info.versionName);
      map.put("build", String.valueOf(code));
      return map;
    } catch (PackageManager.NameNotFoundException error) {
      throw new IllegalStateException(error);
    }
  }

  private static Map<String, Object> describe(AppDistributionRelease release) {
    if (release == null) return null;
    Map<String, Object> map = new HashMap<>();
    map.put("version", release.getDisplayVersion());
    map.put("build", String.valueOf(release.getVersionCode()));
    map.put("notes", release.getReleaseNotes());
    return map;
  }

  private static void fail(MethodChannel.Result result, Exception error) {
    String code = "other";
    if (error instanceof FirebaseAppDistributionException) {
      // By name: the enum grows across SDK versions.
      switch (((FirebaseAppDistributionException) error).getErrorCode().name()) {
        case "NOT_IMPLEMENTED":
          code = "unavailable";
          break;
        case "API_DISABLED":
          code = "api-disabled";
          break;
        case "AUTHENTICATION_CANCELED":
          code = "sign-in-cancelled";
          break;
        case "NETWORK_FAILURE":
          code = "network";
          break;
        default:
          break;
      }
    }
    result.error(code, error.getMessage(), null);
  }
}
