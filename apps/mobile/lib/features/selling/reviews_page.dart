import 'package:flutter/widgets.dart';

import '../../app/services.dart';
import '../../core/state/loader.dart';
import '../../core/util/dates.dart';
import '../../core/widgets/state_views.dart';
import '../../design/design.dart';
import '../../domain/seller_catalog.dart';
import '../../domain/seller_feedback.dart';

enum _Kind { products, shop }

/// What customers say: reviews of the products sold, and ratings of the
/// shop itself. Read-only — the API gives sellers no reply.
class ReviewsPage extends StatefulWidget {
  const ReviewsPage({super.key});

  @override
  State<ReviewsPage> createState() => _ReviewsPageState();
}

class _ReviewsPageState extends State<ReviewsPage> {
  late final Loader<DataPage<SellerFeedback>> _reviews;
  late final Loader<DataPage<SellerFeedback>> _ratings;
  _Kind _kind = _Kind.products;
  bool _initialised = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialised) return;
    _initialised = true;
    final selling = context.services.selling;
    _reviews = Loader(selling.reviews);
    _ratings = Loader(selling.ratings);
  }

  @override
  void dispose() {
    _reviews.dispose();
    _ratings.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final loader = _kind == _Kind.products ? _reviews : _ratings;
    return PageScaffold(
      title: 'Reviews',
      onRefresh: () => loader.load(silent: true),
      slivers: [
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(
            Space.gutter,
            Space.x3,
            Space.gutter,
            Space.x4,
          ),
          sliver: SliverToBoxAdapter(
            child: SegmentedChoice<_Kind>(
              options: const {
                _Kind.products: 'Product reviews',
                _Kind.shop: 'Shop ratings',
              },
              value: _kind,
              onChanged: (k) => setState(() => _kind = k),
            ),
          ),
        ),
        LoaderSliver(
          key: ValueKey(_kind),
          loader: loader,
          builder: (context, page) {
            if (page.items.isEmpty) {
              return const SliverFillRemaining(
                hasScrollBody: false,
                child: EmptyState(
                  icon: Glyphs.star,
                  title: 'Nothing yet',
                  message: 'Customers can review once their order arrives.',
                ),
              );
            }
            final average =
                page.items.fold(0, (s, f) => s + f.rating) / page.items.length;
            return SliverPadding(
              padding: const EdgeInsets.symmetric(horizontal: Space.gutter),
              sliver: SliverList.list(
                children: [
                  Padding(
                    padding: const EdgeInsets.only(
                      left: Space.x4,
                      bottom: Space.x3,
                    ),
                    child: Text(
                      '${average.toStringAsFixed(1)} out of 5, from '
                      '${page.total} ${page.total == 1 ? 'review' : 'reviews'}',
                      style: context.type.small.copyWith(
                        color: context.colors.inkMuted,
                      ),
                    ),
                  ),
                  InsetGroup(
                    children: [for (final f in page.items) _Review(f)],
                  ),
                ],
              ),
            );
          },
        ),
      ],
    );
  }
}

class _Review extends StatelessWidget {
  const _Review(this.feedback);

  final SellerFeedback feedback;

  @override
  Widget build(BuildContext context) {
    final f = feedback;
    final colors = context.colors;
    final type = context.type;
    return Semantics(
      label: '${f.rating} out of 5 stars',
      child: Padding(
        padding: const EdgeInsets.all(Space.x4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                for (var i = 1; i <= 5; i++)
                  Glyph(
                    Glyphs.star,
                    size: 16,
                    color: i <= f.rating ? colors.star : colors.line,
                  ),
                const SizedBox(width: Space.x2),
                Expanded(
                  child: Text(
                    '${f.reviewer}, ${formatDate(f.createdAt)}',
                    style: type.caption.copyWith(color: colors.inkMuted),
                  ),
                ),
                if (!f.visible) const StatusBadge('Hidden'),
                if (f.reported) ...[
                  const SizedBox(width: Space.x1),
                  const StatusBadge('Reported', tone: Tone.warning),
                ],
              ],
            ),
            if (f.product != null) ...[
              const SizedBox(height: Space.x2),
              Text(
                f.product!,
                style: type.small.copyWith(color: colors.inkMuted),
              ),
            ],
            if (f.title?.trim().isNotEmpty ?? false) ...[
              const SizedBox(height: Space.x1),
              Text(f.title!, style: type.bodyStrong),
            ],
            if (f.body?.trim().isNotEmpty ?? false) ...[
              const SizedBox(height: Space.x1),
              Text(f.body!, style: type.body),
            ],
          ],
        ),
      ),
    );
  }
}
