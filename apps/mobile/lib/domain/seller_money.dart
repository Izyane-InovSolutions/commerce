import '../core/network/json.dart';

/// Where a seller is paid, and the payouts they ask for.

enum PayoutMethod { bank, mobileMoney }

extension PayoutMethodInfo on PayoutMethod {
  String get wire => this == PayoutMethod.bank ? 'BANK' : 'MOBILE_MONEY';
  String get label =>
      this == PayoutMethod.bank ? 'Bank account' : 'Mobile money';
}

enum PayoutAccountStatus { pending, verified, rejected, disabled, unknown }

class PayoutAccount {
  const PayoutAccount({
    required this.id,
    required this.method,
    required this.provider,
    required this.holder,
    required this.masked,
    required this.status,
    required this.version,
    this.note,
  });

  factory PayoutAccount.fromJson(Json json) => PayoutAccount(
    id: json.str('id'),
    method: json.strOrNull('method') == 'BANK'
        ? PayoutMethod.bank
        : PayoutMethod.mobileMoney,
    provider: json.strOrNull('provider') ?? '',
    holder: json.strOrNull('accountHolderName') ?? '',
    masked: json.strOrNull('maskedReference') ?? '',
    status: switch (json.strOrNull('status')) {
      'PENDING_VERIFICATION' => PayoutAccountStatus.pending,
      'VERIFIED' => PayoutAccountStatus.verified,
      'REJECTED' => PayoutAccountStatus.rejected,
      'DISABLED' => PayoutAccountStatus.disabled,
      _ => PayoutAccountStatus.unknown,
    },
    version: json.intOrNull('version') ?? 0,
    note: json.strOrNull('verificationNote'),
  );

  final String id;
  final PayoutMethod method;
  final String provider;
  final String holder;

  /// The last four characters of the number, the rest starred. The full
  /// number is never sent back.
  final String masked;
  final PayoutAccountStatus status;
  final int version;

  /// Why verification failed, when it did.
  final String? note;

  String get statusLabel => switch (status) {
    PayoutAccountStatus.pending => 'Being checked',
    PayoutAccountStatus.verified => 'Verified',
    PayoutAccountStatus.rejected => 'Not verified',
    PayoutAccountStatus.disabled => 'Removed',
    PayoutAccountStatus.unknown => 'Unknown',
  };
}

/// A new or edited payout account. The API takes the destination as a
/// free-form map; these are the keys it reads the masked reference from.
class PayoutAccountDraft {
  const PayoutAccountDraft({
    required this.method,
    required this.provider,
    required this.holder,
    required this.number,
    this.branch,
  });

  final PayoutMethod method;
  final String provider;
  final String holder;

  /// The account number, or the mobile money phone number.
  final String number;
  final String? branch;

  Json toJson() => {
    'method': method.wire,
    'provider': provider.trim(),
    'accountHolderName': holder.trim(),
    'destination': {
      if (method == PayoutMethod.bank) ...{
        'accountNumber': number.trim(),
        if (branch?.trim().isNotEmpty ?? false) 'branch': branch!.trim(),
      } else
        'phoneNumber': number.replaceAll(RegExp(r'[\s-]'), ''),
    },
  };
}

enum PayoutStatus {
  requested,
  approved,
  processing,
  succeeded,
  failed,
  cancelled,
  checking,
}

class PayoutRequest {
  const PayoutRequest({
    required this.id,
    required this.amount,
    required this.currency,
    required this.status,
    required this.version,
    required this.createdAt,
    this.account,
    this.failureReason,
  });

  factory PayoutRequest.fromJson(Json json) => PayoutRequest(
    id: json.str('id'),
    amount: json.intOrNull('amount') ?? 0,
    currency: json.strOrNull('currency') ?? 'ZMW',
    status: switch (json.strOrNull('status')) {
      'REQUESTED' => PayoutStatus.requested,
      'APPROVED' => PayoutStatus.approved,
      'PROCESSING' => PayoutStatus.processing,
      'SUCCEEDED' => PayoutStatus.succeeded,
      'FAILED' => PayoutStatus.failed,
      'CANCELLED' => PayoutStatus.cancelled,
      _ => PayoutStatus.checking,
    },
    version: json.intOrNull('version') ?? 0,
    createdAt: json.dateOrNull('createdAt') ?? DateTime.now(),
    account: json.objOrNull('payoutAccount') == null
        ? null
        : PayoutAccount.fromJson(json.obj('payoutAccount')),
    failureReason:
        json.strOrNull('failureReason') ?? json.strOrNull('cancellationReason'),
  );

  final String id;
  final int amount;
  final String currency;
  final PayoutStatus status;
  final int version;
  final DateTime createdAt;
  final PayoutAccount? account;
  final String? failureReason;

  /// Only a request nobody has acted on yet can be withdrawn.
  bool get cancellable => status == PayoutStatus.requested;

  String get statusLabel => switch (status) {
    PayoutStatus.requested => 'Requested',
    PayoutStatus.approved => 'Approved',
    PayoutStatus.processing => 'Being paid',
    PayoutStatus.succeeded => 'Paid',
    PayoutStatus.failed => 'Failed',
    PayoutStatus.cancelled => 'Cancelled',
    PayoutStatus.checking => 'Being checked',
  };
}
