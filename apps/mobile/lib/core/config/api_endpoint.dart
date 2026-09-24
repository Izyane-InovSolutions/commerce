import 'package:flutter/foundation.dart';

import '../storage/key_value_store.dart';
import 'app_config.dart';

/// The API base URL in effect right now, and where it was set.
///
/// A [ValueNotifier] so that anything holding a session can react when the
/// server changes: tokens minted by one backend mean nothing to another.
class ApiEndpoint extends ValueNotifier<Uri> {
  ApiEndpoint._(super.value, this._store, {required this.isOverridden});

  static const _overrideKey = 'commerce.api_base_url_override';

  final KeyValueStore _store;

  /// True when a tester has pointed the app somewhere other than the
  /// compiled-in default.
  bool isOverridden;

  /// An endpoint that is never persisted — for probing a candidate server.
  ApiEndpoint.fixed(Uri uri) : this._(uri, MemoryKeyValueStore(), isOverridden: false);

  static Future<ApiEndpoint> load(KeyValueStore store) async {
    final saved = await store.read(_overrideKey);
    final parsed = saved == null ? null : tryParse(saved);
    return ApiEndpoint._(
      parsed ?? Uri.parse(AppConfig.defaultApiBaseUrl),
      store,
      isOverridden: parsed != null,
    );
  }

  /// The origin the API serves media from. Product image URLs arrive
  /// origin-relative (`/api/v1/media/...`), so they resolve against this
  /// rather than against the versioned base.
  Uri get origin => value.replace(path: '/', query: null, fragment: null);

  Future<void> override(Uri uri) async {
    await _store.write(_overrideKey, uri.toString());
    isOverridden = true;
    value = uri;
  }

  Future<void> reset() async {
    await _store.delete(_overrideKey);
    isOverridden = false;
    value = Uri.parse(AppConfig.defaultApiBaseUrl);
  }

  /// Accepts what a person would type — with or without `/api/v1`, with or
  /// without a trailing slash — and returns the versioned base, or null when
  /// it is not an absolute http(s) URL.
  static Uri? tryParse(String input) {
    final trimmed = input.trim();
    final uri = Uri.tryParse(trimmed);
    if (uri == null || !uri.hasScheme || uri.host.isEmpty) {
      return null;
    }
    if (uri.scheme != 'https' && uri.scheme != 'http') {
      return null;
    }
    var path = uri.path.replaceAll(RegExp(r'/+$'), '');
    if (!path.endsWith('/api/v1')) {
      path = '$path/api/v1';
    }
    return uri.replace(path: path, query: null, fragment: null);
  }
}
