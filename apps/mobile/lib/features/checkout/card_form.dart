import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import '../../design/design.dart';
import '../../domain/card.dart';
import 'checkout_controller.dart';

/// Card entry for checkout: number, expiry, security code and name, then
/// where the card is billed.
///
/// The text lives in this widget's controllers and in [CheckoutController],
/// and nowhere else — both are dropped when checkout closes. See the PCI
/// note in `domain/card.dart`.
class CardForm extends StatefulWidget {
  const CardForm({super.key, required this.checkout});

  final CheckoutController checkout;

  @override
  State<CardForm> createState() => _CardFormState();
}

class _CardFormState extends State<CardForm> {
  final _number = TextEditingController();
  final _expiry = TextEditingController();
  final _code = TextEditingController();
  final _name = TextEditingController();

  final _expiryFocus = FocusNode();
  final _codeFocus = FocusNode();
  final _nameFocus = FocusNode();

  CheckoutController get _checkout => widget.checkout;

  @override
  void dispose() {
    for (final controller in [_number, _expiry, _code, _name]) {
      controller
        ..clear()
        ..dispose();
    }
    _expiryFocus.dispose();
    _codeFocus.dispose();
    _nameFocus.dispose();
    super.dispose();
  }

  void _numberChanged(String value) {
    _checkout.setCardNumber(value);
    // A complete, valid number moves on to the expiry, as a card reader
    // would; a number with a problem stays put to be fixed.
    if (CardNumber.complete(value) && CardNumber.problem(value) == null) {
      _expiryFocus.requestFocus();
    }
  }

  void _expiryChanged(String value) {
    _checkout.setCardExpiry(value);
    if (CardExpiry.parse(value) != null) _codeFocus.requestFocus();
  }

  void _codeChanged(String value) {
    _checkout.setCardCode(value);
    if (value.length == 3) _nameFocus.requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final brand = _checkout.cardBrand;
    return AutofillGroup(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          InputField(
            controller: _number,
            label: 'Card number',
            hint: '1234 5678 9012 3456',
            leading: Glyphs.card,
            keyboardType: TextInputType.number,
            textInputAction: TextInputAction.next,
            autofillHints: const [AutofillHints.creditCardNumber],
            sensitive: true,
            inputFormatters: const [CardNumberFormatter()],
            onChanged: _numberChanged,
            error: _checkout.cardNumberError,
            trailing: brand.label == null
                ? null
                : Text(
                    brand.label!,
                    style: context.type.small.copyWith(
                      color: brand.accepted ? colors.inkMuted : colors.danger,
                      fontVariations: const [FontVariation('wght', 640)],
                    ),
                  ),
          ),
          const SizedBox(height: Space.x4),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: InputField(
                  controller: _expiry,
                  focusNode: _expiryFocus,
                  label: 'Expiry',
                  hint: 'MM/YY',
                  keyboardType: TextInputType.number,
                  textInputAction: TextInputAction.next,
                  autofillHints: const [AutofillHints.creditCardExpirationDate],
                  sensitive: true,
                  inputFormatters: const [CardExpiryFormatter()],
                  onChanged: _expiryChanged,
                  error: _checkout.cardExpiryError,
                ),
              ),
              const SizedBox(width: Space.x3),
              Expanded(
                child: InputField(
                  controller: _code,
                  focusNode: _codeFocus,
                  label: 'Security code',
                  hint: '123',
                  leading: Glyphs.lock,
                  keyboardType: TextInputType.number,
                  textInputAction: TextInputAction.next,
                  autofillHints: const [AutofillHints.creditCardSecurityCode],
                  sensitive: true,
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(3),
                  ],
                  onChanged: _codeChanged,
                  error: _checkout.cardCodeError,
                ),
              ),
            ],
          ),
          const SizedBox(height: Space.x4),
          InputField(
            controller: _name,
            focusNode: _nameFocus,
            label: 'Name on card',
            hint: 'As printed on the card',
            textCapitalization: TextCapitalization.words,
            textInputAction: TextInputAction.done,
            autofillHints: const [AutofillHints.creditCardName],
            autocorrect: false,
            inputFormatters: [LengthLimitingTextInputFormatter(150)],
            onChanged: _checkout.setCardName,
            error: _checkout.cardNameError,
          ),
        ],
      ),
    );
  }
}

/// A billing address typed by hand, shown when the card is not billed to
/// the delivery address.
class BillingForm extends StatefulWidget {
  const BillingForm({super.key, required this.checkout});

  final CheckoutController checkout;

  @override
  State<BillingForm> createState() => _BillingFormState();
}

class _BillingFormState extends State<BillingForm> {
  late final _line1 = TextEditingController(text: _billing.line1);
  late final _city = TextEditingController(text: _billing.city);
  late final _region = TextEditingController(text: _billing.region);
  late final _postal = TextEditingController(text: _billing.postalCode);
  late final _country = TextEditingController(text: _billing.country);

