import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../app/services.dart';
import '../../core/network/api_exception.dart';
import '../../core/widgets/state_views.dart';
import '../../design/design.dart';
import '../../domain/seller_catalog.dart';
import '../../domain/selling.dart';

/// How the shop appears to customers: its name, web address and
/// description. A listing can only go on sale once the name and address
/// are set.
class StorefrontPage extends StatefulWidget {
  const StorefrontPage({super.key, required this.account});

  final SellerAccount account;

  @override
  State<StorefrontPage> createState() => _StorefrontPageState();
}

class _StorefrontPageState extends State<StorefrontPage> {
  final _form = GlobalKey<FormState>();
  late final _name = TextEditingController(
    text: widget.account.displayName ?? widget.account.businessName,
  );
  late final _slug = TextEditingController(
    text: widget.account.storefrontSlug ?? slugify(widget.account.businessName),
  );
  late final _description = TextEditingController(
    text: widget.account.description,
  );
  bool _saving = false;
  ApiException? _error;

  @override
  void dispose() {
    for (final c in [_name, _slug, _description]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await context.services.selling.saveStorefront(
        widget.account,
        slug: _slug.text.trim(),
        displayName: _name.text,
        description: _description.text,
      );
      if (!mounted) return;
      showMessage(context, 'Shop details saved');
      context.pop(true);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final server = _error?.fieldErrors;
    return PageScaffold(
      title: 'Shop details',
      bottomBar: Button(
        label: 'Save',
        loading: _saving,
        onPressed: _saving ? null : _save,
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
            child: Form(
              key: _form,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  InputFormField(
                    controller: _name,
                    label: 'Shop name',
                    helper: 'What customers see on your listings.',
                    textCapitalization: TextCapitalization.words,
                    serverError: server?['displayName'],
                    validator: (v) => v.trim().length < 2
                        ? 'Enter a name'
                        : v.trim().length > 120
                        ? 'Use 120 characters or fewer'
                        : null,
                  ),
                  const SizedBox(height: Space.x4),
                  InputFormField(
                    controller: _slug,
                    label: 'Shop address',
                    helper:
                        'Lowercase letters, numbers and hyphens, like '
                        'zawadi-dealers.',
                    autocorrect: false,
                    inputFormatters: [
                      FilteringTextInputFormatter.allow(RegExp('[a-z0-9-]')),
                      LengthLimitingTextInputFormatter(100),
                    ],
                    serverError: server?['storefrontSlug'],
                    validator: (v) =>
                        RegExp(r'^[a-z0-9]+(?:-[a-z0-9]+)*$').hasMatch(v) &&
                            v.length >= 3
                        ? null
                        : 'At least 3 characters; hyphens only between words',
                  ),
                  const SizedBox(height: Space.x4),
                  InputFormField(
                    controller: _description,
                    label: 'About your shop',
                    maxLines: 6,
                    textCapitalization: TextCapitalization.sentences,
                    inputFormatters: [LengthLimitingTextInputFormatter(2000)],
                  ),
                  if (_error != null && _error!.fieldErrors.isEmpty) ...[
                    const SizedBox(height: Space.x4),
                    Callout(message: _error!.message, tone: Tone.danger),
                  ],
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}
