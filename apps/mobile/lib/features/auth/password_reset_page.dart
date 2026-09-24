import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../app/services.dart';
import '../../core/widgets/state_views.dart';
import '../../design/design.dart';
import 'auth_form.dart';

/// Request a reset, then set a new password with the code from the email.
///
/// The code is pasted in: opening the email link straight into the app needs
/// deep links, which are part of the later platform-services work.
class PasswordResetPage extends StatefulWidget {
  const PasswordResetPage({super.key});

  @override
  State<PasswordResetPage> createState() => _PasswordResetPageState();
}

class _PasswordResetPageState extends State<PasswordResetPage>
    with FormSubmission {
  final _email = TextEditingController();
  final _token = TextEditingController();
  final _password = TextEditingController();
  bool _requested = false;

  @override
  void dispose() {
    _email.dispose();
    _token.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _request() async {
    final ok = await submit(
      () => context.services.auth.requestPasswordReset(_email.text),
    );
    if (ok && mounted) setState(() => _requested = true);
  }

  Future<void> _confirm() async {
    final ok = await submit(
      () => context.services.auth.confirmPasswordReset(
        _token.text,
        _password.text,
      ),
    );
    if (ok && mounted) {
      showMessage(context, 'Password updated. Sign in with your new password.');
      context.pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final muted = context.type.body.copyWith(color: context.colors.inkMuted);
    return PageScaffold(
      title: 'Reset password',
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
                  if (!_requested) ...[
                    Text(
                      "Enter your account's email and we'll send a reset code.",
                      style: muted,
                    ),
                    const SizedBox(height: Space.x6),
                    InputFormField(
                      controller: _email,
                      label: 'Email',
                      keyboardType: TextInputType.emailAddress,
                      autocorrect: false,
                      serverError: fieldErrors['email'],
                      validator: validateEmail,
                    ),
                    const SizedBox(height: Space.x6),
                    Button(
                      label: 'Send reset code',
                      loading: submitting,
                      onPressed: _request,
                    ),
                    const SizedBox(height: Space.x2),
                    Button(
                      label: 'I already have a code',
                      variant: ButtonVariant.ghost,
                      onPressed: () => setState(() => _requested = true),
                    ),
                  ] else ...[
                    // The API answers the same whether or not the address has
                    // an account, so as not to reveal which emails are
                    // registered — and this copy must not either.
                    Text(
                      'If an account exists for that email, a reset code is on '
                      'its way. Paste it here with your new password.',
                      style: muted,
                    ),
                    const SizedBox(height: Space.x6),
                    InputFormField(
                      controller: _token,
                      label: 'Reset code',
                      autocorrect: false,
                      serverError: fieldErrors['token'],
                      validator: (value) => requiredField(value, 'Reset code'),
                    ),
                    fieldGap,
                    InputFormField(
                      controller: _password,
                      label: 'New password',
                      helper: 'At least 8 characters',
                      obscureText: true,
                      serverError: fieldErrors['newPassword'],
                      validator: validateNewPassword,
                    ),
                    const SizedBox(height: Space.x6),
                    Button(
                      label: 'Update password',
                      loading: submitting,
                      onPressed: _confirm,
                    ),
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
