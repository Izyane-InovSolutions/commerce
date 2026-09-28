import '../app/brand.dart';
import '../core/network/json.dart';
import 'money.dart';

class Category {
  const Category({
    required this.id,
    required this.name,
    required this.slug,
    this.description,
    this.parentId,
  });

  factory Category.fromJson(Json json) => Category(
    id: json.str('id'),
    name: json.str('name'),
    slug: json.str('slug'),
    description: json.strOrNull('description'),
    parentId: json.strOrNull('parentId'),
  );

  final String id;
  final String name;
  final String slug;
  final String? description;
  final String? parentId;
}

class Brand {
  const Brand({required this.id, required this.name, required this.slug});

  factory Brand.fromJson(Json json) =>
      Brand(id: json.str('id'), name: json.str('name'), slug: json.str('slug'));

  final String id;
  final String name;
  final String slug;
}

class SellerSummary {
  const SellerSummary({required this.id, this.displayName, this.slug});

  factory SellerSummary.fromJson(Json json) => SellerSummary(
    id: json.str('id'),
    displayName: json.strOrNull('displayName'),
    slug: json.strOrNull('storefrontSlug') ?? json.strOrNull('slug'),
  );

  final String id;
  final String? displayName;
  final String? slug;
}

/// A seller's public shop page: who they are and how customers rate them.
class Storefront {
  const Storefront({
    required this.id,
    required this.slug,
    required this.name,
    this.description,
    this.averageRating,
    this.ratingCount = 0,
  });

  factory Storefront.fromJson(Json json) => Storefront(
    id: json.str('id'),
    slug: json.str('storefrontSlug'),
    name: json.strOrNull('displayName') ?? 'Seller',
    description: json.strOrNull('description'),
    averageRating: json.doubleOrNull('averageRating'),
    ratingCount: json.intOrNull('ratingCount') ?? 0,
  );

  final String id;
  final String slug;
  final String name;
  final String? description;
  final double? averageRating;
  final int ratingCount;
}

class StorefrontRating {
  const StorefrontRating({
    required this.rating,
    required this.reviewer,
    required this.createdAt,
    this.comment,
  });

  factory StorefrontRating.fromJson(Json json) => StorefrontRating(
    rating: json.intOrNull('rating') ?? 0,
    reviewer: json.strOrNull('reviewerLabel') ?? 'A customer',
    createdAt: json.dateOrNull('createdAt') ?? DateTime.now(),
    comment: json.strOrNull('comment'),
  );

  final int rating;
  final String reviewer;
  final DateTime createdAt;
  final String? comment;
}

enum OfferCondition { newItem, used, refurbished }

OfferCondition _condition(String? value) => switch (value) {
  'USED' => OfferCondition.used,
  'REFURBISHED' => OfferCondition.refurbished,
  _ => OfferCondition.newItem,
};

extension OfferConditionLabel on OfferCondition {
  String get label => switch (this) {
    OfferCondition.newItem => 'New',
    OfferCondition.used => 'Used',
    OfferCondition.refurbished => 'Refurbished',
  };
}

/// One seller's listing of a variant, as embedded in a product.
class Offer {
  const Offer({
    required this.id,
    required this.inStock,
    required this.isFirstParty,
    this.seller,
    this.price,
    this.shippingCost,
  });

  factory Offer.fromJson(Json json) => Offer(
    id: json.str('id'),
    // Missing means "not told otherwise"; the server re-checks stock at
    // checkout regardless.
    inStock: json.boolean('inStock', fallback: true),
    isFirstParty: json.boolean('isFirstParty'),
    seller: json.objOrNull('seller') == null
        ? null
        : SellerSummary.fromJson(json.obj('seller')),
    price: Money.maybe(json.objOrNull('currentPrice')),
    shippingCost: Money.maybe(json.objOrNull('shippingCost')),
  );

  final String id;
  final bool inStock;
  final bool isFirstParty;
  final SellerSummary? seller;

  /// Null when the offer has no price in the browsing currency — which is
  /// "not sold in this currency", never "free".
  final Money? price;
  final Money? shippingCost;

  bool get isPurchasable => price != null && inStock;

  String get sellerName => isFirstParty
      ? 'Sold by ${AppBrand.name}'
      : 'Sold by ${seller?.displayName ?? 'a marketplace seller'}';
}

class Variant {
  const Variant({
    required this.id,
    required this.skuCode,
    required this.offers,
    this.name,
  });

  factory Variant.fromJson(Json json) => Variant(
    id: json.str('id'),
    skuCode: json.strOrNull('skuCode') ?? '',
    name: json.strOrNull('name'),
    offers: json.list('offers', Offer.fromJson),
  );

  final String id;
  final String skuCode;
  final String? name;
  final List<Offer> offers;

  String get label =>
      (name != null && name!.trim().isNotEmpty) ? name! : skuCode;

