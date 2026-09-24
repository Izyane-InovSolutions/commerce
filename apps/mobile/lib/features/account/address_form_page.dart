import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../app/services.dart';
import '../../design/design.dart';
import '../../domain/account.dart';
import '../auth/auth_form.dart';

/// Create or edit an address. Pops with the saved [Address], so a caller
/// such as checkout can select it straight away.
class AddressFormPage extends StatefulWidget {
  const AddressFormPage({super.key, this.address});

  /// Null to create a new address.
  final Address? address;

  @override
  State<AddressFormPage> createState() => _AddressFormPageState();
}

class _AddressFormPageState extends State<AddressFormPage> with FormSubmission {
  late final Map<String, TextEditingController> _fields;

  @override
  void initState() {
    super.initState();
    final a = widget.address;
    _fields = {
      'label': TextEditingController(text: a?.label),
      'recipientName': TextEditingController(text: a?.recipientName),
      'phone': TextEditingController(text: a?.phone),
      'line1': TextEditingController(text: a?.line1),
      'line2': TextEditingController(text: a?.line2),
      'city': TextEditingController(text: a?.city),
      'region': TextEditingController(text: a?.region),
      'postalCode': TextEditingController(text: a?.postalCode),
      // The marketplace delivers within Zambia; the common case needs no typing.
      'country': TextEditingController(text: a?.country ?? 'ZM'),
    };
  }

  @override
  void dispose() {
    for (final controller in _fields.values) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    Address? saved;
    final ok = await submit(() async {
      String text(String key) => _fields[key]!.text;
      final draft = AddressDraft(
        label: text('label'),
        recipientName: text('recipientName'),
        phone: text('phone'),
        line1: text('line1'),
        line2: text('line2'),
        city: text('city'),
        region: text('region'),
        postalCode: text('postalCode'),
        country: text('country'),
      );
      final account = context.services.account;
      saved = widget.address == null
          ? await account.createAddress(draft)
          : await account.updateAddress(widget.address!.id, draft);
    });
    if (ok && mounted) context.pop(saved);
  }

  Widget _field(
    String key,
    String label, {
    bool required = false,
    String? helper,
    TextInputType? keyboard,
    TextCapitalization caps = TextCapitalization.words,
    Iterable<String>? autofill,
    String? Function(String value)? validator,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: Space.x5),
    child: InputFormField(
      controller: _fields[key]!,
      label: required ? label : '$label (optional)',
      helper: helper,
      keyboardType: keyboard,
      textCapitalization: caps,
      textInputAction: TextInputAction.next,
      autofillHints: autofill,
      serverError: fieldErrors[key],
      validator:
          validator ?? (required ? (v) => requiredField(v, label) : null),
    ),
  );

  @override
  Widget build(BuildContext context) {
    return PageScaffold(
      title: widget.address == null ? 'New address' : 'Edit address',
      bottomBar: Button(
        label: 'Save address',
        loading: submitting,
        onPressed: _save,
      ),
      slivers: [
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(
            Space.gutter,
            Space.x2,
            Space.gutter,
            0,
          ),
          sliver: SliverToBoxAdapter(
            child: AutofillGroup(
              child: Form(
                key: formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    FormErrorBanner(formError),
                    _field(
                      'recipientName',
                      'Full name',
                      required: true,
                      autofill: const [AutofillHints.name],
                    ),
                    _field(
                      'phone',
                      'Phone',
                      keyboard: TextInputType.phone,
                      helper: 'For the driver, if they need to find you',
                      autofill: const [AutofillHints.telephoneNumber],
                    ),
                    _field(
                      'line1',
                      'Address line 1',
                      required: true,
                      autofill: const [AutofillHints.streetAddressLine1],
                    ),
                    _field(
                      'line2',
                      'Address line 2',
                      autofill: const [AutofillHints.streetAddressLine2],
                    ),
                    _field(
                      'city',
                      'City',
                      required: true,
                      autofill: const [AutofillHints.addressCity],
                    ),
                    _field(
                      'region',
                      'Province',
                      autofill: const [AutofillHints.addressState],
                    ),
                    _field(
                      'postalCode',
                      'Postal code',
                      required: true,
                      keyboard: TextInputType.number,
                      autofill: const [AutofillHints.postalCode],
                    ),
                    _field(
                      'country',
                      'Country code',
                      required: true,
                      caps: TextCapitalization.characters,
                      helper: 'Two letters, like ZM',
                      validator: (value) =>
                          RegExp(r'^[A-Za-z]{2}$').hasMatch(value.trim())
                          ? null
                          : 'Use the two-letter code, like ZM',
                    ),
                    _field('label', 'Label', helper: 'Home, Work, Mum’s place'),
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
