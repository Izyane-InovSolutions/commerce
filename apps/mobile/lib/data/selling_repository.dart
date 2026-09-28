import '../core/network/api_client.dart';
import '../core/network/api_exception.dart';
import '../core/network/guarded.dart';
import '../core/network/json.dart';
import '../core/util/uuid.dart';
import '../domain/seller_catalog.dart';
import '../domain/seller_feedback.dart';
import '../domain/seller_money.dart';
import '../domain/selling.dart';

/// The seller side of the API: `/sellers/me/*`.
///
/// Every action that changes an order carries a fresh idempotency key and
/// the `version` of the fulfilment as it was shown, and the screen reloads
/// the order after each one — so a double tap or a stale screen gets the
/// API's "changed, reload" (409) instead of acting twice.
class SellingRepository {
  SellingRepository(this._api);

  final ApiClient _api;

  /// Titles for order lines, which only name an offer id.
  final Map<String, Future<String?>> _titles = {};

  void clearCache() => _titles.clear();

  Future<SellerStanding> standing() async {
    try {
      final data = await _api.get('/sellers/me');
      final account = parseResponse(() => SellerAccount.fromJson(asJson(data)));
      return HasSellerAccount(account);
    } on ApiException catch (error) {
      if (error.isNotFound) return const NotASeller();
      rethrow;
    }
  }

  Future<SellerAccount> apply(SellerApplication application) async {
    final data = await _api.post(
      '/sellers/applications',
      body: application.toJson(),
    );
    return parseResponse(() => SellerAccount.fromJson(asJson(data)));
  }

  /// Only after a rejection: replaces every detail and document, and puts
  /// the application back in the review queue.
  Future<SellerAccount> resubmit(SellerApplication application) async {
    final data = await _api.post(
      '/sellers/me/resubmit',
      body: application.toJson(),
    );
    return parseResponse(() => SellerAccount.fromJson(asJson(data)));
  }

  Future<SellerBalance> balance() async {
    final data = await _api.get('/sellers/me/balance');
    return parseResponse(() => SellerBalance.fromJson(asJson(data)));
  }

  Future<SellerPage<LedgerEntry>> ledger({int page = 1, int limit = 30}) async {
    final data = await _api.get(
      '/sellers/me/ledger',
      query: {'page': page, 'limit': limit},
    );
    return parseResponse(
      () => SellerPage.fromJson(asJson(data), LedgerEntry.fromJson),
    );
  }

  // ---- orders

  Future<SellerPage<SellerOrderSummary>> orders({
    int page = 1,
    int limit = 30,
  }) async {
    final data = await _api.get(
      '/sellers/me/orders',
      query: {'page': page, 'limit': limit},
    );
    return parseResponse(
      () => SellerPage.fromJson(asJson(data), SellerOrderSummary.fromJson),
    );
  }

  Future<SellerOrder> order(String id) async {
    final data = await _api.get(
      '/sellers/me/orders/${Uri.encodeComponent(id)}',
    );
    return parseResponse(() => SellerOrder.fromJson(asJson(data)));
  }

  /// A listing's title, or null if it cannot be read — a line still shows,
  /// just without its name.
  Future<String?> listingTitle(String offerId) =>
      _titles.putIfAbsent(offerId, () async {
        try {
          final data = await _api.get(
            '/sellers/me/offers/${Uri.encodeComponent(offerId)}',
          );
          return asJson(data).strOrNull('listingTitle');
        } catch (_) {
          _titles.remove(offerId);
          return null;
        }
      });

  Future<Map<String, String>> listingTitles(Iterable<String> offerIds) async {
    final ids = offerIds.toSet().toList();
    final titles = await Future.wait(ids.map(listingTitle));
    return {
      for (var i = 0; i < ids.length; i++)
        if (titles[i] != null) ids[i]: titles[i]!,
    };
  }

  String _fulfillment(String id, String action) =>
      '/sellers/me/fulfillments/${Uri.encodeComponent(id)}/$action';

  Map<String, String> get _once => {'Idempotency-Key': uuidV4()};

  Future<void> accept(Fulfillment f) async {
    await _api.post(
      _fulfillment(f.id!, 'accept'),
      body: {'version': f.version},
    );
  }

  /// Turns the order down; the customer is refunded for it.
  Future<void> decline(Fulfillment f, String reason) async {
    await _api.post(
      _fulfillment(f.id!, 'reject'),
      headers: _once,
      body: {'version': f.version, 'reason': reason},
    );
  }

  /// Marks everything still to pack as packed.
  Future<void> packAll(Fulfillment f) async {
    await _api.post(
      _fulfillment(f.id!, 'packs'),
      headers: _once,
      body: {
        'lines': [
          for (final line in f.lines)
            if (line.packable > 0)
              {'fulfillmentLineId': line.id, 'quantity': line.packable},
        ],
      },
    );
  }

