import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_radius.dart';

class CommerceSearchBar extends StatelessWidget {
  const CommerceSearchBar({
    super.key,
    this.hintText = 'Search products',
    this.onTap,
  });

  final String hintText;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surfaceVariant,
      borderRadius: BorderRadius.circular(AppRadius.md),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.md),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
          child: Row(
            children: [
              const Icon(Icons.search_rounded, size: 21, color: AppColors.textSecondary),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  hintText,
                  style: const TextStyle(color: AppColors.textSecondary, fontSize: 14),
                ),
              ),
              const Icon(Icons.tune_rounded, size: 20, color: AppColors.textSecondary),
            ],
          ),
        ),
      ),
    );
  }
}
