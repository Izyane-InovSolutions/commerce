import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../app/services.dart';
import '../../design/design.dart';
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
    final ok = await submit(
      () => context.services.session.register(_email.text, _password.text),
    );
    if (ok) leaveAuthPage(router, widget.from);
  }

  @override
  Widget build(BuildContext context) {
    final query = widget.from == null
        ? ''
        : '?from=${Uri.encodeComponent(widget.from!)}';
    return PageScaffold(
      title: 'Create account',
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
                    Text(
                      'One account for shopping, tracking orders and paying with mobile money.',
                      style: context.type.body.copyWith(
                        color: context.colors.inkMuted,
                      ),
                    ),
                    const SizedBox(height: Space.x6),
                    FormErrorBanner(formError),
                    InputFormField(
                      controller: _email,
                      label: 'Email',
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [AutofillHints.email],
                      textInputAction: TextInputAction.next,
                      autocorrect: false,
                      serverError: fieldErrors['email'],
                      validator: validateEmail,
                    ),
                    fieldGap,
                    InputFormField(
                      controller: _password,
                      label: 'Password',
                      helper: 'At least 8 characters',
                      obscureText: true,
                      autofillHints: const [AutofillHints.newPassword],
                      textInputAction: TextInputAction.next,
                      serverError: fieldErrors['password'],
                      validator: validateNewPassword,
                    ),
                    fieldGap,
                    InputFormField(
                      controller: _confirm,
                      label: 'Confirm password',
                      obscureText: true,
                      textInputAction: TextInputAction.done,
                      onSubmitted: (_) => _register(),
                      validator: (value) => value == _password.text
                          ? null
                          : "Passwords don't match",
                    ),
                    const SizedBox(height: Space.x6),
                    Button(
                      label: 'Create account',
                      loading: submitting,
                      onPressed: _register,
                    ),
                    const SizedBox(height: Space.x2),
                    Button(
                      label: 'I already have an account',
                      variant: ButtonVariant.ghost,
                      onPressed: () =>
                          context.pushReplacement('/sign-in$query'),
                    ),
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
