import 'package:commerce_mobile/domain/account.dart';
import 'package:commerce_mobile/domain/card.dart';
import 'package:commerce_mobile/features/checkout/card_form.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

TextEditingValue _type(TextInputFormatter formatter, String old, String next) =>
    formatter.formatEditUpdate(
      TextEditingValue(
        text: old,
        selection: TextSelection.collapsed(offset: old.length),
      ),
      TextEditingValue(
        text: next,
        selection: TextSelection.collapsed(offset: next.length),
      ),
    );

void main() {
  group('card number', () {
    test('passes the Luhn check only for real numbers', () {
      expect(CardNumber.luhn('4111111111111111'), isTrue);
      expect(CardNumber.luhn('5555555555554444'), isTrue);
      expect(CardNumber.luhn('4111111111111112'), isFalse);
      expect(CardNumber.luhn(''), isFalse);
    });

    test('tells brands apart by prefix', () {
      expect(CardNumber.brand('4111'), CardBrand.visa);
      expect(CardNumber.brand('5500'), CardBrand.mastercard);
      expect(CardNumber.brand('2221'), CardBrand.mastercard);
      expect(CardNumber.brand('3782'), CardBrand.amex);
      expect(CardNumber.brand('6011'), CardBrand.other);
    });

    test('refuses Amex, whose 4-digit code the API would reject', () {
      expect(CardNumber.problem('378282246310005'), contains('American'));
      expect(CardNumber.complete('37'), isTrue, reason: 'say so at once');
    });

    test('waits for a whole number before calling it wrong', () {
      expect(CardNumber.complete('4111 1111'), isFalse);
      expect(CardNumber.complete('4111 1111 1111 1112'), isTrue);
      expect(CardNumber.problem('4111 1111 1111 1112'), isNotNull);
      expect(CardNumber.problem('4111 1111 1111 1111'), isNull);
    });

    test('prints in groups as typed, and caps at 19 digits', () {
      const f = CardNumberFormatter();
      expect(_type(f, '', '41111111').text, '4111 1111');
      expect(_type(f, '', '4111111111111111').text, '4111 1111 1111 1111');
      expect(_type(f, '', '4' * 25).text.replaceAll(' ', ''), hasLength(19));
      expect(_type(f, '', '4111-1111 abc').text, '4111 1111');
    });

    test('keeps the cursor after the same digit when editing mid-number', () {
      const f = CardNumberFormatter();
      // Deleting the 5th digit of "4111 2111" with the cursor after it.
      final result = f.formatEditUpdate(
        const TextEditingValue(
          text: '4111 2111',
          selection: TextSelection.collapsed(offset: 6),
        ),
        const TextEditingValue(
          text: '4111 111',
          selection: TextSelection.collapsed(offset: 5),
        ),
      );
      expect(result.text, '4111 111');
      expect(result.selection.baseOffset, 4, reason: 'after the 4th digit');
    });
  });

  group('expiry', () {
    final now = DateTime(2026, 9, 24);

    test('reads MM/YY and rejects impossible months', () {
      final expiry = CardExpiry.parse('07/29')!;
      expect((expiry.wireMonth, expiry.wireYear), ('07', '2029'));
      expect(CardExpiry.parse('13/29'), isNull);
      expect(CardExpiry.parse('00/29'), isNull);
      expect(CardExpiry.parse('7/29'), isNull);
    });

    test('a card is good through the end of its month', () {
      expect(CardExpiry.problem('09/26', now), isNull);
      expect(CardExpiry.problem('08/26', now), 'This card has expired');
      expect(CardExpiry.problem('01/25', now), 'This card has expired');
    });

    test('puts the slash in, and reads a lone 4 as April', () {
      const f = CardExpiryFormatter();
      expect(_type(f, '', '1').text, '1');
      expect(_type(f, '1', '12').text, '12/');
      expect(_type(f, '12/', '12/3').text, '12/3');
      expect(_type(f, '', '4').text, '04/');
      expect(_type(f, '12/', '12').text, '12', reason: 'backspace works');
      expect(_type(f, '', '12345').text, '12/34');
    });
  });

  test('security code is exactly 3 digits', () {
    expect(CardSecurityCode.problem('123'), isNull);
    expect(CardSecurityCode.problem('12'), isNotNull);
    expect(CardSecurityCode.problem('1234'), isNotNull);
  });

  test('splits a name the way the web storefront does', () {
    expect(splitName('Jane Doe'), ('Jane', 'Doe'));
    expect(splitName('  Jane  Mary Doe '), ('Jane', 'Mary Doe'));
    expect(splitName('Mononym'), ('Mononym', 'Mononym'));
  });

  test('billing from the delivery address fills every field the API needs', () {
    const address = Address(
      id: 'a',
      recipientName: 'Jane Doe',
      line1: 'Plot 12 Cairo Rd',
      city: 'Lusaka',
      postalCode: '10101',
      country: 'zm',
      isDefault: true,
    );
    final billing = CardBilling.fromAddress(
      address,
      holderName: 'Jane Doe',
      email: 'jane@example.test',
    );
    expect(billing.toJson(), {
      'firstName': 'Jane',
      'lastName': 'Doe',
      'address1': 'Plot 12 Cairo Rd',
      'locality': 'Lusaka',
      // No province on the address: the city stands in, as it must be set.
      'administrativeArea': 'Lusaka',
      'postalCode': '10101',
      'country': 'ZM',
      'email': 'jane@example.test',
    });
  });

  test('never prints a card number in full', () {
    final card = CardDetails(
      number: '4111111111111111',
      expiry: const CardExpiry(12, 2030),
      securityCode: '123',
      holderName: 'Jane Doe',
      billing: const CardBilling(
        firstName: 'Jane',
        lastName: 'Doe',
        address1: 'x',
        locality: 'x',
        administrativeArea: 'x',
        postalCode: 'x',
        country: 'ZM',
        email: 'x@y.z',
      ),
    );
    expect('$card', isNot(contains('411111')));
    expect('$card', isNot(contains('123')));
    expect('$card', contains('1111'));
  });

  test('turns gateway failure codes into something to act on', () {
    expect(
      describeCardFailure(
        'VALIDATION_ERROR: The payment request was rejected as invalid',
      ),
      contains('Check the number'),
    );
    expect(describeCardFailure('PAYMENT_DECLINED'), contains('declined'));
    expect(describeCardFailure(null), contains("haven't been charged"));
  });
}
