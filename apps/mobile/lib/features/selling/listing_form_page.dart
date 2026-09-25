import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../app/services.dart';
import '../../core/network/api_exception.dart';
import '../../core/util/money.dart';
import '../../core/widgets/state_views.dart';
import '../../design/design.dart';
import '../../domain/seller_catalog.dart';
import '../../domain/selling.dart';

/// Creating a listing: find the product in the catalog, pick the variant,
/// then say how it is sold. With [listing], edits a hidden listing's
/// details instead (the product and price are changed elsewhere).
class ListingFormPage extends StatefulWidget {
  const ListingFormPage({super.key, this.product, this.listing});

  /// Chosen already — from an approved product submission.
  final CatalogProduct? product;
  final Listing? listing;

  @override
  State<ListingFormPage> createState() => _ListingFormPageState();
}

class _ListingFormPageState extends State<ListingFormPage> {
  final _form = GlobalKey<FormState>();
  final _search = TextEditingController();
  late final _title = TextEditingController(text: widget.listing?.title);
  late final _sku = TextEditingController(text: widget.listing?.sku);
  final _price = TextEditingController();
  late ListingCondition _condition = ListingConditionInfo.from(
    widget.listing?.condition,
  );
  late Handling _handling = widget.listing == null
      ? Handling.seller
      : HandlingInfo.from(widget.listing!.fulfilmentMode);

  CatalogProduct? _product;
  CatalogVariant? _variant;
  List<CatalogProduct>? _results;
  bool _searching = false;
  Timer? _debounce;
  bool _saving = false;
  ApiException? _error;

  bool get _editing => widget.listing != null;

  @override
  void initState() {
    super.initState();
    final product = widget.product;
    if (product != null && product.variants.isNotEmpty) {
      _choose(product, product.variants.first);
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    for (final c in [_search, _title, _sku, _price]) {
      c.dispose();
    }
    super.dispose();
  }

  void _query(String text) {
    _debounce?.cancel();
    if (text.trim().length < 2) {
      setState(() => _results = null);
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 350), () async {
      setState(() => _searching = true);
      try {
        final found = await context.services.selling.searchCatalog(text);
        if (mounted && _search.text == text) setState(() => _results = found);
      } on ApiException catch (error) {
        if (mounted) showMessage(context, error.message);
      } finally {
        if (mounted) setState(() => _searching = false);
      }
    });
  }

  void _choose(CatalogProduct product, CatalogVariant variant) {
    setState(() {
      _product = product;
      _variant = variant;
      if (_title.text.isEmpty) {
        _title.text = product.variants.length > 1 || variant.name != null
            ? '${product.name} ${variant.label}'.trim()
            : product.name;
      }
      if (_sku.text.isEmpty) _sku.text = variant.sku;
    });
  }

  Future<void> _pickVariant(CatalogProduct product) async {
    if (product.variants.length == 1) {
      _choose(product, product.variants.single);
      return;
    }
    final id = await chooseOption<String>(
      context,
      title: 'Which one are you selling?',
      options: [for (final v in product.variants) SheetOption(v.id, v.label)],
    );
    final variant = product.variants.where((v) => v.id == id).firstOrNull;
    if (variant != null) _choose(product, variant);
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    final draft = ListingDraft(
      variantId: _editing ? widget.listing!.variantId : _variant!.id,
      title: _title.text,
      sku: _sku.text,
      condition: _condition,
      stock: _handling,
      fulfilment: _handling,
    );
    setState(() {
      _saving = true;
      _error = null;
    });
    final selling = context.services.selling;
    try {
      if (_editing) {
        await selling.editListing(widget.listing!, draft);
      } else {
        await selling.createListing(
          draft,
          price: parseMoneyInput(_price.text)!,
        );
      }
      if (!mounted) return;
      showMessage(
        context,
        _editing
            ? 'Listing updated'
            : 'Listing created. Put it on sale from Listings when ready.',
      );
      context.pop(true);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final chosen = _editing || _variant != null;
    return PageScaffold(
      title: _editing ? 'Edit listing' : 'New listing',
      bottomBar: chosen
          ? Button(
              label: _editing ? 'Save changes' : 'Create listing',
              loading: _saving,
              onPressed: _saving ? null : _save,
            )
          : null,
      slivers: [
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(
            Space.gutter,
            Space.x2,
            Space.gutter,
            0,
          ),
          sliver: SliverToBoxAdapter(
            child: chosen ? _details(context) : _finder(context),
          ),
        ),
      ],
    );
  }

