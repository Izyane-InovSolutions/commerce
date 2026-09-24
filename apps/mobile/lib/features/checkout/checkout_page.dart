import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../app/services.dart';
import '../../core/widgets/state_views.dart';
import '../../domain/account.dart';
import '../../domain/checkout.dart';
import 'checkout_controller.dart';

class CheckoutPage extends StatefulWidget {
  const CheckoutPage({super.key});

  @override
  State<CheckoutPage> createState() => _CheckoutPageState();
}

class _CheckoutPageState extends State<CheckoutPage> {
  late final CheckoutController _checkout;
  final _phone = TextEditingController();
  bool _initialised = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialised) return;
    _initialised = true;
    final services = context.services;
    _checkout = CheckoutController(
        account: services.account, checkout: services.checkout);
    _checkout.start().then((_) {
      if (mounted && _phone.text.isEmpty) _phone.text = _checkout.phone;
    });
  }

  @override
  void dispose() {
    _checkout.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _addAddress() async {
    final created = await context.push<Address>('/account/addresses/new');
    if (created != null) await _checkout.loadAddresses(select: created.id);
  }

  Future<void> _chooseAddress() async {
    final chosen = await showModalBottomSheet<Object>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            for (final address in _checkout.addresses)
              ListTile(
                leading: Icon(address.id == _checkout.address?.id
                    ? Icons.radio_button_checked
                    : Icons.radio_button_off),
                title: Text(address.label ?? address.recipientName),
                subtitle: Text(address.lines.join(', ')),
                onTap: () => Navigator.pop(context, address),
              ),
            ListTile(
              leading: const Icon(Icons.add),
              title: const Text('Add a new address'),
              onTap: () => Navigator.pop(context, 'new'),
            ),
          ],
        ),
      ),
    );
    if (!mounted) return;
    if (chosen is Address) await _checkout.selectAddress(chosen);
    if (chosen == 'new') await _addAddress();
  }

  Future<void> _place() async {
    final result = await _checkout.placeOrder();
    if (result == null || !mounted) return;
    // The server empties the cart once the order exists.
    context.services.cart.markCheckedOut();
    context.pushReplacement(
        '/checkout/payment/${result.paymentId}?order=${result.orderId}');
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Checkout')),
      body: ListenableBuilder(
        listenable: _checkout,
        builder: (context, _) {
          if (_checkout.loadingAddresses && _checkout.addresses.isEmpty) {
            return const LoadingView();
          }
          if (_checkout.addressError != null && _checkout.addresses.isEmpty) {
            return ErrorView(
                message: _checkout.addressError!, onRetry: _checkout.loadAddresses);
          }
          final quote = _checkout.quote;

          return Column(
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    _Section(
                      number: 1,
                      title: 'Delivery address',
                      child: _checkout.address == null
                          ? Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                const Text('Add an address to see delivery options.'),
                                const SizedBox(height: 12),
                                FilledButton.tonal(
                                    onPressed: _addAddress,
                                    child: const Text('Add address')),
                              ],
                            )
                          : ListTile(
                              contentPadding: EdgeInsets.zero,
                              title: Text(_checkout.address!.recipientName),
                              subtitle: Text(_checkout.address!.lines.join('\n')),
                              trailing: TextButton(
                                  onPressed: _chooseAddress,
                                  child: const Text('Change')),
                            ),
                    ),
                    _Section(
                      number: 2,
                      title: 'Delivery',
                      child: _checkout.quoting
                          ? const Padding(
                              padding: EdgeInsets.all(8),
                              child: LinearProgressIndicator())
                          : _checkout.quoteError != null
                              ? Row(children: [
                                  Expanded(
                                      child: Text(_checkout.quoteError!,
                                          style: TextStyle(color: theme.colorScheme.error))),
                                  TextButton(
                                      onPressed: _checkout.refreshQuote,
                                      child: const Text('Retry')),
                                ])
                              : quote == null
                                  ? const Text('Choose an address first.')
                                  : Column(
                                      children: [
                                        for (final (index, group) in quote.groups.indexed)
                                          ListTile(
                                            contentPadding: EdgeInsets.zero,
                                            leading: const Icon(Icons.local_shipping_outlined),
                                            title: Text(quote.groups.length > 1
                                                ? 'Shipment ${index + 1} of ${quote.groups.length}'
                                                : 'Standard delivery'),
                                            subtitle: group.deliveryEstimate == null
                                                ? null
                                                : Text('Arrives in ${group.deliveryEstimate}'),
                                            trailing: Text(group.shippingAmount == 0
                                                ? 'Free'
                                                : quote.money(group.shippingAmount).formatted),
                                          ),
                                      ],
                                    ),
                    ),
                    _Section(
                      number: 3,
                      title: 'Payment',
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          SegmentedButton<MobileMoneyProvider>(
                            segments: [
                              for (final provider in MobileMoneyProvider.values)
                                ButtonSegment(value: provider, label: Text(provider.label)),
                            ],
                            selected: {_checkout.provider},
                            onSelectionChanged: (value) =>
                                _checkout.setProvider(value.single),
                          ),
                          const SizedBox(height: 16),
                          TextField(
                            controller: _phone,
                            keyboardType: TextInputType.phone,
                            onChanged: _checkout.setPhone,
                            decoration: InputDecoration(
                              labelText: 'Mobile money number',
                              hintText: '097 123 4567',
                              prefixIcon: const Icon(Icons.phone_android),
                              errorText: _phone.text.isNotEmpty && !_checkout.phoneValid
                                  ? 'Enter a Zambian mobile number, e.g. 0971234567'
                                  : null,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text("You'll get a prompt on this phone to approve the payment.",
                              style: theme.textTheme.bodySmall),
                        ],
                      ),
                    ),
                    if (quote != null)
                      _Section(
                        number: 4,
                        title: 'Summary',
                        child: Column(children: [
                          _Line('Subtotal', quote.money(quote.subtotal).formatted),
                          _Line('Shipping', quote.shippingAmount == 0
                              ? 'Free'
                              : quote.money(quote.shippingAmount).formatted),
                          const Divider(height: 24),
                          _Line('Total', quote.money(quote.total).formatted, bold: true),
                        ]),
                      ),
                    if (_checkout.placeError != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(_checkout.placeError!,
                            style: TextStyle(color: theme.colorScheme.error)),
                      ),
                  ],
                ),
              ),
              SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                  child: FilledButton(
                    onPressed: _checkout.canPlace ? _place : null,
                    child: _checkout.placing
                        ? const SizedBox.square(
                            dimension: 22, child: CircularProgressIndicator(strokeWidth: 2.5))
                        : Text(quote == null
                            ? 'Place order'
                            : 'Pay ${quote.money(quote.total).formatted}'),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.number, required this.title, required this.child});

  final int number;
  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(children: [
                CircleAvatar(
                  radius: 12,
                  child: Text('$number', style: theme.textTheme.labelMedium),
                ),
                const SizedBox(width: 10),
                Text(title, style: theme.textTheme.titleMedium),
              ]),
              const SizedBox(height: 12),
              child,
            ],
          ),
        ),
      ),
    );
  }
}

class _Line extends StatelessWidget {
  const _Line(this.label, this.value, {this.bold = false});

  final String label;
  final String value;
  final bool bold;

  @override
  Widget build(BuildContext context) {
    final style = bold
        ? Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)
        : Theme.of(context).textTheme.bodyLarge;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(children: [
        Expanded(child: Text(label, style: style)),
        Text(value, style: style),
      ]),
    );
  }
}
