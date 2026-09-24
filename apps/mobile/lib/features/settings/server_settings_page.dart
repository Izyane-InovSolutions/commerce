import 'package:flutter/material.dart';

import '../../app/services.dart';
import '../../core/config/api_endpoint.dart';
import '../../core/config/app_config.dart';
import '../../core/network/api_exception.dart';
import '../../core/widgets/state_views.dart';
import '../../data/server_probe.dart';

/// Repoint the app at another API without rebuilding it.
///
/// Exists because the internal-testing backend sits behind a Cloudflare
/// quick tunnel whose hostname changes every time it restarts, and the base
/// URL would otherwise be baked in at build time.
class ServerSettingsPage extends StatefulWidget {
  const ServerSettingsPage({super.key});

  @override
  State<ServerSettingsPage> createState() => _ServerSettingsPageState();
}

class _ServerSettingsPageState extends State<ServerSettingsPage> {
  late final TextEditingController _url;
  String? _error;
  String? _status;
  bool _checking = false;

  @override
  void initState() {
    super.initState();
    _url = TextEditingController();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_url.text.isEmpty) {
      _url.text = context.services.endpoint.value.toString();
    }
  }

  @override
  void dispose() {
    _url.dispose();
    super.dispose();
  }

  Future<void> _test() async {
    final uri = ApiEndpoint.tryParse(_url.text);
    if (uri == null) {
      setState(() => _error = 'Enter a full https:// address');
      return;
    }
    setState(() {
      _error = null;
      _status = null;
      _checking = true;
    });
    try {
      // Probe the candidate directly, without switching to it yet.
      final probe = await ServerProbe.check(uri);
      setState(() => _status = probe ? 'Connected — the API is healthy.' : 'Reached a server, but it did not look like the Commerce API.');
    } on ApiException catch (error) {
      setState(() => _status = error.message);
    } finally {
      if (mounted) setState(() => _checking = false);
    }
  }

  Future<void> _save() async {
    final uri = ApiEndpoint.tryParse(_url.text);
    if (uri == null) {
      setState(() => _error = 'Enter a full https:// address');
      return;
    }
    final endpoint = context.services.endpoint;
    if (uri == endpoint.value) {
      Navigator.of(context).pop();
      return;
    }
    final confirmed = await _confirmSwitch();
    if (confirmed != true || !mounted) return;
    await endpoint.override(uri);
    if (!mounted) return;
    showMessage(context, 'Now using $uri');
    Navigator.of(context).pop();
  }

  Future<void> _reset() async {
    final confirmed = await _confirmSwitch();
    if (confirmed != true || !mounted) return;
    await context.services.endpoint.reset();
    if (!mounted) return;
    _url.text = AppConfig.defaultApiBaseUrl;
    showMessage(context, 'Back to the default server');
  }

  Future<bool?> _confirmSwitch() => showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Switch server?'),
          content: const Text(
              "You'll be signed out — your session belongs to the current server."),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Cancel')),
            FilledButton(
                onPressed: () => Navigator.pop(context, true),
                child: const Text('Switch')),
          ],
        ),
      );

  @override
  Widget build(BuildContext context) {
    final endpoint = context.services.endpoint;
    return Scaffold(
      appBar: AppBar(title: const Text('Server settings')),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          Text('API base URL', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          Text(
            endpoint.isOverridden
                ? 'Using a custom server.'
                : 'Using the default this build was made with.',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _url,
            keyboardType: TextInputType.url,
            autocorrect: false,
            decoration: InputDecoration(
              labelText: 'https://…/api/v1',
              errorText: _error,
              helperText: '/api/v1 is added if you leave it off',
            ),
          ),
          if (_status != null) ...[
            const SizedBox(height: 12),
            Text(_status!),
          ],
          const SizedBox(height: 24),
          OutlinedButton(
            onPressed: _checking ? null : _test,
            child: Text(_checking ? 'Checking…' : 'Test connection'),
          ),
          const SizedBox(height: 12),
          FilledButton(onPressed: _save, child: const Text('Save')),
          if (endpoint.isOverridden)
            TextButton(onPressed: _reset, child: const Text('Reset to default')),
        ],
      ),
    );
  }
}
