/// Defensive readers for API responses.
///
/// The architecture doc asks the client to treat server responses as
/// untrusted input. Every model parses through these, so a missing or
/// mistyped field fails as a [FormatException] at the boundary — which the
/// repositories turn into an [ApiException] — instead of as a null
/// dereference deep inside a widget.
typedef Json = Map<String, Object?>;

Json asJson(Object? value, [String what = 'response']) {
  if (value is Map<String, Object?>) return value;
  if (value is Map) return value.cast<String, Object?>();
  throw FormatException(
    'Expected an object for $what, got ${value.runtimeType}',
  );
}

List<Object?> asList(Object? value, [String what = 'response']) {
  if (value is List) return value;
  throw FormatException('Expected a list for $what, got ${value.runtimeType}');
}

List<T> listOf<T>(
  Object? value,
  T Function(Json json) parse, [
  String what = 'list',
]) {
  return asList(value, what).map((item) => parse(asJson(item, what))).toList();
}

extension JsonRead on Json {
  String str(String key) {
    final value = this[key];
    if (value is String) return value;
    throw FormatException('Expected string "$key", got ${value.runtimeType}');
  }

  String? strOrNull(String key) {
    final value = this[key];
    return value is String ? value : null;
  }

  int integer(String key) {
    final value = this[key];
    if (value is int) return value;
    if (value is num) return value.toInt();
    throw FormatException('Expected number "$key", got ${value.runtimeType}');
  }

  int? intOrNull(String key) {
    final value = this[key];
    return value is num ? value.toInt() : null;
  }

  double? doubleOrNull(String key) {
    final value = this[key];
    return value is num ? value.toDouble() : null;
  }

  bool boolean(String key, {bool fallback = false}) {
    final value = this[key];
    return value is bool ? value : fallback;
  }

  Json obj(String key) => asJson(this[key], key);

  Json? objOrNull(String key) {
    final value = this[key];
    return value is Map ? asJson(value, key) : null;
  }

  List<T> list<T>(String key, T Function(Json json) parse) {
    final value = this[key];
    if (value == null) return const [];
    return listOf(value, parse, key);
  }

  List<String> strings(String key) {
    final value = this[key];
    if (value is! List) return const [];
    return value.whereType<String>().toList();
  }

  DateTime? dateOrNull(String key) {
    final value = this[key];
    return value is String ? DateTime.tryParse(value)?.toLocal() : null;
  }
}
