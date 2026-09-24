import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../app/services.dart';
import 'auth_form.dart';

class SignInPage extends StatefulWidget {
  const SignInPage({super.key, this.from});

  /// Where to go once signed in. The router sends the user there as soon as
  /// the session changes, so this page never navigates on success itself.
  final String? from;

  @override
  State<SignInPage> createState() => _SignInPageState();
}

class _SignInPageState extends State<SignInPage> with FormSubmission {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _obscure = true;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _signIn() async {
    final router = GoRouter.of(context);
    final ok = await submit(() => context.services.session.signIn(_email.text, _password.text));
    if (ok) leaveAuthPage(router, widget.from);
  }

  @override
  Widget build(BuildContext context) {
    final query = widget.from == null ? '' : '?from=${Uri.encodeComponent(widget.from!)}';
    return Scaffold(
      appBar: AppBar(
        title: const Text('Sign in'),
        actions: [
          IconButton(
            tooltip: 'Server settings',
            icon: const Icon(Icons.dns_outlined),
            onPressed: () => context.push('/settings/server'),
          ),
        ],
      ),
      body: SafeArea(
        child: Form(
          key: formKey,
          child: ListView(
            padding: const EdgeInsets.all(24),
            children: [
              Text('Welcome back',
                  style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 8),
              Text('Sign in to see your cart, orders and saved items.',
                  style: Theme.of(context).textTheme.bodyMedium),
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
                obscureText: _obscure,
                autofillHints: const [AutofillHints.password],
                textInputAction: TextInputAction.done,
                onFieldSubmitted: (_) => _signIn(),
                decoration: InputDecoration(
                  labelText: 'Password',
                  errorText: fieldErrors['password'],
                  suffixIcon: IconButton(
                    tooltip: _obscure ? 'Show password' : 'Hide password',
                    icon: Icon(_obscure ? Icons.visibility : Icons.visibility_off),
                    onPressed: () => setState(() => _obscure = !_obscure),
                  ),
                ),
                validator: (value) => requiredField(value, 'Password'),
              ),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: () => context.push('/password-reset'),
                  child: const Text('Forgot password?'),
                ),
              ),
              const SizedBox(height: 8),
              SubmitButton(label: 'Sign in', busy: submitting, onPressed: _signIn),
              const SizedBox(height: 12),
              OutlinedButton(
                onPressed: () => context.pushReplacement('/register$query'),
                child: const Text('Create an account'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
