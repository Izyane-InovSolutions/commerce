import '../core/network/json.dart';
import 'account.dart';

/// Card payments.
///
/// PCI note: a card number, expiry and security code typed here are sent
/// once, over TLS, in the checkout request — the same path the web
/// storefront uses — and nowhere else. They live only in memory for the
/// length of the checkout screen: never written to storage, never logged,
/// never put in a URL or a route. [CardDetails.toString] shows only the last
/// four digits, so an accidental print or error report cannot leak the rest.

enum CardBrand { visa, mastercard, amex, other }

extension CardBrandInfo on CardBrand {
  String? get label => switch (this) {
    CardBrand.visa => 'Visa',
    CardBrand.mastercard => 'Mastercard',
    CardBrand.amex => 'Amex',
    CardBrand.other => null,
  };

  /// The API only accepts a three-digit security code, which rules out
  /// American Express (four digits) until the backend changes.
  bool get accepted => this != CardBrand.amex;
}

class CardNumber {
  const CardNumber._();

  static String digits(String raw) => raw.replaceAll(RegExp(r'\D'), '');

  /// By prefix, as far as it can be told from the digits typed so far.
  static CardBrand brand(String digits) {
    if (digits.startsWith('4')) return CardBrand.visa;
    if (RegExp(r'^3[47]').hasMatch(digits)) return CardBrand.amex;
    if (RegExp(r'^5[1-5]').hasMatch(digits)) return CardBrand.mastercard;
    if (digits.length >= 4) {
      final prefix = int.parse(digits.substring(0, 4));
      if (prefix >= 2221 && prefix <= 2720) return CardBrand.mastercard;
    }
    return CardBrand.other;
  }

  /// The API's own bound: 13 to 19 digits.
  static const minLength = 13;
  static const maxLength = 19;

  static int expectedLength(CardBrand brand) => switch (brand) {
    CardBrand.amex => 15,
    CardBrand.visa || CardBrand.mastercard => 16,
    CardBrand.other => maxLength,
  };

  /// The Luhn checksum every card number carries. Catches nearly every
  /// single-digit typo and transposition before the gateway has to.
  static bool luhn(String digits) {
    if (digits.isEmpty) return false;
    var sum = 0;
    var double = false;
    for (var i = digits.length - 1; i >= 0; i--) {
      var d = digits.codeUnitAt(i) - 48;
      if (double) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
      double = !double;
    }
    return sum % 10 == 0;
  }

  /// Groups of four, as printed on the card (4-6-5 for Amex).
  static String format(String digits) {
    final groups = brand(digits) == CardBrand.amex
        ? [4, 6, 5]
        : [4, 4, 4, 4, 3];
    final out = StringBuffer();
    var i = 0;
    for (final size in groups) {
      if (i >= digits.length) break;
      if (out.isNotEmpty) out.write(' ');
      final end = (i + size).clamp(0, digits.length);
      out.write(digits.substring(i, end));
      i = end;
    }
    return out.toString();
  }

  /// Null when [raw] is a number worth sending; otherwise what is wrong.
  static String? problem(String raw) {
    final digits = CardNumber.digits(raw);
    final brand = CardNumber.brand(digits);
    if (!brand.accepted) {
      return "American Express isn't accepted. Use a Visa or Mastercard.";
    }
    if (digits.length < minLength || !luhn(digits)) {
      return 'Check the card number';
    }
    return null;
  }

  /// Whether enough has been typed that a [problem] is worth showing —
  /// complaining about a number halfway through typing it is noise.
  static bool complete(String raw) {
    final digits = CardNumber.digits(raw);
    final brand = CardNumber.brand(digits);
    return !brand.accepted || digits.length >= expectedLength(brand);
  }
}

class CardExpiry {
  const CardExpiry(this.month, this.year);

  /// Reads `MM/YY` (or `MM / YY`, `MMYY`). Null if it is not a date.
  static CardExpiry? parse(String raw) {
    final digits = raw.replaceAll(RegExp(r'\D'), '');
    if (digits.length != 4) return null;
    final month = int.parse(digits.substring(0, 2));
    if (month < 1 || month > 12) return null;
    return CardExpiry(month, 2000 + int.parse(digits.substring(2)));
  }

