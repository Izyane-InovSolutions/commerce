import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../app/router.dart' show safeFrom;
import '../../core/network/api_exception.dart';

/// Holds a form's submit state and maps API validation errors onto fields.
mixin FormSubmission<T extends StatefulWidget> on State<T> {
  final formKey = GlobalKey<FormState>();
  bool submitting = false;
  String? formError;
  Map<String, String> fieldErrors = const {};

  /// Validates locally, then runs [action]. API failures are shown, not
  /// thrown: validation errors under their fields, anything else above the
  /// submit button.
  Future<bool> submit(Future<void> Function() action) async {
    FocusScope.of(context).unfocus();
    setState(() {
      formError = null;
      fieldErrors = const {};
    });
    if (!(formKey.currentState?.validate() ?? false)) return false;

    setState(() => submitting = true);
    try {
      await action();
      return true;
    } on ApiException catch (error) {
      if (!mounted) return false;
      setState(() {
        fieldErrors = error.fieldErrors;
        formError = error.fieldErrors.isEmpty ? error.message : null;
      });
      return false;
    } catch (error) {
      if (!mounted) return false;
      setState(() => formError = describeError(error));
      return false;
    } finally {
      if (mounted) setState(() => submitting = false);
    }
  }
}

class FormErrorBanner extends StatelessWidget {
  const FormErrorBanner(this.message, {super.key});

  final String? message;

  @override
  Widget build(BuildContext context) {
    if (message == null) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: scheme.errorContainer,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(message!, style: TextStyle(color: scheme.onErrorContainer)),
    );
  }
}

class SubmitButton extends StatelessWidget {
  const SubmitButton({
    super.key,
    required this.label,
    required this.busy,
    required this.onPressed,
  });

  final String label;
  final bool busy;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return FilledButton(
      onPressed: busy ? null : onPressed,
      child: busy
          ? const SizedBox.square(
              dimension: 22, child: CircularProgressIndicator(strokeWidth: 2.5))
          : Text(label),
    );
  }
}

String? requiredField(String? value, String label) =>
    (value == null || value.trim().isEmpty) ? '$label is required' : null;

String? validateEmail(String? value) {
  final text = value?.trim() ?? '';
  if (text.isEmpty) return 'Email is required';
  if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(text)) {
    return 'Enter a valid email address';
  }
  return null;
}

/// Mirrors the API's register rule (minimum eight characters).
String? validateNewPassword(String? value) {
  if (value == null || value.isEmpty) return 'Password is required';
  if (value.length < 8) return 'Use at least 8 characters';
  return null;
}

/// Leaves an auth page once signed in.
///
/// Opened with `push` — tapping "Add to cart" or "Sign in" somewhere — it
/// pops back to that screen, which now renders signed-in. Reached through a
/// redirect from a protected route, there is nothing to pop to, so it goes to
/// the route that was asked for.
///
/// Takes the router rather than a context: capture it before submitting, so
/// leaving never depends on the page itself surviving the session change.
void leaveAuthPage(GoRouter router, String? from) {
  if (router.canPop()) {
    router.pop();
  } else {
    router.go(safeFrom(from) ?? '/');
  }
}
