/// The Commerce design system.
///
/// Built from Flutter's widgets-layer primitives — no Material or Cupertino
/// component, and no platform icon font, is used for anything visible. It
/// looks the same on iOS and Android: its own glyph set, a floating dock,
/// filled borderless fields and tags, and notices that drop from the top.
///
/// Patterns are borrowed where they earn it: Cupertino's large titles,
/// grouped lists, segmented control, action sheets, press feedback and
/// slide-with-swipe-back navigation; Material's focus rings, state tracking
/// and bolder selected state. Only text selection — handles, the copy/paste
/// menu — stays each platform's own, because that is muscle memory.
library;

export 'button.dart';
export 'controls.dart';
export 'glyphs.dart';
export 'lists.dart';
export 'overlays.dart';
export 'price.dart';
export 'pressable.dart';
export 'scaffold.dart';
export 'spinner.dart';
export 'states.dart';
export 'tabs.dart';
export 'text_field.dart';
export 'theme.dart';
export 'tokens.dart';
