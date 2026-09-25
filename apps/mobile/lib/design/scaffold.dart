import 'package:flutter/cupertino.dart'
    show CupertinoSliverRefreshControl, RefreshIndicatorMode;
import 'glyphs.dart';
import 'package:flutter/widgets.dart';

import 'button.dart';
import 'overlays.dart';
import 'spinner.dart';
import 'theme.dart';
import 'tokens.dart';

/// The frame of every screen.
///
/// The bar is one row on every screen: back, then the title, left-aligned
/// beside it, then the actions — all on the same line, so the eye reads the
/// screen's name and what can be done there in one pass, and nothing moves
/// as the page scrolls. With [slivers] the bar stays pinned over scrolling
/// content and draws its hairline once something passes beneath it; with
/// [body] it sits above a fixed layout (a form, a payment in progress).
class PageScaffold extends StatelessWidget {
  const PageScaffold({
    super.key,
    required this.title,
    this.slivers,
    this.body,
    this.actions = const [],
    this.bottomBar,
    this.onRefresh,
    this.largeTitle = true,
    this.onBack,
    this.showBack,
    this.scrollController,
  }) : assert(
         (slivers == null) != (body == null),
         'Give a PageScaffold either slivers or a body',
       );

  final String title;
  final List<Widget>? slivers;
  final Widget? body;
  final List<Widget> actions;

  /// Pinned to the bottom, over frosted glass; rises with the keyboard.
  final Widget? bottomBar;
  final Future<void> Function()? onRefresh;

  /// A tab's own screen names itself at title size; a screen pushed on top
  /// of one uses the smaller heading size, as the back button already says
  /// where it sits.
  final bool largeTitle;

  /// Replaces the default back behaviour (popping the route).
  final VoidCallback? onBack;

  /// Defaults to shown whenever there is a route to go back to.
  final bool? showBack;
  final ScrollController? scrollController;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final media = MediaQuery.of(context);
    final canPop =
        showBack ?? (onBack != null || Navigator.of(context).canPop());
    final back = canPop
        ? _BackButton(
            onPressed: onBack ?? () => Navigator.of(context).maybePop(),
          )
        : null;

    Widget content;
    if (slivers != null) {
      content = CustomScrollView(
        controller: scrollController,
        slivers: [
          SliverPersistentHeader(
            pinned: true,
            delegate: _TitleHeader(
              title: title,
              large: largeTitle && back == null,
              back: back,
              actions: actions,
              topInset: media.padding.top,
              colors: colors,
              type: context.type,
            ),
          ),
          if (onRefresh != null)
            CupertinoSliverRefreshControl(
              onRefresh: onRefresh,
              builder: _refreshIndicator,
            ),
          ...slivers!,
          // Room for the tab bar or bottom bar, and the home indicator.
          SliverToBoxAdapter(
            child: SizedBox(
              height:
                  media.padding.bottom + (bottomBar == null ? Space.x6 : 96),
            ),
          ),
        ],
      );
    } else {
      content = Column(
        children: [
          _Bar(
            title: title,
            large: largeTitle && back == null,
            back: back,
            actions: actions,
            topInset: media.padding.top,
            divided: true,
          ),
          Expanded(child: body!),
        ],
      );
    }

    return ColoredBox(
      color: colors.paper,
      child: Padding(
        // The keyboard pushes the bottom bar up rather than covering it.
        padding: EdgeInsets.only(bottom: media.viewInsets.bottom),
        child: Stack(
          children: [
            Positioned.fill(
              child: MediaQuery.removeViewInsets(
                context: context,
                removeBottom: true,
                child: content,
              ),
            ),
            if (bottomBar != null)
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                child: Frosted(
                  border: BorderSide(color: colors.line),
                  child: Padding(
                    padding: EdgeInsets.fromLTRB(
                      Space.gutter,
                      Space.x3,
                      Space.gutter,
                      Space.x3 +
                          (media.viewInsets.bottom > 0
                              ? 0
                              : media.padding.bottom),
                    ),
                    child: bottomBar,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  static Widget _refreshIndicator(
    BuildContext context,
    RefreshIndicatorMode mode,
    double pulled,
    double trigger,
    double indicator,
  ) {
    final progress = (pulled / trigger).clamp(0.0, 1.0);
    return Center(
      child: Opacity(
        opacity: progress,
        child: Transform.scale(
          scale: 0.6 + 0.4 * progress,
          child: const Spinner(size: 24),
        ),
      ),
    );
  }
}

class _BackButton extends StatelessWidget {
  const _BackButton({required this.onPressed});

  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => IconAction(
    // One back glyph on every platform: the app's own chevron, placed where
    // both platforms put back.
    icon: Glyphs.back,
    semanticLabel: 'Back',
    onPressed: onPressed,
  );
}

/// The one-row bar: back, title, actions.
class _Bar extends StatelessWidget {
  const _Bar({
    required this.title,
    required this.large,
    required this.back,
    required this.actions,
    required this.topInset,
    required this.divided,
  });

  static const height = 56.0;

  final String title;
  final bool large;
  final Widget? back;
  final List<Widget> actions;
  final double topInset;

  /// Draws the hairline under the bar.
  final bool divided;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final type = context.type;
    final style = large ? type.title : type.heading;
    return AnimatedContainer(
      duration: Motion.fast,
      padding: EdgeInsets.only(top: topInset),
      decoration: BoxDecoration(
        color: colors.paper,
        border: Border(
          bottom: BorderSide(
            color: divided ? colors.line : const Color(0x00000000),
            width: 0.8,
          ),
        ),
      ),
      child: SizedBox(
        height: height,
        child: Row(
          children: [
            if (back != null) ...[
              const SizedBox(width: Space.x1),
              back!,
            ] else
              const SizedBox(width: Space.gutter),
            Expanded(
              child: Semantics(
                header: true,
                child: Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: style,
                ),
              ),
            ),
            if (actions.isNotEmpty) ...[
              const SizedBox(width: Space.x2),
              ...actions,
              const SizedBox(width: Space.x1),
            ] else
              const SizedBox(width: Space.gutter),
          ],
        ),
      ),
    );
  }
}

class _TitleHeader extends SliverPersistentHeaderDelegate {
  const _TitleHeader({
    required this.title,
    required this.large,
    required this.back,
    required this.actions,
    required this.topInset,
    required this.colors,
    required this.type,
  });

  final String title;
  final bool large;
  final Widget? back;
  final List<Widget> actions;
  final double topInset;
  final Palette colors;
  final TypeScale type;

  @override
  double get minExtent => topInset + _Bar.height;

  @override
  double get maxExtent => minExtent;

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) => _Bar(
    title: title,
    large: large,
    back: back,
    actions: actions,
    topInset: topInset,
    divided: overlapsContent || shrinkOffset > 0,
  );

  @override
  bool shouldRebuild(_TitleHeader old) =>
      old.title != title ||
      old.large != large ||
      old.back != back ||
      old.actions != actions ||
      old.topInset != topInset ||
      old.colors != colors ||
      old.type != type;
}

/// A section heading inside a page — plain, sentence case, no eyebrow.
class SectionTitle extends StatelessWidget {
  const SectionTitle(this.text, {super.key, this.trailing});

  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(
      Space.gutter,
      Space.x6,
      Space.gutter,
      Space.x3,
    ),
    child: Row(
      children: [
        Expanded(
          child: Semantics(
            header: true,
            child: Text(text, style: context.type.heading),
          ),
        ),
        ?trailing,
      ],
    ),
  );
}