  /// Sends everything packed and not yet sent, as one shipment.
  Future<void> dispatchAll(
    Fulfillment f, {
    required String carrier,
    String? trackingReference,
  }) async {
    await _api.post(
      _fulfillment(f.id!, 'dispatches'),
      headers: _once,
      body: {
        'lines': [
          for (final line in f.lines)
            if (line.dispatchable > 0)
              {'fulfillmentLineId': line.id, 'quantity': line.dispatchable},
        ],
        'carrierCode': carrier,
        if (trackingReference != null && trackingReference.isNotEmpty)
          'trackingReference': trackingReference,
      },
    );
  }

  /// Cancels whatever has not been put in a shipment; the customer is
  /// refunded for it.
  Future<void> cancelRemaining(Fulfillment f, String reason) async {
    await _api.post(
      _fulfillment(f.id!, 'cancellations'),
      headers: _once,
      body: {
        'lines': [
          for (final line in f.lines)
            if (line.cancellable > 0)
              {'fulfillmentLineId': line.id, 'quantity': line.cancellable},
        ],
        'reason': reason,
      },
    );
  }

  // ---- listings

  Future<SellerPage<Listing>> listings({int page = 1, int limit = 50}) async {
    final data = await _api.get(
      '/sellers/me/offers',
      query: {'page': page, 'limit': limit},
    );
    return parseResponse(
      () => SellerPage.fromJson(asJson(data), Listing.fromJson),
    );
  }

  Future<void> setPrice(Listing listing, int amount, String currency) async {
    await _api.post(
      '/sellers/me/offers/${Uri.encodeComponent(listing.id)}/prices',
      body: {
        'version': listing.version,
        'amount': amount,
        'currency': currency,
      },
    );
  }

  Future<void> setListed(Listing listing, {required bool live}) async {
    await _api.patch(
      '/sellers/me/offers/${Uri.encodeComponent(listing.id)}/status',
      body: {
        'version': listing.version,
        'status': live ? 'PUBLISHED' : 'DRAFT',
      },
    );
  }

  // ---- stock

  Future<List<StockLevel>> stock() async {
    final data = await _api.get('/sellers/me/inventory');
    return parseResponse(() => listOf(data, StockLevel.fromJson, 'inventory'));
  }

  Future<StockLevel> setStock(StockLevel level, int onHand) async {
    final data = await _api.put(
      '/sellers/me/inventory/${Uri.encodeComponent(level.offerId)}',
      body: {'quantity': onHand, 'version': level.version},
    );
    return parseResponse(() => StockLevel.fromJson(asJson(data)));
  }

  Future<List<StockMovement>> stockHistory(String offerId) async {
    final data = await _api.get(
      '/sellers/me/inventory/${Uri.encodeComponent(offerId)}/movements',
    );
    return parseResponse(
      () => listOf(data, StockMovement.fromJson, 'movements'),
    );
  }

  // ---- listings: create, edit, archive

  /// A listing starts hidden with no price; the price follows at once, as
  /// the API needs one before it can go on sale.
  Future<void> createListing(
    ListingDraft draft, {
    required int price,
    String currency = 'ZMW',
  }) async {
    final data = await _api.post('/sellers/me/offers', body: draft.toJson());
    final created = parseResponse(() => Listing.fromJson(asJson(data)));
    await setPrice(created, price, currency);
  }

  /// Details can only change while the listing is hidden.
  Future<void> editListing(Listing listing, ListingDraft draft) async {
    await _api.patch(
      '/sellers/me/offers/${Uri.encodeComponent(listing.id)}',
      body: {...draft.toJson(), 'version': listing.version},
    );
  }

  /// Archived listings leave the shop for good and cannot be changed.
  Future<void> archiveListing(Listing listing) async {
    await _api.patch(
      '/sellers/me/offers/${Uri.encodeComponent(listing.id)}/status',
      body: {'version': listing.version, 'status': 'ARCHIVED'},
    );
  }

  Future<List<CatalogProduct>> searchCatalog(String query) async {
    final data = await _api.get(
      '/catalog/products',
      authenticated: false,
      query: {'q': query.trim(), 'limit': 20, 'currency': 'ZMW'},
    );
    return parseResponse(
      () => DataPage.fromJson(asJson(data), CatalogProduct.fromJson).items,
    );
  }

  // ---- product submissions

  Future<List<ProductSubmission>> submissions() async {
    final data = await _api.get('/sellers/me/products');
    return parseResponse(
      () => listOf(data, ProductSubmission.fromJson, 'products'),
    );
  }

  Future<ProductSubmission> submission(String id) async {
    final data = await _api.get(
      '/sellers/me/products/${Uri.encodeComponent(id)}',
    );
    return parseResponse(() => ProductSubmission.fromJson(asJson(data)));
  }

  Future<List<NamedRef>> categories() async {
    final data = await _api.get('/catalog/categories', authenticated: false);
    return parseResponse(() => listOf(data, NamedRef.fromJson, 'categories'));
  }

