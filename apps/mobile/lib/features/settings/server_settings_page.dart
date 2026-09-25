import 'package:flutter/widgets.dart';

import '../../app/brand.dart';
import '../../app/services.dart';
import '../../core/config/api_endpoint.dart';
import '../../core/config/app_config.dart';
import '../../core/network/api_exception.dart';
import '../../core/widgets/state_views.dart';
import '../../data/server_probe.dart';
import '../../design/design.dart';

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

enum _Probe { idle, checking, healthy, notCommerce, failed }

class _ServerSettingsPageState extends State<ServerSettingsPage> {
  final _url = TextEditingController();
  String? _error;
  _Probe _probe = _Probe.idle;
  String? _probeMessage;

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

  Uri? _parse() {
    final uri = ApiEndpoint.tryParse(_url.text);
    setState(
      () => _error = uri == null ? 'Enter a full https:// address' : null,
    );
    return uri;
  }

  Future<void> _test() async {
    final uri = _parse();
    if (uri == null) return;
    setState(() => _probe = _Probe.checking);
    try {
      final healthy = await ServerProbe.check(uri);
      setState(() => _probe = healthy ? _Probe.healthy : _Probe.notCommerce);
    } on ApiException catch (error) {
      setState(() {
        _probe = _Probe.failed;
        _probeMessage = error.message;
      });
    }
  }

  Future<void> _save() async {
    final uri = _parse();
    if (uri == null) return;
    final endpoint = context.services.endpoint;
    if (uri == endpoint.value) {
      Navigator.of(context).pop();
      return;
    }
    if (!await _confirmSwitch() || !mounted) return;
    await endpoint.override(uri);
    if (!mounted) return;
    showMessage(context, 'Now using ${uri.host}');
    Navigator.of(context).pop();
  }

  Future<void> _reset() async {
    if (!await _confirmSwitch() || !mounted) return;
    await context.services.endpoint.reset();
    if (!mounted) return;
    _url.text = AppConfig.defaultApiBaseUrl;
    showMessage(context, 'Back to the default server');
  }

  Future<bool> _confirmSwitch() => confirm(
    context,
    title: 'Switch server?',
    message:
        "You'll be signed out, because your session belongs to the current server.",
    confirmLabel: 'Switch and sign out',
  );

  @override
  Widget build(BuildContext context) {
    final endpoint = context.services.endpoint;
    final colors = context.colors;
    final (probeText, probeColor) = switch (_probe) {
      _Probe.idle || _Probe.checking => (null, colors.inkMuted),
      _Probe.healthy => ('Connected. The API is healthy.', colors.accent),
      _Probe.notCommerce => (
        'Something answered, but it is not the ${AppBrand.name} API.',
        colors.warning,
      ),
      _Probe.failed => (_probeMessage, colors.danger),
    };

    return PageScaffold(
      title: 'Server',
      slivers: [
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(
            Space.gutter,
            Space.x2,
            Space.gutter,
            0,
          ),
          sliver: SliverToBoxAdapter(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  endpoint.isOverridden
                      ? 'This app is using a server you set.'
                      : 'This app is using the server it was built with.',
                  style: context.type.body.copyWith(color: colors.inkMuted),
                ),
                const SizedBox(height: Space.x6),
                InputField(
                  controller: _url,
                  label: 'API address',
                  helper: '/api/v1 is added if you leave it off',
                  error: _error,
                  keyboardType: TextInputType.url,
                  autocorrect: false,
                ),
                if (probeText != null) ...[
                  const SizedBox(height: Space.x4),
                  Semantics(
                    liveRegion: true,
                    child: Text(
                      probeText,
                      style: context.type.small.copyWith(color: probeColor),
                    ),
                  ),
                ],
                const SizedBox(height: Space.x6),
                Button(
                  label: 'Test connection',
                  variant: ButtonVariant.secondary,
                  loading: _probe == _Probe.checking,
                  onPressed: _test,
                ),
                const SizedBox(height: Space.x3),
                Button(label: 'Save', onPressed: _save),
                if (endpoint.isOverridden) ...[
                  const SizedBox(height: Space.x2),
                  Button(
                    label: 'Use the default server',
                    variant: ButtonVariant.ghost,
                    onPressed: _reset,
                  ),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }
}
