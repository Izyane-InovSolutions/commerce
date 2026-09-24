import 'package:flutter/widgets.dart';

import '../core/util/money.dart';
import 'theme.dart';

enum PriceSize {
  /// In a line of text — cart lines, order rows.
  inline(15, 600),

  /// Product tiles.
  tile(18, 720),

  /// The pay bar and summaries.
  total(24, 760),

  /// The product page's headline price.
  hero(38, 780);

  const PriceSize(this.fontSize, this.weight);

  final double fontSize;
  final int weight;
}

/// The signature of the design system: a price drawn as a small raised
/// symbol, heavy tabular whole units and small muted minor units — `K4,500`
/// with `00` riding beside it. The amount a shopper cares about reads first;
/// the ngwee that rarely matter step back.
///
/// Screen readers hear one amount ("K4,500.00"), not three fragments.
class Price extends StatelessWidget {
  const Price(
    this.minorUnits,
    this.currency, {
    super.key,
    this.size = PriceSize.tile,
    this.color,
    this.strike = false,
  });

  final int minorUnits;
  final String currency;
  final PriceSize size;
  final Color? color;

  /// For a line that can no longer be bought at this price.
  final bool strike;

  @override
  Widget build(BuildContext context) {
    final parts = moneyParts(minorUnits, currency);
    final colour = color ?? context.colors.ink;
    final type = context.type;
    final big = type
        .figures(size.fontSize, size.weight)
        .copyWith(
          color: colour,
          decoration: strike ? TextDecoration.lineThrough : null,
        );
    // Half size at the hero, but never under 11pt: at tile and inline sizes a
    // strict half would be 7–9pt, which is decoration rather than text.
    final smallSize = (size.fontSize * 0.5).clamp(11.0, double.infinity);
    final small = type
        .figures(smallSize, size.weight - 80)
        .copyWith(color: colour.withValues(alpha: 0.72));
    // Raise the small parts towards the cap height of the big figures; the
    // bigger the gap between the two sizes, the more lift it needs.
    final lift = EdgeInsets.only(
      top: ((size.fontSize - smallSize) * 0.28).clamp(0.0, double.infinity),
    );

    return Semantics(
      label: formatMoney(minorUnits, currency),
      excludeSemantics: true,
      // A price never wraps mid-amount; in a tight spot at a large text size
      // it scales down to fit instead.
      child: FittedBox(
        fit: BoxFit.scaleDown,
        alignment: AlignmentDirectional.centerStart,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (parts.negative) Text('-', style: big),
            Padding(
              padding: lift.copyWith(right: size.fontSize * 0.06),
              child: Text(parts.symbol, style: small.copyWith(color: colour)),
            ),
            Text(parts.whole, style: big),
            Padding(
              padding: lift.copyWith(left: size.fontSize * 0.04),
              child: Text(parts.minor, style: small),
            ),
          ],
        ),
      ),
    );
  }
}
