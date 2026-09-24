import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../app/services.dart';
import '../../core/network/api_exception.dart';
import '../../core/state/loader.dart';
import '../../core/widgets/state_views.dart';
import '../../domain/account.dart';

class AddressesPage extends StatefulWidget {
  const AddressesPage({super.key});

  @override
  State<AddressesPage> createState() => _AddressesPageState();
}

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

  Future<void> _delete(Address address) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete this address?'),
        content: Text(address.lines.join(', ')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Delete')),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    await _run(() => context.services.account.deleteAddress(address.id), 'Address deleted');
  }

  Future<void> _open(String route, {Object? extra}) async {
    final saved = await context.push<Address>(route, extra: extra);
    if (saved != null) await _addresses.load(silent: true);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Addresses')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _open('/account/addresses/new'),
        icon: const Icon(Icons.add),
        label: const Text('Add address'),
      ),
      body: LoaderView(
        loader: _addresses,
        builder: (context, addresses) {
          if (addresses.isEmpty) {
            return const EmptyView(
              icon: Icons.location_on_outlined,
              title: 'No saved addresses',
              message: 'Add one now and checkout will pick it up.',
            );
          }
          return RefreshIndicator(
            onRefresh: () => _addresses.load(silent: true),
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
              itemCount: addresses.length,
              separatorBuilder: (_, _) => const SizedBox(height: 12),
              itemBuilder: (context, index) {
                final address = addresses[index];
                final theme = Theme.of(context);
                return Card(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 4, 12),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(children: [
                                Flexible(
                                  child: Text(address.label ?? address.recipientName,
                                      style: theme.textTheme.titleSmall),
                                ),
                                if (address.isDefault) ...[
                                  const SizedBox(width: 8),
                                  Chip(
                                    label: const Text('Default'),
                                    visualDensity: VisualDensity.compact,
                                    padding: EdgeInsets.zero,
                                    labelStyle: theme.textTheme.labelSmall,
                                  ),
                                ],
                              ]),
                              if (address.label != null) Text(address.recipientName),
                              for (final line in address.lines)
                                Text(line, style: theme.textTheme.bodyMedium),
                              if (address.phone != null)
                                Text(address.phone!, style: theme.textTheme.bodySmall),
                            ],
                          ),
                        ),
                        PopupMenuButton<String>(
                          onSelected: (action) => switch (action) {
                            'edit' => _open('/account/addresses/${address.id}', extra: address),
                            'default' => _run(
                                () => context.services.account.setDefaultAddress(address.id),
                                'Default address updated'),
                            'delete' => _delete(address),
                            _ => null,
                          },
                          itemBuilder: (context) => [
                            const PopupMenuItem(value: 'edit', child: Text('Edit')),
                            if (!address.isDefault)
                              const PopupMenuItem(value: 'default', child: Text('Make default')),
                            const PopupMenuItem(value: 'delete', child: Text('Delete')),
                          ],
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }
}
