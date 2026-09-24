import 'package:flutter/foundation.dart';

import '../network/api_exception.dart';

/// Loading, error and data for one fetch, so every screen that shows a
/// single thing from the API handles all three the same way.
///
/// The fetch is a repository call; the screen never sees HTTP.
class Loader<T> extends ChangeNotifier {
  Loader(this._fetch, {bool autoload = true}) {
    if (autoload) load();
  }

  final Future<T> Function() _fetch;

  T? _data;
  Object? _error;
  bool _loading = false;
  bool _disposed = false;
  int _generation = 0;

  T? get data => _data;
  Object? get error => _error;
  bool get isLoading => _loading;
  bool get hasData => _data != null;

  String? get errorMessage => _error == null ? null : describeError(_error!);
  String? get requestId =>
      _error is ApiException ? (_error! as ApiException).requestId : null;

  /// [silent] keeps the current data on screen while refreshing — for
  /// pull-to-refresh, where blanking the list would be jarring.
  Future<void> load({bool silent = false}) async {
    final generation = ++_generation;
    _loading = true;
    if (!silent) {
      _error = null;
    }
    _notify();
    try {
      final value = await _fetch();
      if (generation != _generation) return;
      _data = value;
      _error = null;
    } catch (error) {
      if (generation != _generation) return;
      _error = error;
    } finally {
      if (generation == _generation) {
        _loading = false;
        _notify();
      }
    }
  }

  void replace(T value) {
    _data = value;
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
