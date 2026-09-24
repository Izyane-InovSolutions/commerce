import '../core/network/json.dart';

class Address {
  const Address({
    required this.id,
    required this.recipientName,
    required this.line1,
    required this.city,
    required this.postalCode,
    required this.country,
    required this.isDefault,
    this.label,
    this.phone,
    this.line2,
    this.region,
  });

  factory Address.fromJson(Json json) => Address(
    id: json.str('id'),
    label: json.strOrNull('label'),
    recipientName: json.str('recipientName'),
    phone: json.strOrNull('phone'),
    line1: json.str('line1'),
    line2: json.strOrNull('line2'),
    city: json.str('city'),
    region: json.strOrNull('region'),
    postalCode: json.str('postalCode'),
    country: json.str('country'),
    isDefault: json.boolean('isDefault'),
  );

  final String id;
  final String? label;
  final String recipientName;
  final String? phone;
  final String line1;
  final String? line2;
  final String city;
  final String? region;
  final String postalCode;
  final String country;
  final bool isDefault;

  List<String> get lines => formatAddressLines(
    line1: line1,
    line2: line2,
    city: city,
    region: region,
    postalCode: postalCode,
    country: country,
  );
}

/// The editable fields of an address, for create and update.
class AddressDraft {
  const AddressDraft({
    required this.recipientName,
    required this.line1,
    required this.city,
    required this.postalCode,
    required this.country,
    this.label,
    this.phone,
    this.line2,
    this.region,
  });

  factory AddressDraft.from(Address address) => AddressDraft(
    label: address.label,
    recipientName: address.recipientName,
    phone: address.phone,
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    region: address.region,
    postalCode: address.postalCode,
    country: address.country,
  );

  final String? label;
  final String recipientName;
  final String? phone;
  final String line1;
  final String? line2;
  final String city;
  final String? region;
  final String postalCode;
  final String country;

  /// Blank optional fields are left out rather than sent as empty strings,
  /// which the API would store as-is.
  Json toJson() {
    String? clean(String? value) =>
        (value == null || value.trim().isEmpty) ? null : value.trim();
    return {
      if (clean(label) != null) 'label': clean(label),
      'recipientName': recipientName.trim(),
      if (clean(phone) != null) 'phone': clean(phone),
      'line1': line1.trim(),
      if (clean(line2) != null) 'line2': clean(line2),
      'city': city.trim(),
      if (clean(region) != null) 'region': clean(region),
      'postalCode': postalCode.trim(),
      'country': country.trim().toUpperCase(),
    };
  }
}

List<String> formatAddressLines({
  required String line1,
  String? line2,
  required String city,
  String? region,
  required String postalCode,
  required String country,
}) {
  final locality = [
    city,
    region,
    postalCode,
  ].whereType<String>().where((part) => part.trim().isNotEmpty).join(', ');
  return [
    line1,
    if (line2 != null && line2.trim().isNotEmpty) line2,
    locality,
    country,
  ];
}
