import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../app/services.dart';
import '../../design/design.dart';
import 'auth_form.dart';

class SignInPage extends StatefulWidget {
  const SignInPage({super.key, this.from});

  /// Where the user was headed; see [leaveAuthPage].
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
    final ok = await submit(
      () => context.services.session.signIn(_email.text, _password.text),
    );
    if (ok) leaveAuthPage(router, widget.from);
  }

  @override
  Widget build(BuildContext context) {
    final query = widget.from == null
        ? ''
        : '?from=${Uri.encodeComponent(widget.from!)}';
    return PageScaffold(
      title: 'Sign in',
      actions: [
        IconAction(
          icon: Glyphs.server,
          semanticLabel: 'Server settings',
          onPressed: () => context.push('/settings/server'),
        ),
      ],
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
                      'Your cart, orders and saved items are waiting.',
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
                      obscureText: _obscure,
                      autofillHints: const [AutofillHints.password],
                      textInputAction: TextInputAction.done,
                      onSubmitted: (_) => _signIn(),
                      serverError: fieldErrors['password'],
                      validator: (value) => requiredField(value, 'Password'),
                      trailing: IconAction(
                        icon: _obscure ? Glyphs.eye : Glyphs.eyeOff,
                        semanticLabel: _obscure
                            ? 'Show password'
                            : 'Hide password',
                        size: 20,
                        onPressed: () => setState(() => _obscure = !_obscure),
                      ),
                    ),
                    Align(
                      alignment: Alignment.centerRight,
                      child: LinkAction(
                        label: 'Forgot password?',
                        onPressed: () => context.push('/password-reset'),
                      ),
                    ),
                    const SizedBox(height: Space.x2),
                    Button(
                      label: 'Sign in',
                      loading: submitting,
                      onPressed: _signIn,
                    ),
                    const SizedBox(height: Space.x3),
                    Button(
                      label: 'Create an account',
                      variant: ButtonVariant.secondary,
                      onPressed: () =>
                          context.pushReplacement('/register$query'),
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