  Future<List<NamedRef>> brands() async {
    final data = await _api.get('/catalog/brands', authenticated: false);
    return parseResponse(() => listOf(data, NamedRef.fromJson, 'brands'));
  }

  /// Sends a new product for review: the product, its one variant, then
  /// its photos in order, the first as the main one — the web portal's
  /// sequence. Returns the new submission's id.
  Future<String> submitProduct(
    ProductDraft draft, {
    required List<String> photoIds,
  }) async {
    final data = await _api.post('/sellers/me/products', body: draft.toJson());
    final id = parseResponse(() => asJson(data).str('id'));
    final product = '/sellers/me/products/${Uri.encodeComponent(id)}';
    await _api.post(
      '$product/variants',
      body: {
        'skuCode': draft.sku.trim(),
        if (draft.variantName?.trim().isNotEmpty ?? false)
          'name': draft.variantName!.trim(),
      },
    );
    for (final (i, photo) in photoIds.indexed) {
      await _api.post(
        '$product/media',
        body: {'mediaAssetId': photo, 'position': i, 'isPrimary': i == 0},
      );
    }
    return id;
  }

  // ---- shipments

  Future<void> addTracking(
    String shipmentId, {
    required String status,
    String? location,
    String? description,
  }) async {
    await _api.post(
      '/sellers/me/shipments/${Uri.encodeComponent(shipmentId)}/tracking-events',
      headers: _once,
      body: {
        'normalizedStatus': status,
        'occurredAt': DateTime.now().toUtc().toIso8601String(),
        if (location != null && location.isNotEmpty) 'location': location,
        if (description != null && description.isNotEmpty)
          'description': description,
      },
    );
  }

  // ---- returns, reviews, ratings

  Future<SellerPage<SellerReturn>> returns({int page = 1}) async {
    final data = await _api.get(
      '/sellers/me/returns',
      query: {'page': page, 'limit': 50},
    );
    return parseResponse(
      () => SellerPage.fromJson(asJson(data), SellerReturn.fromJson),
    );
  }

  Future<DataPage<SellerFeedback>> reviews() async {
    final data = await _api.get('/sellers/me/reviews', query: {'limit': 50});
    return parseResponse(
      () => DataPage.fromJson(asJson(data), SellerFeedback.fromJson),
    );
  }

  Future<DataPage<SellerFeedback>> ratings() async {
    final data = await _api.get('/sellers/me/ratings', query: {'limit': 50});
    return parseResponse(
      () => DataPage.fromJson(asJson(data), SellerFeedback.fromJson),
    );
  }

  // ---- storefront

  Future<void> saveStorefront(
    SellerAccount account, {
    required String slug,
    required String displayName,
    required String description,
  }) async {
    await _api.put(
      '/sellers/me/storefront',
      body: {
        'version': account.version,
        'storefrontSlug': slug,
        'displayName': displayName.trim(),
        'description': description.trim(),
      },
    );
  }

  // ---- payouts

  Future<List<PayoutAccount>> payoutAccounts() async {
    final data = await _api.get('/sellers/me/payout-accounts');
    return parseResponse(
      () => listOf(data, PayoutAccount.fromJson, 'payout accounts'),
    );
  }

  Future<void> addPayoutAccount(PayoutAccountDraft draft) async {
    await _api.post('/sellers/me/payout-accounts', body: draft.toJson());
  }

  /// Any change sends the account back to be checked again.
  Future<void> editPayoutAccount(
    PayoutAccount account,
    PayoutAccountDraft draft,
  ) async {
    await _api.patch(
      '/sellers/me/payout-accounts/${Uri.encodeComponent(account.id)}',
      body: {...draft.toJson(), 'version': account.version},
    );
  }

  Future<void> removePayoutAccount(PayoutAccount account) async {
    await _api.post(
      '/sellers/me/payout-accounts/${Uri.encodeComponent(account.id)}/disable',
      body: {'version': account.version},
    );
  }

  Future<SellerPage<PayoutRequest>> payoutRequests() async {
    final data = await _api.get(
      '/sellers/me/payout-requests',
      query: {'limit': 50},
    );
    return parseResponse(
      () => SellerPage.fromJson(asJson(data), PayoutRequest.fromJson),
    );
  }

  /// [idempotencyKey] is held by the screen for one attempt, so a retry
  /// after a lost reply cannot ask for the same money twice.
  Future<void> requestPayout({
    required PayoutAccount account,
    required int amount,
    required String idempotencyKey,
  }) async {
    await _api.post(
      '/sellers/me/payout-requests',
      headers: {'Idempotency-Key': idempotencyKey},
      body: {'payoutAccountId': account.id, 'amount': amount},
    );
  }

  Future<void> cancelPayout(PayoutRequest request, String reason) async {
    await _api.post(
      '/sellers/me/payout-requests/${Uri.encodeComponent(request.id)}/cancel',
      headers: _once,
      body: {'reason': reason, 'version': request.version},
    );
  }
}
