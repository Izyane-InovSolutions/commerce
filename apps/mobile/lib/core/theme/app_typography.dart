import 'package:flutter/material.dart';

abstract final class AppTypography {
  static const display = TextStyle(
    fontSize: 32, fontWeight: FontWeight.w700, height: 1.15,
    letterSpacing: -0.6,
  );
  static const headline = TextStyle(
    fontSize: 24, fontWeight: FontWeight.w700, height: 1.2,
    letterSpacing: -0.3,
  );
  static const title = TextStyle(
    fontSize: 18, fontWeight: FontWeight.w600, height: 1.25,
  );
  static const body = TextStyle(
    fontSize: 15, fontWeight: FontWeight.w400, height: 1.45,
  );
  static const bodyMedium = TextStyle(
    fontSize: 15, fontWeight: FontWeight.w500, height: 1.4,
  );
  static const label = TextStyle(
    fontSize: 13, fontWeight: FontWeight.w600, height: 1.25,
  );
  static const caption = TextStyle(
    fontSize: 12, fontWeight: FontWeight.w400, height: 1.3,
  );
}
