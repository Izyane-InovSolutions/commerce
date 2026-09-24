import '../core/network/json.dart';
import 'money.dart';

class CartLine {
  const CartLine({
    required this.id,
    required this.offerId,
    required this.quantity,
    required this.lineTotal,
    required this.isAvailable,
    this.unitPrice,
  });

  factory CartLine.fromJson(Json json) => CartLine(
        id: json.str('id'),
        offerId: json.str('offerId'),
        quantity: json.integer('quantity'),
        lineTotal: json.intOrNull('lineTotal') ?? 0,
        isAvailable: json.boolean('isAvailable', fallback: true),
        unitPrice: Money.maybe(json.objOrNull('unitPrice')),
      );

  final String id;
  final String offerId;
  final int quantity;

  /// Minor units, totalled by the server.
  final int lineTotal;

  /// False once the line cannot be bought as it stands — unpublished, out of
  /// stock, or not priced in this currency. Checkout will refuse it.
  final bool isAvailable;
  final Money? unitPrice;
}

class Cart {
  const Cart({
    required this.items,
    required this.subtotal,
    this.currency,
  });

  factory Cart.fromJson(Json json) => Cart(
        items: json.list('items', CartLine.fromJson),
        subtotal: json.intOrNull('subtotal') ?? 0,
        currency: json.strOrNull('currency'),
      );

  static const empty = Cart(items: [], subtotal: 0);

  final List<CartLine> items;
  final int subtotal;
  final String? currency;

  int get itemCount => items.fold(0, (sum, line) => sum + line.quantity);
  bool get isEmpty => items.isEmpty;
  bool get hasUnavailable => items.any((line) => !line.isAvailable);
  Money? get subtotalMoney =>
      currency == null ? null : Money(subtotal, currency!);
}

class WishlistItem {
  const WishlistItem({
    required this.id,
    required this.offerId,
    required this.isAvailable,
    this.price,
  });

  factory WishlistItem.fromJson(Json json) => WishlistItem(
        id: json.str('id'),
        offerId: json.str('offerId'),
        isAvailable: json.boolean('isAvailable', fallback: true),
        price: Money.maybe(json.objOrNull('currentPrice')),
      );

  final String id;
  final String offerId;
  final bool isAvailable;
  final Money? price;
}
