import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AllExceptionsFilter } from './common/http/all-exceptions.filter';
import { RequestIdMiddleware } from './common/http/request-id.middleware';
import { ResponseEnvelopeInterceptor } from './common/http/response-envelope.interceptor';
import { DatabaseModule } from './database/database.module';
import { CacheModule } from './infrastructure/cache/cache.module';
import { validate } from './infrastructure/config/env.validation';
import { JobsModule } from './infrastructure/jobs/jobs.module';
import { LoggingModule } from './infrastructure/logging/logging.module';
import { MetricsInterceptor } from './infrastructure/metrics/metrics.interceptor';
import { MetricsModule } from './infrastructure/metrics/metrics.module';
import { StorageModule } from './infrastructure/storage/storage.module';
import { AuthModule } from './modules/auth/auth.module';
import { CartModule } from './modules/cart/cart.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CheckoutModule } from './modules/checkout/checkout.module';
import { HealthModule } from './modules/health/health.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { MediaModule } from './modules/media/media.module';
import { OffersModule } from './modules/offers/offers.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ProductsModule } from './modules/products/products.module';
import { UsersModule } from './modules/users/users.module';
import { WishlistModule } from './modules/wishlist/wishlist.module';
import { SellersModule } from './modules/sellers/sellers.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
    LoggingModule,
    MetricsModule,
    CacheModule,
    JobsModule,
    StorageModule,
    DatabaseModule,
    HealthModule,
    UsersModule,
    AuthModule,
    MediaModule,
    PaymentsModule,
    CatalogModule,
    ProductsModule,
    OffersModule,
    InventoryModule,
    CartModule,
    WishlistModule,
    OrdersModule,
    CheckoutModule,
    SellersModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
}
