import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radius.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/commerce_search_bar.dart';

class HomePage extends StatelessWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: CustomScrollView(
          slivers: [
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.lg, AppSpacing.lg, 0),
              sliver: SliverToBoxAdapter(
                child: Row(
                  children: [
                    const Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Good morning', style: AppTypography.caption),
                          SizedBox(height: 4),
                          Text('Discover something great', style: AppTypography.title),
                        ],
                      ),
                    ),
                    IconButton(
                      onPressed: () {},
                      icon: const Icon(Icons.shopping_bag_outlined),
                    ),
                  ],
                ),
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.lg, AppSpacing.lg, 0),
              sliver: SliverToBoxAdapter(child: CommerceSearchBar(onTap: () {})),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.xl, AppSpacing.lg, 0),
              sliver: SliverToBoxAdapter(
                child: Container(
                  padding: const EdgeInsets.all(AppSpacing.xl),
                  decoration: BoxDecoration(
                    color: AppColors.primaryContainer,
                    borderRadius: BorderRadius.circular(AppRadius.xl),
                  ),
                  child: const Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Find your next favourite', style: AppTypography.headline),
                      SizedBox(height: AppSpacing.sm),
                      Text(
                        'Browse products from sellers you can trust.',
                        style: AppTypography.body,
                      ),
                    ],
                  ),
                ),
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.xxl, AppSpacing.lg, AppSpacing.lg),
              sliver: SliverToBoxAdapter(
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Shop by category', style: AppTypography.title),
                    TextButton(onPressed: () {}, child: const Text('See all')),
                  ],
                ),
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
              sliver: SliverGrid(
                delegate: SliverChildBuilderDelegate(
                  (context, index) => _CategoryTile(
                    icon: [Icons.devices_outlined, Icons.checkroom_outlined, Icons.home_outlined, Icons.sports_soccer_outlined][index],
                    label: ['Electronics', 'Fashion', 'Home', 'Sports'][index],
                  ),
                  childCount: 4,
                ),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  crossAxisSpacing: AppSpacing.md,
                  mainAxisSpacing: AppSpacing.md,
                  childAspectRatio: 2.2,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CategoryTile extends StatelessWidget {
  const _CategoryTile({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadius.lg),
        border: Border.all(color: AppColors.outline),
      ),
      child: Row(
        children: [
          const SizedBox(width: AppSpacing.md),
          Icon(icon, color: AppColors.textPrimary),
          const SizedBox(width: AppSpacing.sm),
          Expanded(child: Text(label, style: AppTypography.label)),
        ],
      ),
    );
  }
}
