import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../app/brand.dart';
import '../../app/services.dart';
import '../../core/files/file_source.dart';
import '../../core/network/api_exception.dart';
import '../../core/widgets/state_views.dart';
import '../../design/design.dart';
import '../../domain/selling.dart';
import 'uploads.dart';

/// Applying to sell, or resubmitting after a rejection: the business, who
/// to contact, and the registration documents the Commerce team checks.
///
/// Documents upload as they are chosen; the application itself is one
/// request once they are all in.
class ApplyPage extends StatefulWidget {
  const ApplyPage({super.key, this.rejected});

  /// The rejected application being corrected, to start from its details.
  final SellerAccount? rejected;

  @override
  State<ApplyPage> createState() => _ApplyPageState();
}

class _ApplyPageState extends State<ApplyPage> {
  final _form = GlobalKey<FormState>();
  late final _business = TextEditingController(
    text: widget.rejected?.businessName,
  );
  late final _registration = TextEditingController(
    text: widget.rejected?.registrationNumber,
  );
  late final _country = TextEditingController(
    text: widget.rejected?.country ?? 'ZM',
  );
  late final _address = TextEditingController(
    text: widget.rejected?.businessAddress,
  );
  late final _email = TextEditingController();
  late final Uploads _documents;
  bool _initialised = false;
  bool _sending = false;
  String? _documentsError;
  ApiException? _error;

  bool get _resubmitting => widget.rejected != null;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialised) return;
    _initialised = true;
    final services = context.services;
    _email.text =
        widget.rejected?.contactEmail ?? services.session.user?.email ?? '';
    _documents = Uploads(
      files: services.files,
      media: services.media,
      kinds: const {FileKind.image, FileKind.pdf},
    );
  }

  @override
  void dispose() {
    for (final c in [_business, _registration, _country, _address, _email]) {
      c.dispose();
    }
    _documents.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final fieldsOk = _form.currentState!.validate();
    setState(() {
      _documentsError = _documents.items.isEmpty
          ? 'Add at least one document'
          : !_documents.allDone
          ? 'Wait for every document to finish uploading, or remove the '
                'ones that failed'
          : null;
    });
    if (!fieldsOk || _documentsError != null) return;

    final application = SellerApplication(
      businessName: _business.text,
      registrationNumber: _registration.text,
      country: _country.text,
      businessAddress: _address.text,
      contactEmail: _email.text,
      documentIds: _documents.assetIds,
    );
    setState(() {
      _sending = true;
      _error = null;
    });
    final selling = context.services.selling;
    try {
      _resubmitting
          ? await selling.resubmit(application)
          : await selling.apply(application);
      if (!mounted) return;
      showMessage(context, 'Application sent');
      context.pop(true);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  String? _server(String field) => _error?.fieldErrors[field];

  @override
  Widget build(BuildContext context) {
    final type = context.type;
    final colors = context.colors;
    String? length(String v, int min, int max, String what) =>
        v.trim().length < min
        ? 'Enter the $what'
        : v.trim().length > max
        ? 'Use $max characters or fewer'
        : null;

    return PageScaffold(
      title: _resubmitting ? 'Resubmit application' : 'Apply to sell',
      bottomBar: Button(
        label: _resubmitting ? 'Resubmit application' : 'Send application',
        loading: _sending,
        haptic: Haptic.medium,
        onPressed: _sending ? null : _submit,
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
                  Text(
                    _resubmitting
                        ? 'Correct what the team asked about, attach the '
                              'documents again, and it goes back for review.'
                        : 'The ${AppBrand.name} team checks these details against '
                              'your registration documents before you can '
                              'start selling.',
                    style: type.body.copyWith(color: colors.inkMuted),
                  ),
                  if (widget.rejected?.reviewReason case final reason?) ...[
                    const SizedBox(height: Space.x4),
                    Callout(message: reason, tone: Tone.danger),
                  ],
                  const SizedBox(height: Space.x6),
                  InputFormField(
                    controller: _business,
                    label: 'Registered business name',
                    textCapitalization: TextCapitalization.words,
                    textInputAction: TextInputAction.next,
                    autofillHints: const [AutofillHints.organizationName],
                    serverError: _server('businessName'),
                    validator: (v) => length(v, 2, 200, 'business name'),
                  ),
                  const SizedBox(height: Space.x4),
                  InputFormField(
                    controller: _registration,
                    label: 'Registration number',
                    hint: 'From PACRA, or your country’s registry',
                    textInputAction: TextInputAction.next,
                    autocorrect: false,
                    serverError: _server('registrationNumber'),
                    validator: (v) => length(v, 2, 100, 'registration number'),
                  ),
                  const SizedBox(height: Space.x4),
                  InputFormField(
                    controller: _address,
                    label: 'Business address',
                    maxLines: 4,
                    textCapitalization: TextCapitalization.words,
                    autofillHints: const [AutofillHints.fullStreetAddress],
                    serverError: _server('businessAddress'),
                    validator: (v) => length(v, 5, 1000, 'full address'),
                  ),
                  const SizedBox(height: Space.x4),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        flex: 3,
                        child: InputFormField(
                          controller: _email,
                          label: 'Contact email',
                          keyboardType: TextInputType.emailAddress,
                          autocorrect: false,
                          autofillHints: const [AutofillHints.email],
                          serverError: _server('contactEmail'),
                          validator: (v) =>
                              RegExp(
                                r'^[^@\s]+@[^@\s]+\.[^@\s]+$',
                              ).hasMatch(v.trim())
                              ? null
                              : 'Enter an email address',
                        ),
                      ),
                      const SizedBox(width: Space.x3),
                      Expanded(
                        flex: 2,
                        child: InputFormField(
                          controller: _country,
                          label: 'Country',
                          hint: 'ZM',
                          textCapitalization: TextCapitalization.characters,
                          autocorrect: false,
                          serverError: _server('country'),
                          validator: (v) =>
                              RegExp(r'^[A-Za-z]{2}$').hasMatch(v.trim())
                              ? null
                              : '2 letters, like ZM',
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: Space.x6),
                  UploadList(
                    uploads: _documents,
                    title: 'Registration documents',
                    addLabel: 'Add a document',
                    footer:
                        'Your certificate of incorporation or business '
                        'registration, and anything else that shows who '
                        'runs it. PDF or photo, up to 10 MB each, 10 at most.',
                    error: _documentsError,
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
