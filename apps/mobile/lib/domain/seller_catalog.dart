import '../core/network/json.dart';

/// Products a seller has sent in for the catalog, and the catalog lookups
/// behind creating a listing.

enum SubmissionStatus { pending, approved, rejected, unknown }

class ProductSubmission {
  const ProductSubmission({
    required this.id,
    required this.name,
    required this.status,
    required this.createdAt,
    required this.variants,
    this.reviewReason,
    this.category,
    this.brand,
    this.description,
    this.imageUrl,
  });

  factory ProductSubmission.fromJson(Json json) {
    final media = json.list(
      'media',
      (m) => (primary: m.boolean('isPrimary'), url: m.strOrNull('url')),
    );
    return ProductSubmission(
      id: json.str('id'),
      name: json.strOrNull('name') ?? 'Untitled product',
      status: switch (json.strOrNull('submissionStatus')) {
        'PENDING' => SubmissionStatus.pending,
        'APPROVED' => SubmissionStatus.approved,
        'REJECTED' => SubmissionStatus.rejected,
        _ => SubmissionStatus.unknown,
      },
      createdAt: json.dateOrNull('createdAt') ?? DateTime.now(),
      variants: json.list('variants', CatalogVariant.fromJson),
      reviewReason: json.strOrNull('reviewReason'),
      category: json.objOrNull('category')?.strOrNull('name'),
      brand: json.objOrNull('brand')?.strOrNull('name'),
      description: json.strOrNull('description'),
      imageUrl:
          (media.where((m) => m.primary).firstOrNull ?? media.firstOrNull)?.url,
    );
  }

  final String id;
  final String name;
  final SubmissionStatus status;
  final DateTime createdAt;
  final List<CatalogVariant> variants;
  final String? reviewReason;
  final String? category;
  final String? brand;
  final String? description;

  /// API-relative and signed.
  final String? imageUrl;

  String get statusLabel => switch (status) {
    SubmissionStatus.pending => 'In review',
    SubmissionStatus.approved => 'Approved',
    SubmissionStatus.rejected => 'Not approved',
    SubmissionStatus.unknown => 'Unknown',
  };
}

/// A variant of a catalog product — what a listing sells.
class CatalogVariant {
  const CatalogVariant({required this.id, required this.sku, this.name});

  factory CatalogVariant.fromJson(Json json) => CatalogVariant(
    id: json.str('id'),
    sku: json.strOrNull('skuCode') ?? '',
    name: json.strOrNull('name'),
  );

  final String id;
  final String sku;
  final String? name;

  String get label => (name?.trim().isNotEmpty ?? false) ? name! : sku;
}

/// A published catalog product, found by search, to list a variant of.
class CatalogProduct {
  const CatalogProduct({
    required this.id,
    required this.name,
    required this.variants,
    this.category,
  });

  factory CatalogProduct.fromJson(Json json) => CatalogProduct(
    id: json.str('id'),
    name: json.strOrNull('name') ?? 'Untitled product',
    category: json.objOrNull('category')?.strOrNull('name'),
    variants: json.list('variants', CatalogVariant.fromJson),
  );

  final String id;
  final String name;
  final String? category;
  final List<CatalogVariant> variants;
}

class NamedRef {
  const NamedRef(this.id, this.name);

  factory NamedRef.fromJson(Json json) =>
      NamedRef(json.str('id'), json.strOrNull('name') ?? '');

  final String id;
  final String name;
}

/// A new product for the catalog, sent for review.
class ProductDraft {
  const ProductDraft({
    required this.name,
    required this.slug,
    required this.sku,
    this.variantName,
    this.description,
    this.categoryId,
    this.brandId,
    this.returnable = true,
    this.returnWindowDays,
  });

  final String name;
  final String slug;
  final String sku;
  final String? variantName;
  final String? description;
  final String? categoryId;
  final String? brandId;
  final bool returnable;
  final int? returnWindowDays;

  Json toJson() => {
    'name': name.trim(),
    'slug': slug,
    if (description?.trim().isNotEmpty ?? false)
      'description': description!.trim(),
    'categoryId': ?categoryId,
    'brandId': ?brandId,
    'isReturnable': returnable,
    if (returnable && returnWindowDays != null)
      'returnWindowDays': returnWindowDays,
  };
}

/// `Wireless Mouse (Black)` → `wireless-mouse-black`: the API's slug rule,
/// lowercase words joined by single hyphens.
String slugify(String text) => text
    .toLowerCase()
    .replaceAll(RegExp('[^a-z0-9]+'), '-')
    .replaceAll(RegExp(r'^-+|-+$'), '');

enum ListingCondition { newItem, used, refurbished }

extension ListingConditionInfo on ListingCondition {
  String get wire => switch (this) {
    ListingCondition.newItem => 'NEW',
    ListingCondition.used => 'USED',
    ListingCondition.refurbished => 'REFURBISHED',
  };

  String get label => switch (this) {
    ListingCondition.newItem => 'New',
    ListingCondition.used => 'Used',
    ListingCondition.refurbished => 'Refurbished',
  };

  static ListingCondition from(String? wire) => switch (wire) {
    'USED' => ListingCondition.used,
    'REFURBISHED' => ListingCondition.refurbished,
    _ => ListingCondition.newItem,
  };
}

/// Who holds the stock and who sends the order. Kept together because the
/// common cases are "I keep it and send it" or "Commerce's warehouse does".
enum Handling { seller, platform }

extension HandlingInfo on Handling {
  String get wire => switch (this) {
    Handling.seller => 'SELLER',
    Handling.platform => 'PLATFORM',
  };

  static Handling from(String? wire) =>
      wire == 'PLATFORM' ? Handling.platform : Handling.seller;
}

/// The editable details of a listing, for creating one or editing a draft.
class ListingDraft {
  const ListingDraft({
    required this.variantId,
    required this.title,
    required this.sku,
    this.condition = ListingCondition.newItem,
    this.stock = Handling.seller,
    this.fulfilment = Handling.seller,
  });

  final String variantId;
  final String title;
  final String sku;
  final ListingCondition condition;
  final Handling stock;
  final Handling fulfilment;

  Json toJson() => {
    'variantId': variantId,
    'listingTitle': title.trim(),
    'sellerSku': sku.trim(),
    'condition': condition.wire,
    'stockSource': stock.wire,
    'fulfillmentMode': fulfilment.wire,
  };
}

/// `{data, meta: {page, limit, total}}` — the catalog-style page, used by
/// reviews and ratings as well as the catalog.
class DataPage<T> {
  const DataPage({required this.items, required this.total});

  factory DataPage.fromJson(Json json, T Function(Json) parse) => DataPage(
    items: json.list('data', parse),
    total: json.objOrNull('meta')?.intOrNull('total') ?? 0,
  );

  final List<T> items;
  final int total;
}
