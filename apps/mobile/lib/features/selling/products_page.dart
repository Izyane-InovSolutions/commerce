import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../app/services.dart';
import '../../core/files/file_source.dart';
import '../../core/network/api_exception.dart';
import '../../core/state/loader.dart';
import '../../core/util/dates.dart';
import '../../core/widgets/api_image.dart';
import '../../core/widgets/state_views.dart';
import '../../design/design.dart';
import '../../domain/seller_catalog.dart';
import 'uploads.dart';

Tone _tone(SubmissionStatus status) => switch (status) {
  SubmissionStatus.pending => Tone.warning,
  SubmissionStatus.approved => Tone.accent,
  SubmissionStatus.rejected => Tone.danger,
  SubmissionStatus.unknown => Tone.neutral,
};

/// Products the seller has sent in for the catalog. A product is reviewed
/// once; after approval it can be listed for sale.
class ProductsPage extends StatefulWidget {
  const ProductsPage({super.key});

  @override
  State<ProductsPage> createState() => _ProductsPageState();
}

class _ProductsPageState extends State<ProductsPage> {
  late final Loader<List<ProductSubmission>> _products;
  bool _initialised = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialised) return;
    _initialised = true;
    _products = Loader(context.services.selling.submissions);
  }

  @override
  void dispose() {
    _products.dispose();
    super.dispose();
  }

  Future<void> _push(String route) async {
    await context.push(route);
    _products.load(silent: true);
  }

  @override
  Widget build(BuildContext context) {
    return PageScaffold(
      title: 'Products',
      onRefresh: () => _products.load(silent: true),
      bottomBar: Button(
        label: 'Submit a product',
        icon: Glyphs.add,
        onPressed: () => _push('/selling/products/new'),
      ),
      slivers: [
        LoaderSliver(
          loader: _products,
          builder: (context, products) {
            if (products.isEmpty) {
              return const SliverFillRemaining(
                hasScrollBody: false,
                child: EmptyState(
                  icon: Glyphs.image,
                  title: 'Nothing submitted yet',
                  message:
                      "If what you sell isn't in the catalog yet, submit it. "
                      'Once the Commerce team approves it, you can list it '
                      'for sale.',
                ),
              );
            }
            return SliverPadding(
              padding: const EdgeInsets.fromLTRB(
                Space.gutter,
                Space.x3,
                Space.gutter,
                0,
              ),
              sliver: SliverToBoxAdapter(
                child: InsetGroup(
                  footer:
                      'Selling something already in the catalog? Create a '
                      'listing for it from Listings instead.',
                  children: [
                    for (final p in products)
                      ListRow(
                        title: p.name,
                        subtitle: 'Sent ${formatDate(p.createdAt)}',
                        trailing: StatusBadge(
                          p.statusLabel,
                          tone: _tone(p.status),
                        ),
                        onPressed: () => _push('/selling/products/${p.id}'),
                      ),
                  ],
                ),
              ),
            );
          },
        ),
      ],
    );
  }
}

class SubmissionPage extends StatefulWidget {
  const SubmissionPage({super.key, required this.id});

  final String id;

  @override
  State<SubmissionPage> createState() => _SubmissionPageState();
}

