import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../app/services.dart';
import '../../core/widgets/state_views.dart';
import 'auth_form.dart';

/// Request a reset, then set a new password with the token from the email.
///
/// The token is typed or pasted in: opening the email link straight into the
/// app needs deep links, which are part of the later platform-services work.
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
        () => context.services.auth.requestPasswordReset(_email.text));
    if (ok && mounted) setState(() => _requested = true);
  }

  Future<void> _confirm() async {
    final ok = await submit(() => context.services.auth
        .confirmPasswordReset(_token.text, _password.text));
    if (ok && mounted) {
      showMessage(context, 'Password updated. Sign in with your new password.');
      context.pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Reset password')),
      body: SafeArea(
        child: Form(
          key: formKey,
          child: ListView(
            padding: const EdgeInsets.all(24),
            children: [
              FormErrorBanner(formError),
              if (!_requested) ...[
                Text("Enter your account's email and we'll send you a reset code.",
                    style: theme.textTheme.bodyLarge),
                const SizedBox(height: 24),
                TextFormField(
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  decoration: InputDecoration(
                      labelText: 'Email', errorText: fieldErrors['email']),
                  validator: validateEmail,
                ),
                const SizedBox(height: 24),
                SubmitButton(
                    label: 'Send reset code', busy: submitting, onPressed: _request),
                TextButton(
                  onPressed: () => setState(() => _requested = true),
                  child: const Text('I already have a code'),
                ),
              ] else ...[
                // The API answers the same whether or not the address has an
                // account, so as not to reveal which emails are registered.
                Text(
                  'If an account exists for that email, a reset code is on its '
                  'way. Paste it below with your new password.',
                  style: theme.textTheme.bodyLarge,
                ),
                const SizedBox(height: 24),
                TextFormField(
                  controller: _token,
                  decoration: InputDecoration(
                      labelText: 'Reset code', errorText: fieldErrors['token']),
                  validator: (value) => requiredField(value, 'Reset code'),
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _password,
                  obscureText: true,
                  decoration: InputDecoration(
                    labelText: 'New password',
                    helperText: 'At least 8 characters',
                    errorText: fieldErrors['newPassword'],
                  ),
                  validator: validateNewPassword,
                ),
                const SizedBox(height: 24),
                SubmitButton(
                    label: 'Update password', busy: submitting, onPressed: _confirm),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
