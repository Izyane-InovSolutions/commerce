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
/// With [slivers], the title starts large and left-aligned and collapses
/// into the bar as the page scrolls — Cupertino's large-title navigation,
/// which names the screen boldly without costing the content any room once
/// you are reading it. With [body], the bar is compact and fixed, for
/// screens that are one fixed layout (a form, a payment in progress).
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
              large: largeTitle,
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
          _CompactBar(
            title: title,
            back: back,
            actions: actions,
            topInset: media.padding.top,
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

class _CompactBar extends StatelessWidget {
  const _CompactBar({
    required this.title,
    required this.back,
    required this.actions,
    required this.topInset,
  });

  final String title;
  final Widget? back;
  final List<Widget> actions;
  final double topInset;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Container(
      padding: EdgeInsets.only(top: topInset),
      decoration: BoxDecoration(
        color: colors.paper,
        border: Border(bottom: BorderSide(color: colors.line, width: 0.8)),
      ),
      child: SizedBox(
        height: 52,
        child: NavigationToolbar(
          leading: back ?? const SizedBox(width: Space.x2),
          middle: Semantics(
            header: true,
            child: Text(
              title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: context.type.label.copyWith(fontSize: 17),
            ),
          ),
          trailing: Row(mainAxisSize: MainAxisSize.min, children: actions),
          middleSpacing: Space.x2,
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

  static const _bar = 52.0;
  static const _largeExtra = 50.0;

  @override
  double get minExtent => topInset + _bar;

  @override
  double get maxExtent => topInset + _bar + (large ? _largeExtra : 0);

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) {
    final range = maxExtent - minExtent;
    final t = range == 0 ? 1.0 : (shrinkOffset / range).clamp(0.0, 1.0);
    final collapsed = !large || t > 0.85;

    return Container(
      decoration: BoxDecoration(
        color: colors.paper,
        border: Border(
          bottom: BorderSide(
            color: collapsed || overlapsContent
                ? colors.line
                : const Color(0x00000000),
            width: 0.8,
          ),
        ),
      ),
      child: Stack(
        children: [
          Positioned(
            top: topInset,
            left: 0,
            right: 0,
            height: _bar,
            child: NavigationToolbar(
              leading: back ?? const SizedBox(width: Space.x2),
              middle: AnimatedOpacity(
                opacity: collapsed ? 1 : 0,
                duration: Motion.fast,
                child: Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: type.label.copyWith(fontSize: 17),
                ),
              ),
              trailing: Row(mainAxisSize: MainAxisSize.min, children: actions),
              middleSpacing: Space.x2,
            ),
          ),
          if (large)
            Positioned(
              left: Space.gutter,
              right: Space.gutter,
              bottom: 6,
              child: Opacity(
                opacity: (1 - t * 1.3).clamp(0.0, 1.0),
                child: Semantics(
                  header: true,
                  child: Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: type.display,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  @override
  bool shouldRebuild(_TitleHeader old) =>
      old.title != title ||
      old.large != large ||
      old.back != back ||
      old.actions != actions ||
      old.topInset != topInset ||
      old.colors != colors;
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
