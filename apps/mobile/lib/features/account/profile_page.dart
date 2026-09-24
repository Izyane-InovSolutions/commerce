import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import '../../app/services.dart';
import '../../core/state/loader.dart';
import '../../core/widgets/state_views.dart';
import '../../design/design.dart';
import '../../domain/auth.dart';
import '../auth/auth_form.dart';

class ProfilePage extends StatefulWidget {
  const ProfilePage({super.key});

  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> with FormSubmission {
  late final Loader<Profile> _profile;
  final _first = TextEditingController();
  final _last = TextEditingController();
  final _phone = TextEditingController();
  bool _initialised = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialised) return;
    _initialised = true;
    _profile = Loader(() async {
      final profile = await context.services.account.profile();
      _first.text = profile.firstName ?? '';
      _last.text = profile.lastName ?? '';
      _phone.text = profile.phone ?? '';
      return profile;
    });
  }

  @override
  void dispose() {
    _profile.dispose();
    _first.dispose();
    _last.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final ok = await submit(() async {
      final updated = await context.services.account.updateProfile(
        firstName: _first.text,
        lastName: _last.text,
        phone: _phone.text,
      );
      _profile.replace(updated);
    });
    if (ok && mounted) showMessage(context, 'Profile saved');
  }

  @override
  Widget build(BuildContext context) {
    return LoaderView(
      loader: _profile,
      placeholder: const PageScaffold(title: 'Profile', body: LoadingState()),
      builder: (context, profile) => PageScaffold(
        title: 'Profile',
        bottomBar: Button(
          label: 'Save profile',
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
              child: Form(
                key: formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    FormErrorBanner(formError),
                    Text(
                      profile.email,
                      style: context.type.body.copyWith(
                        color: context.colors.inkMuted,
                      ),
                    ),
                    const SizedBox(height: Space.x6),
                    InputFormField(
                      controller: _first,
                      label: 'First name',
                      textCapitalization: TextCapitalization.words,
                      autofillHints: const [AutofillHints.givenName],
                      serverError: fieldErrors['firstName'],
                    ),
                    fieldGap,
                    InputFormField(
                      controller: _last,
                      label: 'Last name',
                      textCapitalization: TextCapitalization.words,
                      autofillHints: const [AutofillHints.familyName],
                      serverError: fieldErrors['lastName'],
                    ),
                    fieldGap,
                    InputFormField(
                      controller: _phone,
                      label: 'Phone',
                      keyboardType: TextInputType.phone,
                      autofillHints: const [AutofillHints.telephoneNumber],
                      serverError: fieldErrors['phone'],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