  CheckoutController get _checkout => widget.checkout;
  BillingDraft get _billing => _checkout.billing;

  @override
  void dispose() {
    for (final c in [_line1, _city, _region, _postal, _country]) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AutofillGroup(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          InputField(
            controller: _line1,
            label: 'Street address',
            autofillHints: const [AutofillHints.streetAddressLine1],
            textCapitalization: TextCapitalization.words,
            textInputAction: TextInputAction.next,
            inputFormatters: [LengthLimitingTextInputFormatter(200)],
            onChanged: (v) => _checkout.setBilling(_billing.copyWith(line1: v)),
            error: _checkout.billingError(BillingField.line1),
          ),
          const SizedBox(height: Space.x4),
          InputField(
            controller: _city,
            label: 'City',
            autofillHints: const [AutofillHints.addressCity],
            textCapitalization: TextCapitalization.words,
            textInputAction: TextInputAction.next,
            inputFormatters: [LengthLimitingTextInputFormatter(100)],
            onChanged: (v) => _checkout.setBilling(_billing.copyWith(city: v)),
            error: _checkout.billingError(BillingField.city),
          ),
          const SizedBox(height: Space.x4),
          InputField(
            controller: _region,
            label: 'Province or state (optional)',
            autofillHints: const [AutofillHints.addressState],
            textCapitalization: TextCapitalization.words,
            textInputAction: TextInputAction.next,
            inputFormatters: [LengthLimitingTextInputFormatter(100)],
            onChanged: (v) =>
                _checkout.setBilling(_billing.copyWith(region: v)),
          ),
          const SizedBox(height: Space.x4),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: InputField(
                  controller: _postal,
                  label: 'Postal code',
                  autofillHints: const [AutofillHints.postalCode],
                  textInputAction: TextInputAction.next,
                  inputFormatters: [LengthLimitingTextInputFormatter(20)],
                  onChanged: (v) =>
                      _checkout.setBilling(_billing.copyWith(postalCode: v)),
                  error: _checkout.billingError(BillingField.postalCode),
                ),
              ),
              const SizedBox(width: Space.x3),
              Expanded(
                child: InputField(
                  controller: _country,
                  label: 'Country code',
                  hint: 'ZM',
                  autofillHints: const [AutofillHints.countryCode],
                  textCapitalization: TextCapitalization.characters,
                  textInputAction: TextInputAction.done,
                  autocorrect: false,
                  inputFormatters: [
                    FilteringTextInputFormatter.allow(RegExp('[A-Za-z]')),
                    LengthLimitingTextInputFormatter(2),
                  ],
                  onChanged: (v) =>
                      _checkout.setBilling(_billing.copyWith(country: v)),
                  error: _checkout.billingError(BillingField.country),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Keeps a card number in printed groups as it is typed or pasted, with
/// the cursor staying after the same digit it was after.
class CardNumberFormatter extends TextInputFormatter {
  const CardNumberFormatter();

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    var digits = CardNumber.digits(newValue.text);
    if (digits.length > CardNumber.maxLength) {
      digits = digits.substring(0, CardNumber.maxLength);
    }
    final formatted = CardNumber.format(digits);
    final cursor = newValue.selection.end.clamp(0, newValue.text.length);
    final digitsBefore = CardNumber.digits(
      newValue.text.substring(0, cursor),
    ).length.clamp(0, digits.length);
    return TextEditingValue(
      text: formatted,
      selection: TextSelection.collapsed(
        offset: _offsetAfterDigits(formatted, digitsBefore),
      ),
    );
  }
}

/// `MM/YY`, with the slash put in for you. A first digit that can only
/// start a single-digit month (2–9) is read as that month: `4` → `04/`.
class CardExpiryFormatter extends TextInputFormatter {
  const CardExpiryFormatter();

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    var digits = newValue.text.replaceAll(RegExp(r'\D'), '');
    final deleting = newValue.text.length < oldValue.text.length;
    if (digits.length == 1 && int.parse(digits) > 1 && !deleting) {
      digits = '0$digits';
    }
    if (digits.length > 4) digits = digits.substring(0, 4);
    final String text;
    if (digits.length > 2) {
      text = '${digits.substring(0, 2)}/${digits.substring(2)}';
    } else if (digits.length == 2 && !deleting) {
      text = '$digits/';
    } else {
      text = digits;
    }
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
  }
}

int _offsetAfterDigits(String formatted, int count) {
  if (count == 0) return 0;
  var seen = 0;
  for (var i = 0; i < formatted.length; i++) {
    final c = formatted.codeUnitAt(i);
    if (c >= 48 && c <= 57 && ++seen == count) return i + 1;
  }
  return formatted.length;
}
