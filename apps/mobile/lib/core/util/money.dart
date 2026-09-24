/// Display formatting for minor-unit amounts.
///
/// Every amount from the API is an integer count of minor units (`450000` is
/// K4,500.00). Display only — the app never does arithmetic on prices beyond
/// what the server already totalled.
library;

String currencySymbol(String currency) => switch (currency) {
  'ZMW' => 'K',
  'USD' => r'$',
  'GBP' => '£',
  _ => '$currency ',
};

String _grouped(int whole) {
  final digits = whole.toString();
  final out = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) out.write(',');
    out.write(digits[i]);
  }
  return out.toString();
}

/// The three parts a price is drawn in — `K`, `4,500`, `00` — for the design
/// system's [Price].
({String symbol, String whole, String minor, bool negative}) moneyParts(
  int minorUnits,
  String currency,
) {
  final absolute = minorUnits.abs();
  return (
    symbol: currencySymbol(currency).trim(),
    whole: _grouped(absolute ~/ 100),
    minor: (absolute % 100).toString().padLeft(2, '0'),
    negative: minorUnits < 0,
  );
}

/// `K4,500.00` — for plain text: messages, semantics labels, logs.
String formatMoney(int minorUnits, String currency) {
  final parts = moneyParts(minorUnits, currency);
  return '${parts.negative ? '-' : ''}${currencySymbol(currency)}'
      '${parts.whole}.${parts.minor}';
}
