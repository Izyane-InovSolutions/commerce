import '../core/config/api_endpoint.dart';
import '../core/network/api_client.dart';
import '../core/network/json.dart';

class ServerProbe {
  const ServerProbe._();

  /// True when [base] answers `/health` the way the Commerce API does.
  /// Throws [ApiException] when nothing usable answers at all.
  static Future<bool> check(Uri base) async {
    final client = ApiClient(
      endpoint: ApiEndpoint.fixed(base),
      timeout: const Duration(seconds: 10),
      retryDelays: const [],
    );
    try {
      final data = await client.get('/health', authenticated: false);
      return data is Map && asJson(data)['status'] == 'ok';
    } finally {
      client.close();
    }
  }
}
