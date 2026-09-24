import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../app/services.dart';
import 'auth_form.dart';

class RegisterPage extends StatefulWidget {
  const RegisterPage({super.key, this.from});

  final String? from;

  @override
  State<RegisterPage> createState() => _RegisterPageState();
}

class _RegisterPageState extends State<RegisterPage> with FormSubmission {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _register() async {
    final router = GoRouter.of(context);
    final ok = await submit(() => context.services.session.register(_email.text, _password.text));
    if (ok) leaveAuthPage(router, widget.from);
  }

  @override
  Widget build(BuildContext context) {
    final query = widget.from == null ? '' : '?from=${Uri.encodeComponent(widget.from!)}';
    return Scaffold(
      appBar: AppBar(title: const Text('Create account')),
      body: SafeArea(
        child: Form(
          key: formKey,
          child: ListView(
            padding: const EdgeInsets.all(24),
            children: [
              Text('Join Commerce',
                  style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 24),
              FormErrorBanner(formError),
              TextFormField(
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                autofillHints: const [AutofillHints.email],
                textInputAction: TextInputAction.next,
                decoration: InputDecoration(
                    labelText: 'Email', errorText: fieldErrors['email']),
                validator: validateEmail,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _password,
                obscureText: true,
                autofillHints: const [AutofillHints.newPassword],
                textInputAction: TextInputAction.next,
                decoration: InputDecoration(
                  labelText: 'Password',
                  helperText: 'At least 8 characters',
                  errorText: fieldErrors['password'],
                ),
                validator: validateNewPassword,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _confirm,
                obscureText: true,
                textInputAction: TextInputAction.done,
                onFieldSubmitted: (_) => _register(),
                decoration: const InputDecoration(labelText: 'Confirm password'),
                validator: (value) =>
                    value == _password.text ? null : "Passwords don't match",
              ),
              const SizedBox(height: 24),
              SubmitButton(
                  label: 'Create account', busy: submitting, onPressed: _register),
              const SizedBox(height: 12),
              TextButton(
                onPressed: () => context.pushReplacement('/sign-in$query'),
                child: const Text('I already have an account'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
