import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import '../../app/services.dart';
import '../../core/network/api_exception.dart';
import '../../core/state/loader.dart';
import '../../core/util/dates.dart';
import '../../core/util/money.dart';
import '../../core/util/uuid.dart';
import '../../core/widgets/state_views.dart';
import '../../design/design.dart';
import '../../domain/seller_money.dart';
import '../../domain/selling.dart';

typedef _Payouts = ({
  SellerBalance balance,
  List<PayoutAccount> accounts,
  SellerPage<PayoutRequest> requests,
});

enum _AccountAction { edit, remove }

/// Getting paid: where the money goes, asking for it, and what has been
/// asked for so far.
class PayoutsPage extends StatefulWidget {
  const PayoutsPage({super.key});

  @override
  State<PayoutsPage> createState() => _PayoutsPageState();
}

class _PayoutsPageState extends State<PayoutsPage> {
  late final Loader<_Payouts> _payouts;
  bool _initialised = false;

  /// One key per payout attempt: a retry after a lost reply must not ask
  /// for the same money twice. A new amount or account is a new attempt.
  String? _requestKey;
  (String, int)? _keyFor;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialised) return;
    _initialised = true;
    final selling = context.services.selling;
    _payouts = Loader(() async {
      final (balance, accounts, requests) = await (
        selling.balance(),
        selling.payoutAccounts(),
        selling.payoutRequests(),
      ).wait;
      return (balance: balance, accounts: accounts, requests: requests);
    });
  }

  @override
  void dispose() {
    _payouts.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action, String done) async {
    try {
      await action();
      if (mounted) showMessage(context, done);
    } on ApiException catch (error) {
      if (mounted) showMessage(context, error.message);
    }
    await _payouts.load(silent: true);
  }

  Future<PayoutAccountDraft?> _askAccount({PayoutAccount? current}) async {
    final method =
        current?.method ??
        await chooseOption<PayoutMethod>(
          context,
          title: 'Where should we pay you?',
          options: [
            for (final m in PayoutMethod.values)
              SheetOption(
                m,
                m.label,
                icon: m == PayoutMethod.bank ? Glyphs.card : Glyphs.phone,
              ),
          ],
        );
    if (method == null || !mounted) return null;
    final bank = method == PayoutMethod.bank;
    final answer = await askFor(
      context,
      title: method.label,
      message: current == null
          ? 'The Commerce team checks new accounts before paying into them.'
          : 'Changes are checked again before the next payout.',
      fields: [
        AskField(
          label: bank ? 'Bank' : 'Network',
          hint: bank ? 'Zanaco' : 'MTN or Airtel',
          initial: current?.provider ?? '',
        ),
        AskField(label: 'Name on the account', initial: current?.holder ?? ''),
        AskField(
          label: bank ? 'Account number' : 'Phone number',
          hint: bank ? null : '097 123 4567',
          keyboardType: bank ? TextInputType.number : TextInputType.phone,
          helper: current == null
              ? null
              : 'Enter it again; only ${current.masked} is kept on show.',
        ),
        if (bank) const AskField(label: 'Branch (optional)', optional: true),
      ],
      confirmLabel: current == null ? 'Add account' : 'Save changes',
    );
    if (answer == null) return null;
    return PayoutAccountDraft(
      method: method,
      provider: answer[0],
      holder: answer[1],
      number: answer[2],
      branch: bank ? answer[3] : null,
    );
  }

  Future<void> _add() async {
    final draft = await _askAccount();
    if (draft == null || !mounted) return;
    final selling = context.services.selling;
    await _run(() => selling.addPayoutAccount(draft), 'Account added');
  }

  Future<void> _account(PayoutAccount account) async {
    final action = await chooseOption<_AccountAction>(
      context,
      title: '${account.provider} ${account.masked}',
      options: const [
        SheetOption(_AccountAction.edit, 'Change details', icon: Glyphs.edit),
        SheetOption(
          _AccountAction.remove,
          'Remove',
          icon: Glyphs.trash,
          destructive: true,
        ),
      ],
    );
    if (action == null || !mounted) return;
    final selling = context.services.selling;
    switch (action) {
      case _AccountAction.edit:
        final draft = await _askAccount(current: account);
        if (draft == null || !mounted) return;
        await _run(
          () => selling.editPayoutAccount(account, draft),
          'Sent for checking',
        );
      case _AccountAction.remove:
        final ok = await confirm(
          context,
          title: 'Remove this account?',
          message: 'No more payouts go to it.',
          confirmLabel: 'Remove account',
          destructive: true,
        );
        if (ok && mounted) {
          await _run(
            () => selling.removePayoutAccount(account),
            'Account removed',
          );
        }
    }
  }

  Future<void> _request(_Payouts payouts) async {
    final verified = payouts.accounts
        .where((a) => a.status == PayoutAccountStatus.verified)
        .toList();
    final b = payouts.balance;
    PayoutAccount? account = verified.length == 1 ? verified.single : null;
    if (account == null) {
      final id = await chooseOption<String>(
        context,
        title: 'Pay into',
        options: [
          for (final a in verified)
            SheetOption(a.id, a.provider, subtitle: a.masked),
        ],
      );
      account = verified.where((a) => a.id == id).firstOrNull;
    }
    if (account == null || !mounted) return;
    final answer = await askFor(
      context,
      title: 'Request a payout',
      message:
          '${formatMoney(b.available, b.currency)} is available. It goes to '
          '${account.provider} ${account.masked}.',
      fields: [
        AskField(
          label: 'Amount (K)',
          initial: (b.available / 100).toStringAsFixed(2),
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          inputFormatters: [
            FilteringTextInputFormatter.allow(RegExp(r'[\d.,]')),
          ],
          validate: (v) {
            final amount = parseMoneyInput(v) ?? 0;
            if (amount <= 0) return 'Enter an amount';
            if (amount > b.available) return 'More than is available';
            return null;
          },
        ),
      ],
      confirmLabel: 'Request payout',
    );
    if (answer == null || !mounted) return;
    final amount = parseMoneyInput(answer[0])!;
    if (_keyFor != (account.id, amount)) {
      _requestKey = uuidV4();
      _keyFor = (account.id, amount);
    }
    final selling = context.services.selling;
    final chosen = account;
    try {
      await selling.requestPayout(
        account: chosen,
        amount: amount,
        idempotencyKey: _requestKey!,
      );
      _requestKey = null;
      _keyFor = null;
      if (mounted) showMessage(context, 'Payout requested');
    } on ApiException catch (error) {
      // A definite refusal closes the attempt; a lost reply keeps the key
      // so trying again is recognised as the same request.
      if (error.statusCode != null) {
        _requestKey = null;
        _keyFor = null;
      }
      if (mounted) showMessage(context, error.message);
    }
    await _payouts.load(silent: true);
  }

  Future<void> _cancel(PayoutRequest request) async {
    final answer = await askFor(
      context,
      title: 'Cancel this payout?',
      message: 'The money goes back to your available balance.',
      fields: const [AskField(label: 'Reason', hint: 'Wrong account')],
      confirmLabel: 'Cancel payout',
      destructive: true,
    );
    if (answer == null || !mounted) return;
    final selling = context.services.selling;
    await _run(
      () => selling.cancelPayout(request, answer[0]),
      'Payout cancelled',
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _payouts,
      builder: (context, _) {
        final data = _payouts.data;
        final canRequest =
            data != null &&
            data.balance.available > 0 &&
            data.accounts.any((a) => a.status == PayoutAccountStatus.verified);
        return PageScaffold(
          title: 'Payouts',
          onRefresh: () => _payouts.load(silent: true),
          bottomBar: data == null
              ? null
              : Button(
                  label: canRequest
                      ? 'Request a payout'
                      : data.balance.available <= 0
                      ? 'Nothing to pay out yet'
                      : 'Add a verified account to get paid',
                  onPressed: canRequest ? () => _request(data) : null,
                ),
          slivers: [
            LoaderSliver(
              loader: _payouts,
              builder: (context, data) => SliverPadding(
                padding: const EdgeInsets.fromLTRB(
                  Space.gutter,
                  Space.x3,
                  Space.gutter,
                  0,
                ),
                sliver: SliverList.list(children: _sections(context, data)),
              ),
            ),
          ],
        );
      },
    );
  }

  List<Widget> _sections(BuildContext context, _Payouts data) {
    final accounts = data.accounts
        .where((a) => a.status != PayoutAccountStatus.disabled)
        .toList();
    return [
      InsetGroup(
        title: 'Paid into',
        children: [
          for (final a in accounts)
            ListRow(
              leading: a.method == PayoutMethod.bank
                  ? Glyphs.card
                  : Glyphs.phone,
              title: '${a.provider} ${a.masked}',
              subtitle: [a.holder, ?a.note].join('\n'),
              trailing: StatusBadge(
                a.statusLabel,
                tone: switch (a.status) {
                  PayoutAccountStatus.verified => Tone.accent,
                  PayoutAccountStatus.pending => Tone.warning,
                  PayoutAccountStatus.rejected => Tone.danger,
                  _ => Tone.neutral,
                },
              ),
              onPressed: () => _account(a),
            ),
          ListRow(
            leading: Glyphs.add,
            title: 'Add an account',
            showChevron: false,
            onPressed: _add,
          ),
        ],
      ),
      const SizedBox(height: Space.x6),
      if (data.requests.items.isNotEmpty)
        InsetGroup(
          title: 'Requests',
          footer: data.requests.items.any((r) => r.cancellable)
              ? 'Tap a request that has not been acted on to cancel it.'
              : null,
          children: [
            for (final r in data.requests.items)
              ListRow(
                title: formatMoney(r.amount, r.currency),
                subtitle: [
                  formatDate(r.createdAt),
                  if (r.account case final a?) '${a.provider} ${a.masked}',
                  ?r.failureReason,
                ].join('\n'),
                trailing: StatusBadge(
                  r.statusLabel,
                  tone: switch (r.status) {
                    PayoutStatus.succeeded => Tone.accent,
                    PayoutStatus.failed => Tone.danger,
                    PayoutStatus.cancelled => Tone.neutral,
                    _ => Tone.warning,
                  },
                ),
                showChevron: false,
                onPressed: r.cancellable ? () => _cancel(r) : null,
              ),
          ],
        ),
    ];
  }
}
