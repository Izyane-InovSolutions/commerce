/// Formats a minor-unit amount for display.
///
/// Every amount from the API is an integer count of minor units (`450000` is
/// K4,500.00). Display only — the app never does arithmetic on prices beyond
/// what the server already totalled.
String formatMoney(int minorUnits, String currency) {
  final negative = minorUnits < 0;
  final absolute = minorUnits.abs();
  final whole = absolute ~/ 100;
  final cents = (absolute % 100).toString().padLeft(2, '0');

  final digits = whole.toString();
  final grouped = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) grouped.write(',');
    grouped.write(digits[i]);
  }

  final symbol = switch (currency) {
    'ZMW' => 'K',
    'USD' => r'$',
    'GBP' => '£',
    _ => '$currency ',
  };
  return '${negative ? '-' : ''}$symbol$grouped.$cents';
}