  /// Step one: find what is being sold.
  Widget _finder(BuildContext context) {
    final results = _results;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        InputField(
          controller: _search,
          hint: 'Search the catalog',
          leading: Glyphs.search,
          autofocus: true,
          textInputAction: TextInputAction.search,
          onChanged: _query,
          trailing: _searching ? const Spinner(size: 18) : null,
        ),
        const SizedBox(height: Space.x4),
        if (results == null)
          Text(
            'Find the product you want to sell. Not in the catalog? Submit '
            'it from Products first.',
            style: context.type.small.copyWith(color: context.colors.inkMuted),
          )
        else if (results.isEmpty)
          const EmptyState(
            icon: Glyphs.searchOff,
            title: 'Nothing matches',
            message:
                'Try another name, or submit the product from Products so '
                'it can be added to the catalog.',
          )
        else
          InsetGroup(
            children: [
              for (final p in results)
                ListRow(
                  title: p.name,
                  subtitle: [
                    ?p.category,
                    p.variants.length == 1
                        ? '1 variant'
                        : '${p.variants.length} variants',
                  ].join(', '),
                  onPressed: p.variants.isEmpty ? null : () => _pickVariant(p),
                ),
            ],
          ),
      ],
    );
  }

  /// Step two: how it is sold.
  Widget _details(BuildContext context) {
    final server = _error?.fieldErrors;
    return Form(
      key: _form,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_product != null && _variant != null) ...[
            InsetGroup(
              children: [
                ListRow(
                  leading: Glyphs.tag,
                  title: _product!.name,
                  subtitle: _variant!.label,
                  trailing: widget.product == null
                      ? Text(
                          'Change',
                          style: context.type.label.copyWith(
                            color: context.colors.accent,
                          ),
                        )
                      : null,
                  showChevron: false,
                  onPressed: widget.product == null
                      ? () => setState(() {
                          _variant = null;
                          _title.clear();
                          _sku.clear();
                        })
                      : null,
                ),
              ],
            ),
            const SizedBox(height: Space.x6),
          ],
          InputFormField(
            controller: _title,
            label: 'Listing title',
            textCapitalization: TextCapitalization.sentences,
            serverError: server?['listingTitle'],
            validator: (v) => v.trim().length < 2
                ? 'Enter a title'
                : v.trim().length > 200
                ? 'Use 200 characters or fewer'
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
                  autocorrect: false,
                  textCapitalization: TextCapitalization.characters,
                  serverError: server?['sellerSku'],
                  validator: (v) => v.trim().isEmpty ? 'Enter a SKU' : null,
                ),
              ),
              if (!_editing) ...[
                const SizedBox(width: Space.x3),
                Expanded(
                  child: InputFormField(
                    controller: _price,
                    label: 'Price (K)',
                    hint: '4500',
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                    inputFormatters: [
                      FilteringTextInputFormatter.allow(RegExp(r'[\d.,]')),
                    ],
                    validator: (v) =>
                        (parseMoneyInput(v) ?? 0) > 0 ? null : 'Enter a price',
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: Space.x6),
          const GroupTitle('Condition'),
          SegmentedChoice<ListingCondition>(
            options: {for (final c in ListingCondition.values) c: c.label},
            value: _condition,
            onChanged: (c) => setState(() => _condition = c),
          ),
          const SizedBox(height: Space.x6),
          const GroupTitle('Who keeps the stock and sends orders'),
          ChoiceTiles<Handling>(
            value: _handling,
            onChanged: (h) => setState(() => _handling = h),
            options: const [
              ChoiceTile(
                Handling.seller,
                'I do',
                glyph: Glyphs.store,
                detail: 'You count stock and send orders',
              ),
              ChoiceTile(
                Handling.platform,
                'Commerce',
                glyph: Glyphs.truck,
                detail: 'Stocked in and sent from our warehouse',
              ),
            ],
          ),
          if (_error != null &&
              (_error!.fieldErrors.isEmpty ||
                  !_error!.fieldErrors.keys.any(
                    (k) => k == 'listingTitle' || k == 'sellerSku',
                  ))) ...[
            const SizedBox(height: Space.x4),
            Callout(message: _error!.message, tone: Tone.danger),
          ],
        ],
      ),
    );
  }
}
