import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../app/services.dart';
import '../../core/network/api_exception.dart';
import '../../domain/orders.dart';

/// Waits for the payment to settle and says where it stands.
///
/// The app never decides an order is paid. It asks the API — which
/// reconciles with the gateway — and reports what the API says. The same
/// check is available from the order page, so leaving this screen, or the
/// app being killed mid-payment, loses nothing.
class PaymentStatusPage extends StatefulWidget {
  const PaymentStatusPage({super.key, required this.paymentId, this.orderId});

  final String paymentId;
  final String? orderId;

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
        _failureReason = order.payment?.failureReason;
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
    final theme = Theme.of(context);
    final (icon, color, title, message) = switch (_status) {
      PaymentStatus.succeeded => (
          Icons.check_circle_rounded,
          Colors.green.shade600,
          'Payment received',
          'Your order is confirmed. We will let you know as it moves.',
        ),
      PaymentStatus.failed || PaymentStatus.cancelled => (
          Icons.error_rounded,
          theme.colorScheme.error,
          _status.label,
          _failureReason ??
              'The payment did not go through, and you have not been charged.',
        ),
      _ when _gaveUp => (
          Icons.schedule_rounded,
          theme.colorScheme.primary,
          'Still waiting for approval',
          'Your order is saved. If you approve the prompt later, it will '
              'update — check it any time from your orders.',
        ),
      _ => (
          Icons.phone_iphone_rounded,
          theme.colorScheme.primary,
          'Approve the payment on your phone',
          'We have sent a mobile money prompt to your number. Enter your PIN '
              'to approve it, then come back here.',
        ),
    };

    return PopScope(
      canPop: !_status.isInFlight || _gaveUp,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Payment'),
          automaticallyImplyLeading: false,
        ),
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              children: [
                const Spacer(),
                Icon(icon, size: 88, color: color),
                const SizedBox(height: 24),
                Text(title,
                    textAlign: TextAlign.center,
                    style: theme.textTheme.headlineSmall),
                const SizedBox(height: 12),
                Text(message,
                    textAlign: TextAlign.center,
                    style: theme.textTheme.bodyLarge),
                if (_status.isInFlight && !_gaveUp) ...[
                  const SizedBox(height: 28),
                  const LinearProgressIndicator(),
                ],
                if (_error != null) ...[
                  const SizedBox(height: 16),
                  Text(_error!,
                      textAlign: TextAlign.center,
                      style: TextStyle(color: theme.colorScheme.error)),
                ],
                const Spacer(),
                if (_status.isInFlight)
                  FilledButton.tonal(
                    onPressed: _checking ? null : _check,
                    child: Text(_checking ? 'Checking…' : "I've approved it"),
                  ),
                if (_orderId != null) ...[
                  const SizedBox(height: 12),
                  FilledButton(
                    onPressed: () => context.go('/account/orders/$_orderId'),
                    child: const Text('View order'),
                  ),
                ],
                const SizedBox(height: 8),
                TextButton(
                  onPressed: () => context.go('/'),
                  child: const Text('Continue shopping'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
