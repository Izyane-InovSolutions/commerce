import 'package:commerce_mobile/app/router.dart';
import 'package:commerce_mobile/core/config/api_endpoint.dart';
import 'package:commerce_mobile/core/util/money.dart';
import 'package:commerce_mobile/core/util/uuid.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('formatMoney', () {
    test('formats minor units with grouping', () {
      expect(formatMoney(450000, 'ZMW'), 'K4,500.00');
      expect(formatMoney(5, 'ZMW'), 'K0.05');
      expect(formatMoney(123456789, 'USD'), r'$1,234,567.89');
      expect(formatMoney(-2500, 'ZMW'), '-K25.00');
      expect(formatMoney(1000, 'EUR'), 'EUR 10.00');
    });
  });

  group('ApiEndpoint.tryParse', () {
    test('accepts what a tester would type', () {
      const expected = 'https://abc.trycloudflare.com/api/v1';
      for (final input in [
        'https://abc.trycloudflare.com',
        'https://abc.trycloudflare.com/',
        'https://abc.trycloudflare.com/api/v1',
        '  https://abc.trycloudflare.com/api/v1/  ',
      ]) {
        expect(ApiEndpoint.tryParse(input).toString(), expected, reason: input);
      }
    });

    test('rejects what is not an http(s) URL', () {
      for (final input in ['', 'abc.trycloudflare.com', 'ftp://host', 'https://']) {
        expect(ApiEndpoint.tryParse(input), isNull, reason: input);
      }
    });

    test('media resolves against the origin, not the versioned base', () {
      final endpoint = ApiEndpoint.fixed(Uri.parse('https://api.example.test/api/v1'));
      expect(endpoint.origin.resolve('/api/v1/media/x/download?sig=1').toString(),
          'https://api.example.test/api/v1/media/x/download?sig=1');
    });
  });

  test('uuidV4 produces valid, distinct v4 UUIDs', () {
    final pattern = RegExp(
        r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');
    final ids = List.generate(200, (_) => uuidV4());
    expect(ids, everyElement(matches(pattern)));
    expect(ids.toSet(), hasLength(200));
  });

  test('safeFrom only honours in-app paths', () {
    expect(safeFrom('/cart'), '/cart');
    expect(safeFrom('/product/x?y=1'), '/product/x?y=1');
    for (final hostile in ['https://evil.example', '//evil.example', '/\\evil.example', '', null]) {
      expect(safeFrom(hostile), isNull, reason: '$hostile');
    }
  });
}