  /// Cheapest purchasable offer, else the first priced one, else none.
  Offer? get bestOffer {
    final priced = offers.where((offer) => offer.price != null).toList()
      ..sort((a, b) {
        if (a.isPurchasable != b.isPurchasable) {
          return a.isPurchasable ? -1 : 1;
        }
        return a.price!.amount.compareTo(b.price!.amount);
      });
    return priced.isEmpty ? null : priced.first;
  }
}

class ProductImage {
  const ProductImage({
    required this.id,
    required this.url,
    required this.position,
    required this.isPrimary,
  });

  factory ProductImage.fromJson(Json json) => ProductImage(
    id: json.str('id'),
    url: json.str('url'),
    position: json.intOrNull('position') ?? 0,
    isPrimary: json.boolean('isPrimary'),
  );

  /// Origin-relative and signed (`/api/v1/media/...?signature=`). Resolve
  /// against the API origin before loading — see `ApiImage`.
  final String url;
  final String id;
  final int position;
  final bool isPrimary;
}

class Product {
  const Product({
    required this.id,
    required this.name,
    required this.slug,
    required this.images,
    required this.variants,
    this.description,
    this.category,
    this.averageRating,
    this.ratingCount = 0,
    this.isReturnable = false,
    this.returnWindowDays,
  });

  factory Product.fromJson(Json json) {
    final images = json.list('media', ProductImage.fromJson)
      ..sort((a, b) => a.position.compareTo(b.position));
    return Product(
      id: json.str('id'),
      name: json.str('name'),
      slug: json.str('slug'),
      description: json.strOrNull('description'),
      category: json.objOrNull('category') == null
          ? null
          : Category.fromJson(json.obj('category')),
      images: [
        // Primary first; the rest keep their position order.
        ...images.where((image) => image.isPrimary),
        ...images.where((image) => !image.isPrimary),
      ],
      variants: json.list('variants', Variant.fromJson),
      averageRating: json.doubleOrNull('averageRating'),
      ratingCount: json.intOrNull('ratingCount') ?? 0,
      isReturnable: json.boolean('isReturnable'),
      returnWindowDays: json.intOrNull('returnWindowDays'),
    );
  }

  final String id;
  final String name;
  final String slug;
  final String? description;
  final Category? category;
  final List<ProductImage> images;
  final List<Variant> variants;
  final double? averageRating;
  final int ratingCount;
  final bool isReturnable;
  final int? returnWindowDays;

  ProductImage? get primaryImage => images.isEmpty ? null : images.first;

  /// The offer a listing card advertises: the best one across variants.
  Offer? get headlineOffer {
    for (final variant in variants) {
      final offer = variant.bestOffer;
      if (offer != null) return offer;
    }
    return null;
  }
}

class ProductPage {
  const ProductPage({
    required this.products,
    required this.page,
    required this.limit,
    required this.total,
  });

  /// The list route nests its own pagination inside the envelope's `data`.
  factory ProductPage.fromJson(Json json) {
    final meta = json.obj('meta');
    return ProductPage(
      products: json.list('data', Product.fromJson),
      page: meta.intOrNull('page') ?? 1,
      limit: meta.intOrNull('limit') ?? 20,
      total: meta.intOrNull('total') ?? 0,
    );
  }

  final List<Product> products;
  final int page;
  final int limit;
  final int total;

  bool get hasMore => page * limit < total;
}

/// An offer looked up on its own — how cart, wishlist and order lines get a
/// product name and image, since those lines carry only an offer id.
class OfferDetail {
  const OfferDetail({
    required this.id,
    required this.productName,
    required this.productSlug,
    required this.condition,
    required this.checkoutSupported,
    this.listingTitle,
    this.imageUrl,
    this.seller,
    this.isFirstParty = false,
    this.price,
  });

  factory OfferDetail.fromJson(Json json) {
    final product = json.obj('product');
    return OfferDetail(
      id: json.str('id'),
      listingTitle: json.strOrNull('listingTitle'),
      productName: product.str('name'),
      productSlug: product.str('slug'),
      imageUrl: product.objOrNull('image')?.strOrNull('url'),
      seller: json.objOrNull('seller') == null
          ? null
          : SellerSummary.fromJson(json.obj('seller')),
      isFirstParty: json.boolean('isFirstParty'),
      condition: _condition(json.strOrNull('condition')),
      price: Money.maybe(json.objOrNull('currentPrice')),
      checkoutSupported: json.boolean('checkoutSupported', fallback: true),
    );
  }

  final String id;
  final String? listingTitle;
  final String productName;
  final String productSlug;
  final String? imageUrl;
  final SellerSummary? seller;
  final bool isFirstParty;
  final OfferCondition condition;
  final Money? price;
  final bool checkoutSupported;

  String get title => (listingTitle != null && listingTitle!.trim().isNotEmpty)
      ? listingTitle!
      : productName;
}
