import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../app/brand.dart';
import '../../app/services.dart';
import '../../core/config/app_config.dart';
import '../../design/design.dart';
import 'update_controller.dart';

/// Account's "About this app": which version this is, whether a newer
/// tester build is waiting, and which server the app talks to.
class AboutAppGroup extends StatelessWidget {
  const AboutAppGroup({super.key});

  @override
  Widget build(BuildContext context) {
    final services = context.services;
    final updates = services.updates;
    return ListenableBuilder(
      listenable: updates,
      builder: (context, _) {
        final installed = updates.installed;
        return InsetGroup(
          title: 'About this app',
          footer: [
            '${AppBrand.name} by ${AppBrand.maker}',
            // The commit stamp from tool/distribute.sh, for bug reports.
            if (AppConfig.build != 'development build')
              'Build ${AppConfig.build}',
          ].join('. '),
          children: [
            ListRow(
              leading: Glyphs.idCard,
              title: 'Version',
              trailing: Text(
                installed?.toString() ?? '…',
                style: context.type.body.copyWith(
                  color: context.colors.inkMuted,
                ),
              ),
            ),
            _UpdateRow(updates: updates),
            ListRow(
              leading: Glyphs.server,
              title: 'Server',
              subtitle: services.endpoint.value.host,
              onPressed: () => context.push('/settings/server'),
            ),
          ],
        );
      },
    );
  }
}

class _UpdateRow extends StatelessWidget {
  const _UpdateRow({required this.updates});

  final UpdateController updates;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final release = updates.release;
    return switch (updates.stage) {
      UpdateStage.checking => const ListRow(
        leading: Glyphs.download,
        title: 'Checking for updates…',
        trailing: Spinner(size: 20),
      ),
      UpdateStage.available => ListRow(
        leading: Glyphs.download,
        title: 'Install ${release!.version} (${release.build})',
        subtitle: (release.notes?.trim().isNotEmpty ?? false)
            ? release.notes!.trim().split('\n').first
            : 'A newer build is ready for you.',
        trailing: const StatusBadge('New', tone: Tone.accent),
        showChevron: false,
        onPressed: updates.install,
      ),
      UpdateStage.installing => ListRow(
        leading: Glyphs.download,
        title: updates.progress == null
            ? 'Starting the update…'
            : 'Downloading… ${(updates.progress! * 100).round()}%',
        trailing: const Spinner(size: 20),
      ),
      final stage => ListRow(
        leading: Glyphs.download,
        title: 'Check for updates',
        subtitle: switch (stage) {
          UpdateStage.upToDate => 'You have the latest build.',
          UpdateStage.failed || UpdateStage.unavailable => updates.message,
          _ => 'New test builds arrive through Firebase App Distribution.',
        },
        destructive: stage == UpdateStage.failed,
        showChevron: false,
        trailing: stage == UpdateStage.upToDate
            ? Glyph(Glyphs.checkCircle, size: 20, color: colors.accent)
            : null,
        onPressed: updates.check,
      ),
    };
  }
}
