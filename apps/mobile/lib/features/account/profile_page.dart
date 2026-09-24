import 'package:flutter/material.dart';

import '../../app/services.dart';
import '../../core/state/loader.dart';
import '../../core/widgets/state_views.dart';
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
          firstName: _first.text, lastName: _last.text, phone: _phone.text);
      _profile.replace(updated);
    });
    if (ok && mounted) showMessage(context, 'Profile saved');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: LoaderView(
        loader: _profile,
        builder: (context, profile) => Form(
          key: formKey,
          child: ListView(
            padding: const EdgeInsets.all(24),
            children: [
              FormErrorBanner(formError),
              TextFormField(
                initialValue: profile.email,
                enabled: false,
                decoration: const InputDecoration(labelText: 'Email'),
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _first,
                textCapitalization: TextCapitalization.words,
                decoration: InputDecoration(
                    labelText: 'First name', errorText: fieldErrors['firstName']),
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _last,
                textCapitalization: TextCapitalization.words,
                decoration: InputDecoration(
                    labelText: 'Last name', errorText: fieldErrors['lastName']),
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _phone,
                keyboardType: TextInputType.phone,
                decoration: InputDecoration(
                    labelText: 'Phone', errorText: fieldErrors['phone']),
              ),
              const SizedBox(height: 24),
              SubmitButton(label: 'Save', busy: submitting, onPressed: _save),
            ],
          ),
        ),
      ),
    );
  }
}
