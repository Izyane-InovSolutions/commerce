import '../core/network/json.dart';

enum UserRole { customer, seller, staff, admin, unknown }

UserRole _role(String? value) => switch (value) {
      'CUSTOMER' => UserRole.customer,
      'SELLER' => UserRole.seller,
      'STAFF' => UserRole.staff,
      'ADMIN' => UserRole.admin,
      _ => UserRole.unknown,
    };

class AuthUser {
  const AuthUser({required this.id, required this.email, required this.role});

  factory AuthUser.fromJson(Json json) => AuthUser(
        id: json.str('id'),
        email: json.str('email'),
        role: _role(json.strOrNull('role')),
      );

  final String id;
  final String email;
  final UserRole role;
}

/// What login, register and refresh all return.
class AuthSession {
  const AuthSession({
    required this.accessToken,
    required this.refreshToken,
    required this.expiresIn,
    required this.user,
  });

  factory AuthSession.fromJson(Json json) => AuthSession(
        accessToken: json.str('accessToken'),
        refreshToken: json.str('refreshToken'),
        expiresIn: json.intOrNull('expiresIn') ?? 900,
        user: AuthUser.fromJson(json.obj('user')),
      );

  final String accessToken;
  final String refreshToken;
  final int expiresIn;
  final AuthUser user;
}

class Profile {
  const Profile({
    required this.email,
    this.firstName,
    this.lastName,
    this.phone,
  });

  factory Profile.fromJson(Json json) => Profile(
        email: json.str('email'),
        firstName: json.strOrNull('firstName'),
        lastName: json.strOrNull('lastName'),
        phone: json.strOrNull('phone'),
      );

  final String email;
  final String? firstName;
  final String? lastName;
  final String? phone;

  String get displayName {
    final name = [firstName, lastName]
        .whereType<String>()
        .where((part) => part.trim().isNotEmpty)
        .join(' ');
    return name.isEmpty ? email : name;
  }
}
