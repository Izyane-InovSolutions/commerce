# Commerce Mobile App

Customer-facing mobile application for the Commerce platform.

## Targets

- Android
- iOS

## Architecture

Kotlin Multiplatform + Compose Multiplatform is used to share application and UI code while retaining access to native platform APIs where required.

The app is a client of the NestJS Commerce API under:

```text
/api/v1
```

Business rules remain on the backend.

See [docs/mobile-architecture.md](../../docs/mobile-architecture.md) for the full architecture and delivery plan.

## Planned structure

```text
apps/mobile/
├── androidApp/
├── iosApp/
└── shared/
    └── src/
        ├── commonMain/
        ├── androidMain/
        └── iosMain/
```

## Local setup

The initial project should be created with the Kotlin Multiplatform project wizard using Android and iOS targets.

For iOS development, use the macOS/Xcode toolchain. Android can be run from Android Studio.

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
