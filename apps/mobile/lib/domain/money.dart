import '../core/network/json.dart';
import '../core/util/money.dart';

/// An amount in minor units with its currency, exactly as the API sends it.
class Money {
  const Money(this.amount, this.currency);

  factory Money.fromJson(Json json) =>
      Money(json.integer('amount'), json.str('currency'));

  static Money? maybe(Json? json) => json == null ? null : Money.fromJson(json);

  final int amount;
  final String currency;

  String get formatted => formatMoney(amount, currency);

  @override
  String toString() => formatted;
}
