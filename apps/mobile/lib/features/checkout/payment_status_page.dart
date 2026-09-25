import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../app/services.dart';
import '../../core/network/api_exception.dart';
import '../../design/design.dart';
import '../../domain/card.dart';
import '../../domain/checkout.dart';
import '../../domain/orders.dart';

/// Waits for the payment to settle and says where it stands.
///
/// The app never decides an order is paid. It asks the API — which
/// reconciles with the gateway — and reports what the API says. The same
/// check is available from the order page, so leaving this screen, or the
/// app being killed mid-payment, loses nothing.
class PaymentStatusPage extends StatefulWidget {
  const PaymentStatusPage({
    super.key,
    required this.paymentId,
    this.orderId,
    this.method = PaymentMethod.mobileMoney,
  });

  final String paymentId;
  final String? orderId;

  /// Only changes the words: what "waiting" means differs between a prompt
  /// on the customer's phone and a bank confirming a card.
  final PaymentMethod method;

  @override
  State<PaymentStatusPage> createState() => _PaymentStatusPageState();
}

class _PaymentStatusPageState extends State<PaymentStatusPage>
    with WidgetsBindingObserver {
  static const _interval = Duration(seconds: 4);

  /// Mobile money prompts expire after roughly fifteen minutes; there is no
  /// point holding the screen open much past the customer's attention span.
  static const _giveUpAfter = Duration(minutes: 3);

  PaymentStatus _status = PaymentStatus.pending;
  String? _orderId;
  String? _failureReason;
  String? _error;
  bool _checking = false;
  bool _gaveUp = false;
  Timer? _timer;
  late final DateTime _startedAt;

  bool get _card => widget.method == PaymentMethod.card;

  @override
  void initState() {
    super.initState();
    _orderId = widget.orderId;
    _startedAt = DateTime.now();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _check());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
    super.dispose();
  }

  /// The customer leaves the app to approve the prompt; check the moment
  /// they come back rather than making them wait out the next tick.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _status.isInFlight) _check();
  }

  Future<void> _check() async {
    if (_checking) return;
    _timer?.cancel();
    setState(() {
      _checking = true;
      _error = null;
    });
    try {
      final services = context.services;
      final payment = await services.checkout.refreshPayment(widget.paymentId);
      _orderId ??= payment.orderId;
      _status = payment.status;
      if (!_status.isInFlight && _status != PaymentStatus.succeeded) {
        final order = await services.orders.order(payment.orderId);
        final reason = order.payment?.failureReason;
        _failureReason = _card && reason != null
            ? describeCardFailure(reason)
            : reason;
      }
    } on ApiException catch (error) {
      _error = error.message;
    } finally {
      if (mounted) {
        setState(() => _checking = false);
        _schedule();
      }
    }
  }

  void _schedule() {
    if (!_status.isInFlight) return;
    if (DateTime.now().difference(_startedAt) > _giveUpAfter) {
      setState(() => _gaveUp = true);
      return;
    }
    _timer = Timer(_interval, _check);
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final type = context.type;
    final (icon, wash, ink, title, message) = switch (_status) {
      PaymentStatus.succeeded => (
        Glyphs.check,
        colors.accentWash,
        colors.accent,
        'Payment received',
        'Your order is confirmed. Track it any time from your orders.',
      ),
      PaymentStatus.failed || PaymentStatus.cancelled => (
        Glyphs.close,
        colors.dangerWash,
        colors.danger,
        _status.label,
        _failureReason ??
            "The payment didn't go through, and you haven't been charged.",
      ),
      _ when _gaveUp && _card => (
        Glyphs.clock,
        colors.warningWash,
        colors.warning,
        'Still waiting for your bank',
        'Your order is saved. It updates by itself once the bank confirms; '
            'check it any time from your orders.',
      ),
      _ when _gaveUp => (
        Glyphs.clock,
        colors.warningWash,
        colors.warning,
        'Still waiting for approval',
        'Your order is saved. If you approve the prompt later it updates '
            'by itself; check it any time from your orders.',
      ),
      _ when _card => (
        Glyphs.card,
        colors.warningWash,
        colors.warning,
        'Confirming your card payment',
        'This usually takes a few seconds. You can leave this screen; your '
            'order is saved either way.',
      ),
      _ => (
        Glyphs.phone,
        colors.warningWash,
        colors.warning,
        'Approve the payment on your phone',
        'We sent a mobile money prompt to your number. Enter your PIN to '
            'approve it, then come back here.',
      ),
    };
    final waiting = _status.isInFlight && !_gaveUp;

    return PopScope(
      // No backing out mid-payment by accident; the order is safe either way.
      canPop: !waiting,
      child: PageScaffold(
        title: 'Payment',
        showBack: false,
        body: Padding(
          padding: const EdgeInsets.fromLTRB(
            Space.gutter,
            0,
            Space.gutter,
            Space.x4,
          ),
          child: SafeArea(
            top: false,
            child: Column(
              children: [
                const Spacer(),
                Semantics(
                  liveRegion: true,
                  child: Column(
                    children: [
                      AnimatedContainer(
                        duration: Motion.slow,
                        curve: Motion.standard,
                        width: 104,
                        height: 104,
                        decoration: BoxDecoration(
                          color: wash,
                          shape: BoxShape.circle,
                        ),
                        child: waiting
                            ? Stack(
                                alignment: Alignment.center,
                                children: [
                                  Spinner(size: 104, color: ink, stroke: 3),
                                  Glyph(icon, size: 40, color: ink),
                                ],
                              )
                            : Glyph(icon, size: 48, color: ink),
                      ),
                      const SizedBox(height: Space.x8),
                      Text(
                        title,
                        textAlign: TextAlign.center,
                        style: type.title,
                      ),
                      const SizedBox(height: Space.x3),
                      Text(
                        message,
                        textAlign: TextAlign.center,
                        style: type.body.copyWith(color: colors.inkMuted),
                      ),
                    ],
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: Space.x4),
                  Text(
                    _error!,
                    textAlign: TextAlign.center,
                    style: type.small.copyWith(color: colors.danger),
                  ),
                ],
                const Spacer(),
                if (_status.isInFlight) ...[
                  Button(
                    label: _card ? 'Check again' : "I've approved it",
                    variant: ButtonVariant.secondary,
                    loading: _checking,
                    onPressed: _check,
                  ),
                  const SizedBox(height: Space.x3),
                ],
                if (_orderId != null) ...[
                  Button(
                    label: 'View order',
                    variant: _status == PaymentStatus.succeeded
                        ? ButtonVariant.primary
                        : ButtonVariant.ghost,
                    onPressed: () => context.go('/account/orders/$_orderId'),
                  ),
                  const SizedBox(height: Space.x2),
                ],
                Button(
                  label: 'Keep shopping',
                  variant: ButtonVariant.ghost,
                  onPressed: () => context.go('/'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
