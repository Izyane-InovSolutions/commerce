import 'package:flutter/material.dart' show Icons;
import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../app/services.dart';
import '../../design/design.dart';
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
      account: services.account,
      checkout: services.checkout,
    );
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
    final created = await context.push<Address>('/address/new');
    if (created == null) return;
    await _checkout.loadAddresses(select: created.id);
    if (mounted && _phone.text.isEmpty) _phone.text = _checkout.phone;
  }

  Future<void> _chooseAddress() async {
    final chosen = await chooseOption<String>(
      context,
      title: 'Deliver to',
      selected: _checkout.address?.id,
      options: [
        for (final address in _checkout.addresses)
          SheetOption(
            address.id,
            address.label ?? address.recipientName,
            subtitle: address.lines.join(', '),
          ),
        const SheetOption('', 'Add a new address', icon: Icons.add_rounded),
      ],
    );
    if (!mounted || chosen == null) return;
    if (chosen.isEmpty) {
      await _addAddress();
    } else {
      await _checkout.selectAddress(
        _checkout.addresses.firstWhere((a) => a.id == chosen),
      );
    }
  }

  Future<void> _place() async {
    final result = await _checkout.placeOrder();
    if (result == null || !mounted) return;
    // The server empties the cart once the order exists.
    context.services.cart.markCheckedOut();
    context.pushReplacement(
      '/checkout/payment/${result.paymentId}?order=${result.orderId}',
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _checkout,
      builder: (context, _) {
        final colors = context.colors;
        final type = context.type;
        final quote = _checkout.quote;

        if (_checkout.loadingAddresses && _checkout.addresses.isEmpty) {
          return const PageScaffold(title: 'Checkout', body: LoadingState());
        }
        if (_checkout.addressError != null && _checkout.addresses.isEmpty) {
          return PageScaffold(
            title: 'Checkout',
            body: ErrorState(
              message: _checkout.addressError!,
              onRetry: _checkout.loadAddresses,
            ),
          );
        }

        final address = _checkout.address;
        return PageScaffold(
          title: 'Checkout',
          bottomBar: Row(
            children: [
              if (quote != null) ...[
                Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Total',
                      style: type.caption.copyWith(color: colors.inkMuted),
                    ),
                    Price(quote.total, quote.currency, size: PriceSize.total),
                  ],
                ),
                const SizedBox(width: Space.x4),
              ],
              Expanded(
                child: Button(
                  // A disabled button that does not say why is a dead end.
                  label: address == null
                      ? 'Add an address to pay'
                      : !_checkout.phoneValid
                      ? 'Enter your mobile money number'
                      : 'Pay with ${_checkout.provider.label}',
                  loading: _checkout.placing,
                  haptic: Haptic.medium,
                  onPressed: _checkout.canPlace ? _place : null,
                ),
              ),
            ],
          ),
          slivers: [
            SliverPadding(
              padding: const EdgeInsets.symmetric(horizontal: Space.gutter),
              sliver: SliverList.list(
                children: [
                  const SizedBox(height: Space.x3),
                  if (address == null)
                    InsetGroup(
                      title: 'Deliver to',
                      footer:
                          'Delivery times and costs appear once there is an address.',
                      children: [
                        ListRow(
                          leading: Icons.add_location_alt_outlined,
                          title: 'Add an address',
                          onPressed: _addAddress,
                        ),
                      ],
                    )
                  else
                    InsetGroup(
                      title: 'Deliver to',
                      children: [
                        ListRow(
                          leading: Icons.location_on_outlined,
                          title: address.recipientName,
                          subtitle: address.lines.join('\n'),
                          trailing: Text(
                            'Change',
                            style: type.label.copyWith(color: colors.accent),
                          ),
                          showChevron: false,
                          onPressed: _chooseAddress,
                        ),
                      ],
                    ),
                  const SizedBox(height: Space.x6),
                  if (_checkout.quoting)
                    const InsetGroup(
                      title: 'Delivery',
                      children: [
                        Padding(
                          padding: EdgeInsets.all(Space.x4),
                          child: Row(
                            children: [
                              Skeleton(width: 160),
                              Spacer(),
                              Skeleton(width: 50),
                            ],
                          ),
                        ),
                      ],
                    )
                  else if (_checkout.quoteError != null)
                    InsetGroup(
                      title: 'Delivery',
                      children: [
                        ListRow(
                          leading: Icons.error_outline_rounded,
                          title: _checkout.quoteError!,
                          destructive: true,
                          trailing: Text(
                            'Retry',
                            style: type.label.copyWith(color: colors.accent),
                          ),
                          showChevron: false,
                          onPressed: _checkout.refreshQuote,
                        ),
                      ],
                    )
                  else if (quote != null)
                    InsetGroup(
                      title: 'Delivery',
                      children: [
                        for (final (index, group) in quote.groups.indexed)
                          ListRow(
                            leading: Icons.local_shipping_outlined,
                            title: quote.groups.length > 1
                                ? 'Shipment ${index + 1} of ${quote.groups.length}'
                                : 'Standard delivery',
                            subtitle: group.deliveryEstimate == null
                                ? null
                                : 'Arrives in ${group.deliveryEstimate}',
                            trailing: group.shippingAmount == 0
                                ? Text(
                                    'Free',
                                    style: type.label.copyWith(
                                      color: colors.accent,
                                    ),
                                  )
                                : Price(
                                    group.shippingAmount,
                                    quote.currency,
                                    size: PriceSize.inline,
                                  ),
                          ),
                      ],
                    ),
                  const SizedBox(height: Space.x6),
                  InsetGroup(
                    title: 'Pay with',
                    children: [
                      Padding(
                        padding: const EdgeInsets.all(Space.x4),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            SegmentedChoice<MobileMoneyProvider>(
                              options: {
                                for (final provider
                                    in MobileMoneyProvider.values)
                                  provider: provider.label,
                              },
                              value: _checkout.provider,
                              onChanged: _checkout.setProvider,
                            ),
                            const SizedBox(height: Space.x4),
                            InputField(
                              controller: _phone,
                              label: 'Mobile money number',
                              hint: '097 123 4567',
                              leading: Icons.phone_iphone_rounded,
                              keyboardType: TextInputType.phone,
                              onChanged: _checkout.setPhone,
                              helper:
                                  "You'll get a prompt on this phone to approve the payment.",
                              error:
                                  _phone.text.isNotEmpty &&
                                      !_checkout.phoneValid
                                  ? 'Enter a Zambian mobile number, like 0971234567'
                                  : null,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  if (quote != null) ...[
                    const SizedBox(height: Space.x6),
                    InsetGroup(
                      title: 'Summary',
                      children: [
                        ListRow(
                          title: 'Items',
                          trailing: Price(
                            quote.subtotal,
                            quote.currency,
                            size: PriceSize.inline,
                          ),
                        ),
                        ListRow(
                          title: 'Delivery',
                          trailing: quote.shippingAmount == 0
                              ? Text(
                                  'Free',
                                  style: type.label.copyWith(
                                    color: colors.accent,
                                  ),
                                )
                              : Price(
                                  quote.shippingAmount,
                                  quote.currency,
                                  size: PriceSize.inline,
                                ),
                        ),
                      ],
                    ),
                  ],
                  if (_checkout.placeError != null) ...[
                    const SizedBox(height: Space.x4),
                    Semantics(
                      liveRegion: true,
                      child: Text(
                        _checkout.placeError!,
                        style: type.small.copyWith(color: colors.danger),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}
