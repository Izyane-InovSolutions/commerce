import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../app/services.dart';
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
      // The marketplace ships from Zambia; the common case needs no typing.
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
      final draft = AddressDraft(
        label: _fields['label']!.text,
        recipientName: _fields['recipientName']!.text,
        phone: _fields['phone']!.text,
        line1: _fields['line1']!.text,
        line2: _fields['line2']!.text,
        city: _fields['city']!.text,
        region: _fields['region']!.text,
        postalCode: _fields['postalCode']!.text,
        country: _fields['country']!.text,
      );
      final account = context.services.account;
      saved = widget.address == null
          ? await account.createAddress(draft)
          : await account.updateAddress(widget.address!.id, draft);
    });
    if (ok && mounted) context.pop(saved);
  }

  Widget _field(String key, String label,
      {bool required = false,
      TextInputType? keyboard,
      TextCapitalization caps = TextCapitalization.words,
      String? Function(String?)? validator}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: TextFormField(
        controller: _fields[key],
        keyboardType: keyboard,
        textCapitalization: caps,
        textInputAction: TextInputAction.next,
        decoration: InputDecoration(
          labelText: required ? label : '$label (optional)',
          errorText: fieldErrors[key],
        ),
        validator: validator ?? (required ? (v) => requiredField(v, label) : null),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.address == null ? 'New address' : 'Edit address')),
      body: Form(
        key: formKey,
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            FormErrorBanner(formError),
            _field('recipientName', 'Full name', required: true),
            _field('phone', 'Phone', keyboard: TextInputType.phone),
            _field('line1', 'Address line 1', required: true),
            _field('line2', 'Address line 2'),
            _field('city', 'City', required: true),
            _field('region', 'Province'),
            _field('postalCode', 'Postal code', required: true, keyboard: TextInputType.number),
            _field('country', 'Country code',
                required: true,
                caps: TextCapitalization.characters,
                validator: (value) => RegExp(r'^[A-Za-z]{2}$').hasMatch(value?.trim() ?? '')
                    ? null
                    : 'Use the two-letter code, e.g. ZM'),
            _field('label', 'Label, e.g. Home or Work'),
            const SizedBox(height: 8),
            SubmitButton(label: 'Save address', busy: submitting, onPressed: _save),
          ],
        ),
      ),
    );
  }
}
