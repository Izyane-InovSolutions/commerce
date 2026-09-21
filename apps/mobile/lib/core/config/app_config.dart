class AppConfig {
  const AppConfig._();

  static const apiBaseUrl = String.fromEnvironment(
    'COMMERCE_API_BASE_URL',
    defaultValue: 'http://localhost:3000/api/v1',
  );
}