class _SubmissionPageState extends State<SubmissionPage> {
  late final Loader<ProductSubmission> _product;
  bool _initialised = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialised) return;
    _initialised = true;
    final selling = context.services.selling;
    _product = Loader(() => selling.submission(widget.id));
  }

  @override
  void dispose() {
    _product.dispose();
    super.dispose();
  }

  Future<void> _list(ProductSubmission p) async {
    var variant = p.variants.firstOrNull;
    if (p.variants.length > 1) {
      final id = await chooseOption<String>(
        context,
        title: 'Which one are you selling?',
        options: [for (final v in p.variants) SheetOption(v.id, v.label)],
      );
      variant = p.variants.where((v) => v.id == id).firstOrNull;
    }
    if (variant == null || !mounted) return;
    await context.push(
      '/selling/listings/new',
      extra: CatalogProduct(id: p.id, name: p.name, variants: [variant]),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _product,
      builder: (context, _) {
        final p = _product.data;
        return PageScaffold(
          title: p?.name ?? 'Product',
          onRefresh: () => _product.load(silent: true),
          bottomBar: p?.status == SubmissionStatus.approved
              ? Button(label: 'List it for sale', onPressed: () => _list(p!))
              : null,
          slivers: [
            LoaderSliver(
              loader: _product,
              builder: (context, p) => SliverPadding(
                padding: const EdgeInsets.fromLTRB(
                  Space.gutter,
                  Space.x2,
                  Space.gutter,
                  0,
                ),
                sliver: SliverList.list(
                  children: [
                    if (p.imageUrl != null) ...[
                      ClipRRect(
                        borderRadius: const BorderRadius.all(Radii.tile),
                        child: AspectRatio(
                          aspectRatio: 4 / 3,
                          child: ApiImage(p.imageUrl),
                        ),
                      ),
                      const SizedBox(height: Space.x4),
                    ],
                    Callout(
                      message: switch (p.status) {
                        SubmissionStatus.pending =>
                          'With the Commerce team for review. You can list '
                              "it for sale once it's approved.",
                        SubmissionStatus.approved =>
                          'Approved and in the catalog. List it to start '
                              'selling it.',
                        SubmissionStatus.rejected =>
                          p.reviewReason ??
                              "This product wasn't approved. Submit it again "
                                  'with the details corrected.',
                        SubmissionStatus.unknown => 'Status unknown.',
                      },
                      tone: _tone(p.status),
                    ),
                    const SizedBox(height: Space.x6),
                    InsetGroup(
                      title: 'Details',
                      children: [
                        if (p.category != null)
                          ListRow(
                            title: 'Category',
                            trailing: Text(p.category!),
                          ),
                        if (p.brand != null)
                          ListRow(title: 'Brand', trailing: Text(p.brand!)),
                        for (final v in p.variants)
                          ListRow(title: v.label, subtitle: 'SKU ${v.sku}'),
                      ],
                    ),
                    if (p.description?.trim().isNotEmpty ?? false) ...[
                      const SizedBox(height: Space.x6),
                      const GroupTitle('Description'),
                      Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: Space.x4,
                        ),
                        child: Text(p.description!),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

/// A new product for the catalog: what it is, how it is sold, and photos.
class SubmitProductPage extends StatefulWidget {
  const SubmitProductPage({super.key});

  @override
  State<SubmitProductPage> createState() => _SubmitProductPageState();
}

class _SubmitProductPageState extends State<SubmitProductPage> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _sku = TextEditingController();
  final _variant = TextEditingController();
  final _description = TextEditingController();
  final _returnDays = TextEditingController(text: '14');
  late final Uploads _photos;
  late final Loader<(List<NamedRef>, List<NamedRef>)> _lookups;
  NamedRef? _category;
  NamedRef? _brand;
  bool _returnable = true;
  bool _initialised = false;
  bool _sending = false;
  String? _photosError;
  ApiException? _error;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialised) return;
    _initialised = true;
    final services = context.services;
    _photos = Uploads(
      files: services.files,
      media: services.media,
      kinds: const {FileKind.image},
    );
    final selling = services.selling;
    _lookups = Loader(() => (selling.categories(), selling.brands()).wait);
  }

  @override
  void dispose() {
    for (final c in [_name, _sku, _variant, _description, _returnDays]) {
      c.dispose();
    }
    _photos.dispose();
    _lookups.dispose();
    super.dispose();
  }

  Future<void> _pick(
    String title,
    List<NamedRef> refs,
    NamedRef? current,
    ValueChanged<NamedRef?> onPicked,
  ) async {
    final id = await chooseOption<String>(
      context,
      title: title,
      selected: current?.id ?? '',
      options: [
        const SheetOption('', 'None'),
        for (final r in refs) SheetOption(r.id, r.name),
      ],
    );
    if (id == null) return;
    setState(() => onPicked(refs.where((r) => r.id == id).firstOrNull));
  }

  Future<void> _submit() async {
    final ok = _form.currentState!.validate();
    setState(() {
      _photosError = _photos.items.isEmpty
          ? 'Add at least one photo'
          : !_photos.allDone
          ? 'Wait for the photos to finish uploading'
          : null;
    });
    if (!ok || _photosError != null) return;
    setState(() {
      _sending = true;
      _error = null;
    });
    final selling = context.services.selling;
    try {
      final id = await selling.submitProduct(
        ProductDraft(
          name: _name.text,
          slug: slugify(_name.text),
          sku: _sku.text,
          variantName: _variant.text,
          description: _description.text,
          categoryId: _category?.id,
          brandId: _brand?.id,
          returnable: _returnable,
          returnWindowDays: int.tryParse(_returnDays.text),
        ),
        photoIds: _photos.assetIds,
      );
      if (!mounted) return;
      showMessage(context, 'Sent for review');
      context.pushReplacement('/selling/products/$id');
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return PageScaffold(
      title: 'Submit a product',
      bottomBar: Button(
        label: 'Send for review',
        loading: _sending,
        onPressed: _sending ? null : _submit,
      ),
      slivers: [
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(
            Space.gutter,
            Space.x2,
            Space.gutter,
            0,
          ),
          sliver: SliverToBoxAdapter(
            child: Form(
              key: _form,
              child: ListenableBuilder(
                listenable: _lookups,
                builder: (context, _) {
                  final (categories, brands) =
                      _lookups.data ?? (const <NamedRef>[], const <NamedRef>[]);
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      InputFormField(
                        controller: _name,
                        label: 'Product name',
                        hint: 'Aria Wireless Earbuds',
                        textCapitalization: TextCapitalization.words,
                        serverError:
                            _error?.fieldErrors['name'] ??
                            _error?.fieldErrors['slug'],
                        validator: (v) => slugify(v).isEmpty
                            ? 'Enter the product name'
                            : null,
                      ),
                      const SizedBox(height: Space.x4),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: InputFormField(
                              controller: _sku,
                              label: 'Your SKU',
                              hint: 'ARIA-BLK',
                              autocorrect: false,
                              textCapitalization: TextCapitalization.characters,
                              validator: (v) =>
                                  v.trim().isEmpty ? 'Enter a SKU' : null,
                            ),
                          ),
                          const SizedBox(width: Space.x3),
                          Expanded(
                            child: InputFormField(
                              controller: _variant,
                              label: 'Variant (optional)',
                              hint: 'Black',
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: Space.x4),
                      InputFormField(
                        controller: _description,
                        label: 'Description (optional)',
                        maxLines: 6,
                        textCapitalization: TextCapitalization.sentences,
                      ),
                      const SizedBox(height: Space.x6),
                      InsetGroup(
                        children: [
                          ListRow(
                            title: 'Category',
                            subtitle: _category?.name ?? 'None',
                            onPressed: categories.isEmpty
                                ? null
                                : () => _pick(
                                    'Category',
                                    categories,
                                    _category,
                                    (r) => _category = r,
                                  ),
                          ),
                          ListRow(
                            title: 'Brand',
                            subtitle: _brand?.name ?? 'None',
                            onPressed: brands.isEmpty
                                ? null
                                : () => _pick(
                                    'Brand',
                                    brands,
                                    _brand,
                                    (r) => _brand = r,
                                  ),
                          ),
                          SwitchRow(
                            title: 'Can be returned',
                            value: _returnable,
                            onChanged: (v) => setState(() => _returnable = v),
                          ),
                        ],
                      ),
                      if (_returnable) ...[
                        const SizedBox(height: Space.x4),
                        InputFormField(
                          controller: _returnDays,
                          label: 'Days to return it',
                          keyboardType: TextInputType.number,
                          inputFormatters: [
                            FilteringTextInputFormatter.digitsOnly,
                          ],
                          validator: (v) => int.tryParse(v) == null
                              ? 'Enter a number of days'
                              : null,
                        ),
                      ],
                      const SizedBox(height: Space.x6),
                      UploadList(
                        uploads: _photos,
                        title: 'Photos',
                        addLabel: 'Add a photo',
                        footer:
                            'The first photo is the main one. JPEG, PNG or '
                            'WebP, up to 10 MB each.',
                        error: _photosError,
                      ),
                      if (_error != null && _error!.fieldErrors.isEmpty) ...[
                        const SizedBox(height: Space.x4),
                        Callout(message: _error!.message, tone: Tone.danger),
                      ],
                    ],
                  );
                },
              ),
            ),
          ),
        ),
      ],
    );
  }
}
