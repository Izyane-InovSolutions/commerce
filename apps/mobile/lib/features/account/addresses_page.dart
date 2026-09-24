import 'package:flutter/material.dart' show Icons;
import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../app/services.dart';
import '../../core/network/api_exception.dart';
import '../../core/state/loader.dart';
import '../../core/widgets/state_views.dart';
import '../../design/design.dart';
import '../../domain/account.dart';

class AddressesPage extends StatefulWidget {
  const AddressesPage({super.key});

  @override
  State<AddressesPage> createState() => _AddressesPageState();
}

enum _Action { edit, makeDefault, delete }

class _AddressesPageState extends State<AddressesPage> {
  late final Loader<List<Address>> _addresses;
  bool _initialised = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialised) return;
    _initialised = true;
    _addresses = Loader(context.services.account.addresses);
  }

  @override
  void dispose() {
    _addresses.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action, String done) async {
    try {
      await action();
      await _addresses.load(silent: true);
      if (mounted) showMessage(context, done);
    } on ApiException catch (error) {
      if (mounted) showMessage(context, error.message);
    }
  }

  Future<void> _open(String route, {Object? extra}) async {
    final saved = await context.push<Address>(route, extra: extra);
    if (saved != null) {
      await _addresses.load(silent: true);
      if (mounted) showMessage(context, 'Address saved');
    }
  }

  Future<void> _actions(Address address) async {
    final account = context.services.account;
    final action = await chooseOption<_Action>(
      context,
      title: address.label ?? address.recipientName,
      options: [
        const SheetOption(_Action.edit, 'Edit', icon: Icons.edit_outlined),
        if (!address.isDefault)
          const SheetOption(
            _Action.makeDefault,
            'Use as default',
            icon: Icons.check_circle_outline_rounded,
          ),
        const SheetOption(
          _Action.delete,
          'Delete',
          icon: Icons.delete_outline_rounded,
          destructive: true,
        ),
      ],
    );
    if (!mounted || action == null) return;
    switch (action) {
      case _Action.edit:
        await _open('/address/${address.id}', extra: address);
      case _Action.makeDefault:
        await _run(
          () => account.setDefaultAddress(address.id),
          'Default address updated',
        );
      case _Action.delete:
        final ok = await confirm(
          context,
          title: 'Delete this address?',
          message: address.lines.join(', '),
          confirmLabel: 'Delete address',
          destructive: true,
        );
        if (ok && mounted) {
          await _run(
            () => account.deleteAddress(address.id),
            'Address deleted',
          );
        }
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _addresses,
      builder: (context, _) {
        final addresses = _addresses.data;
        Widget content;
        if (addresses == null && _addresses.error != null) {
          content = SliverFillRemaining(
            hasScrollBody: false,
            child: ErrorState(
              message: _addresses.errorMessage!,
              onRetry: _addresses.load,
            ),
          );
        } else if (addresses == null) {
          content = const SliverFillRemaining(
            hasScrollBody: false,
            child: LoadingState(),
          );
        } else if (addresses.isEmpty) {
          content = const SliverFillRemaining(
            hasScrollBody: false,
            child: EmptyState(
              icon: Icons.location_on_outlined,
              title: 'No saved addresses',
              message: 'Add one and checkout picks it up automatically.',
            ),
          );
        } else {
          content = SliverPadding(
            padding: const EdgeInsets.fromLTRB(
              Space.gutter,
              Space.x3,
              Space.gutter,
              0,
            ),
            sliver: SliverToBoxAdapter(
              child: InsetGroup(
                children: [
                  for (final address in addresses)
                    ListRow(
                      leading: address.isDefault
                          ? Icons.home_rounded
                          : Icons.location_on_outlined,
                      title: address.label ?? address.recipientName,
                      subtitle: [
                        if (address.label != null) address.recipientName,
                        ...address.lines,
                      ].join('\n'),
                      trailing: address.isDefault
                          ? const StatusBadge('Default', tone: Tone.accent)
                          : null,
                      onPressed: () => _actions(address),
                    ),
                ],
              ),
            ),
          );
        }
        return PageScaffold(
          title: 'Addresses',
          onRefresh: () => _addresses.load(silent: true),
          bottomBar: Button(
            label: 'Add an address',
            icon: Icons.add_rounded,
            onPressed: () => _open('/address/new'),
          ),
          slivers: [content],
        );
      },
    );
  }
}
