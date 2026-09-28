import FirebaseAppDistribution
import FirebaseCore
import Flutter
import UIKit

/// The installed version, and Firebase App Distribution's tester updates.
public class AppUpdatePlugin: NSObject, FlutterPlugin {
  /// Found by `check`; `install` opens its page.
  private var release: AppDistributionRelease?

  public static func register(with registrar: FlutterPluginRegistrar) {
    let channel = FlutterMethodChannel(
      name: "com.izyane.appupdate", binaryMessenger: registrar.messenger())
    registrar.addMethodCallDelegate(AppUpdatePlugin(), channel: channel)
  }

  public func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    switch call.method {
    case "installed":
      let info = Bundle.main.infoDictionary ?? [:]
      result([
        "version": info["CFBundleShortVersionString"] as? String ?? "?",
        "build": info["CFBundleVersion"] as? String ?? "?",
      ])
    case "isSignedIn":
      guard configured(result) else { return }
      result(AppDistribution.appDistribution().isTesterSignedIn)
    case "check":
      guard configured(result) else { return }
      let distribution = AppDistribution.appDistribution()
      // Sign in first, explicitly, so a stale or missing tester sign-in
      // always meets the sign-in page rather than an error.
      if !distribution.isTesterSignedIn {
        distribution.signInTester { [weak self] error in
          DispatchQueue.main.async {
            if let error = error {
              result(Self.flutterError(error))
            } else {
              self?.check(result)
            }
          }
        }
        return
      }
      check(result)
    case "install":
      guard let url = release?.downloadURL else {
        result(FlutterError(code: "other", message: "Check for an update first.", details: nil))
        return
      }
      // iOS installs ad hoc builds from their App Distribution page.
      UIApplication.shared.open(url) { opened in
        result(opened ? nil : FlutterError(
          code: "other", message: "Could not open the install page.", details: nil))
      }
    default:
      result(FlutterMethodNotImplemented)
    }
  }

  private func check(_ result: @escaping FlutterResult) {
    AppDistribution.appDistribution().checkForUpdate { [weak self] release, error in
      DispatchQueue.main.async {
        if let error = error {
          result(Self.flutterError(error))
          return
        }
        self?.release = release
        guard let release = release else {
          result(nil)
          return
        }
        result([
          "version": release.displayVersion,
          "build": release.buildVersion,
          "notes": release.releaseNotes as Any,
        ])
      }
    }
  }

  private func configured(_ result: FlutterResult) -> Bool {
    if FirebaseApp.app() != nil { return true }
    result(FlutterError(
      code: "unavailable", message: "Firebase is not set up in this build.", details: nil))
    return false
  }

  private static func flutterError(_ error: Error) -> FlutterError {
    let ns = error as NSError
    var code = "other"
    if ns.domain == AppDistributionErrorDomain {
      switch ns.code {
      case AppDistributionError.Code.authenticationCancelled.rawValue: code = "sign-in-cancelled"
      case AppDistributionError.Code.networkFailure.rawValue: code = "network"
      default: break
      }
    } else if ns.domain == NSURLErrorDomain {
      code = "network"
    }
    return FlutterError(code: code, message: ns.localizedDescription, details: nil)
  }
}
