# Mobile App Architecture

## Direction

The mobile app is a first-class client of the Commerce API and shares the same business rules as the web storefront.

Targets:
- Android
- iOS

Stack:
- Kotlin Multiplatform
- Compose Multiplatform for shared UI
- Ktor Client for HTTP
- kotlinx.serialization for API JSON
- Kotlin Coroutines/Flow for asynchronous state
- Platform-native secure storage through `expect/actual`
- Gradle Version Catalog for dependency management

The mobile client must never duplicate transactional business logic. Pricing, stock validation, checkout totals, payment confirmation, order state transitions and marketplace rules remain authoritative in `services/commerce-api`.

## Repository location

```text
apps/
└── mobile/
    ├── androidApp/
    ├── iosApp/
    └── shared/
        └── src/
            ├── commonMain/
            │   ├── core/
            │   ├── network/
            │   ├── auth/
            │   ├── account/
            │   ├── catalog/
            │   ├── cart/
            │   ├── checkout/
            │   ├── orders/
            │   ├── wishlist/
            │   └── notifications/
            ├── androidMain/
            └── iosMain/
```

## Layering

```text
Compose UI
   ↓
Presentation / ViewModel
   ↓
Application use cases
   ↓
Repositories
   ↓
Ktor API client / secure storage / platform services
   ↓
Commerce API (/api/v1)
```

UI components must not call Ktor directly. ViewModels consume application-facing state and actions. Repositories own API access and local/session persistence concerns.

## API client

The mobile client consumes the same versioned API as web:

```text
https://<commerce-api>/api/v1
```

The client should have:
- typed request/response DTOs
- centralized authentication headers
- access-token refresh handling
- consistent API error decoding
- request correlation support
- retry only for safe/idempotent requests
- timeout configuration
- environment-based API base URL

The client must treat server responses as untrusted input and validate state before presenting transactional actions.

## Authentication

Use the existing Commerce API identity/session model.

Required mobile flows:
- register
- login
- refresh session
- logout
- password reset
- restore session on app launch

Access tokens stay in memory where possible. Refresh/session credentials use platform secure storage.

Android and iOS platform implementations are exposed through an interface such as:

```kotlin
interface SecureTokenStore {
    suspend fun readRefreshToken(): String?
    suspend fun saveRefreshToken(token: String)
    suspend fun clear()
}
```

Platform implementations should use Android Keystore-backed storage and iOS Keychain rather than plain preferences/files.

## Navigation

Use a single application navigation model with authenticated and public route groups:

```text
Public
├── Home
├── Categories
├── Search
└── Product

Authenticated
├── Home
├── Search
├── Cart
├── Orders
├── Wishlist
└── Account

Checkout
├── Address
├── Shipping
├── Review
└── Payment

Seller/marketplace management is not part of the customer mobile app foundation.
```

## Initial implementation order

### Mobile foundation
- Create KMP Android + iOS project
- Add Compose Multiplatform
- Add shared networking module
- Add serialization
- Add secure-storage abstraction
- Add environment configuration
- Add navigation shell
- Add theme/design system

### Customer account
- session restoration
- login/register
- logout
- profile
- address book

### Storefront
- home
- category browsing
- search
- filters
- product detail
- variants
- offer selection
- wishlist

### Commerce
- cart
- checkout
- shipping selection
- payment initiation
- payment status recovery
- order confirmation
- order history
- order detail/tracking

### Platform services
- push token registration
- notification handling
- deep links
- crash/error reporting
- analytics hooks

## Payment rule

The app may initiate a payment and display gateway UI, but it must never decide that an order is paid.

The authoritative sequence remains:

```text
Mobile
  ↓
Commerce API
  ↓
Payment Provider
  ↓
Gateway callback/webhook
  ↓
Commerce API verifies payment
  ↓
Order becomes confirmed
  ↓
Mobile refreshes order/payment state
```

App restarts/backgrounding must be recoverable by querying the backend.

## Shared contracts

Where practical, keep API contract types explicit and versioned. The mobile app should not import NestJS implementation code, Prisma types or backend DTO classes.

The dependency direction is:

```text
mobile → HTTP contract → Commerce API
```

not:

```text
mobile → backend source code
```

## Definition of done for the foundation

The mobile foundation is ready when:
- Android builds and runs
- iOS builds and runs
- both targets consume `/api/v1`
- authentication/session restoration works
- API errors are decoded consistently
- secure token storage is platform-backed
- navigation and theme foundations exist
- the project can add feature modules without putting business logic into UI code