  final int month;

  /// Four digits.
  final int year;

  /// A card is good through the last day of its expiry month.
  bool isExpired(DateTime now) =>
      year < now.year || (year == now.year && month < now.month);

  static String? problem(String raw, DateTime now) {
    final expiry = parse(raw);
    if (expiry == null) return 'Enter the expiry as MM/YY';
    if (expiry.isExpired(now)) return 'This card has expired';
    return null;
  }

  String get wireMonth => month.toString().padLeft(2, '0');
  String get wireYear => '$year';
}

class CardSecurityCode {
  const CardSecurityCode._();

  static final _pattern = RegExp(r'^\d{3}$');

  static String? problem(String raw) =>
      _pattern.hasMatch(raw) ? null : 'Enter the 3 digits on the back';
}

/// Where the card's statements go. The API requires every field; the bank
/// may check the postal code against its records.
class CardBilling {
  const CardBilling({
    required this.firstName,
    required this.lastName,
    required this.address1,
    required this.locality,
    required this.administrativeArea,
    required this.postalCode,
    required this.country,
    required this.email,
  });

  /// Billing taken from the delivery address — what nearly everyone wants,
  /// and one form fewer on a phone.
  factory CardBilling.fromAddress(
    Address address, {
    required String holderName,
    required String email,
  }) {
    final (first, last) = splitName(holderName);
    return CardBilling(
      firstName: first,
      lastName: last,
      address1: address.line1,
      locality: address.city,
      // Zambian addresses often have no province filled in; the API needs
      // something here, and the city is the honest nearest answer.
      administrativeArea: (address.region?.trim().isNotEmpty ?? false)
          ? address.region!.trim()
          : address.city,
      postalCode: address.postalCode,
      country: address.country.toUpperCase(),
      email: email,
    );
  }

  final String firstName;
  final String lastName;
  final String address1;
  final String locality;
  final String administrativeArea;
  final String postalCode;

  /// ISO 3166-1 alpha-2, upper case.
  final String country;
  final String email;

  Json toJson() => {
    'firstName': firstName,
    'lastName': lastName,
    'address1': address1,
    'locality': locality,
    'administrativeArea': administrativeArea,
    'postalCode': postalCode,
    'country': country,
    'email': email,
  };
}

/// First word, and the rest — the web storefront's rule, so both clients
/// send a name the same way. A single-word name is used for both parts,
/// because the API requires a last name.
(String, String) splitName(String name) {
  final parts = name.trim().split(RegExp(r'\s+'));
  if (parts.length < 2) return (parts.first, parts.first);
  return (parts.first, parts.skip(1).join(' '));
}

class CardDetails {
  const CardDetails({
    required this.number,
    required this.expiry,
    required this.securityCode,
    required this.holderName,
    required this.billing,
  });

  /// Digits only.
  final String number;
  final CardExpiry expiry;
  final String securityCode;
  final String holderName;
  final CardBilling billing;

  Json toJson() => {
    'number': number,
    'expiryMonth': expiry.wireMonth,
    'expiryYear': expiry.wireYear,
    'securityCode': securityCode,
    'holderName': holderName.trim(),
    'billing': billing.toJson(),
  };

  @override
  String toString() =>
      'CardDetails(•••• ${number.substring(number.length - 4)})';
}

/// Turns a gateway failure into something a shopper can act on. The raw
/// reason ("VALIDATION_ERROR: The payment request was rejected as invalid")
/// is for the logs, not the checkout screen.
String describeCardFailure(String? reason) {
  final text = (reason ?? '').toUpperCase();
  if (text.contains('DECLINE') || text.contains('INSUFFICIENT')) {
    return 'Your bank declined this card. Try another card, or pay with '
        'mobile money.';
  }
  if (text.contains('EXPIRED')) {
    return 'Your bank says this card has expired. Try another card.';
  }
  if (text.contains('VALIDATION') || text.contains('INVALID')) {
    return "The bank didn't accept these card details. Check the number, "
        'expiry date and security code, then try again.';
  }
  return "The card payment didn't go through, and you haven't been charged. "
      'Try again, or pay with mobile money.';
}
