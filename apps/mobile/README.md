# Commerce Mobile App

Customer-facing mobile application for the Commerce platform.

## Targets

- Android
- iOS

## Technology

Flutter + Dart.

The mobile app is a single Flutter codebase targeting Android and iOS, with platform-specific integrations added only where required.

The app is a client of the NestJS Commerce API under:

```text
/api/v1
```

Business rules remain on the backend.

See [docs/mobile-architecture.md](../../docs/mobile-architecture.md) for the full architecture and delivery plan.

## Planned structure

```text
apps/mobile/
├── android/
├── ios/
├── lib/
│   ├── core/
│   ├── features/
│   ├── data/
│   ├── domain/
│   └── presentation/
├── test/
└── pubspec.yaml
```

Feature modules should keep UI, state, domain models, repositories, and API access separated. The exact structure can evolve as implementation starts.

## Local setup

Install the Flutter SDK and configure Android Studio and/or Xcode for the target platforms.

From `apps/mobile/`:

```bash
flutter pub get
flutter run
```

For iOS development, use the macOS/Xcode toolchain. Android can be run from Android Studio or a connected device.

## API configuration

Development environments should point at the Commerce API base URL:

```text
/api/v1
```

Do not hard-code production credentials or secrets into the mobile project.

## Rules

- UI does not call the HTTP client directly.
- API and persistence access go through repositories.
- Payment confirmation is always backend-controlled.
- Tokens and session credentials use secure platform storage.
- Mobile must not duplicate server-side pricing, inventory, order or marketplace rules.
- Use platform-native capabilities through Flutter plugins or platform channels only when necessary.
