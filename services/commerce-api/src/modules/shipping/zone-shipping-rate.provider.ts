import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';

import type {
  ShippingRate,
  ShippingRateProvider,
  ShippingRateRequest,
} from './shipping-rate.provider';

/**
 * A configurable zone policy, standing in for a real carrier contract until
 * one is selected. Domestic (`SHIPPING_DOMESTIC_COUNTRY`, ZMW's home market)
 * gets the cheaper rate and a free-shipping threshold; everywhere else pays
 * a flat international rate. Amounts are minor units in the checkout
 * currency (ZMW today — see current-price.ts).
 */
@Injectable()
export class ZoneShippingRateProvider implements ShippingRateProvider {
  constructor(private readonly config: ConfigService) {}

  quote(request: ShippingRateRequest): Promise<ShippingRate> {
    // Caught and re-thrown as a rejection so a synchronous validation
    // failure still matches the interface's Promise-returning contract,
    // instead of throwing before the caller ever gets a Promise back.
    try {
      const country = this.validateDestination(request.destinationCountry);
      const domesticCountry = this.config.get<string>(
        'SHIPPING_DOMESTIC_COUNTRY',
        'ZM',
      );
      const isDomestic = country === domesticCountry;

      const rate = isDomestic
        ? this.domesticRate(request.subtotal)
        : this.internationalRate();

      return Promise.resolve({
        ...rate,
        quoteId: randomUUID(),
        expiresAt: new Date(
          Date.now() +
            this.config.get<number>('SHIPPING_QUOTE_TTL_SECONDS', 3600) * 1000,
        ),
      });
    } catch (error) {
      return Promise.reject(error as Error);
    }
  }

  private domesticRate(
    subtotal: number,
  ): Pick<
    ShippingRate,
    'serviceLevel' | 'rateCode' | 'amount' | 'estimatedDeliveryDays'
  > {
    const freeThreshold = this.config.get<number>(
      'SHIPPING_DOMESTIC_FREE_THRESHOLD_MINOR',
      50_000,
    );
    const flatRate = this.config.get<number>(
      'SHIPPING_DOMESTIC_RATE_MINOR',
      3_000,
    );
    const free = subtotal >= freeThreshold;

    return {
      serviceLevel: 'STANDARD',
      rateCode: free ? 'DOMESTIC_STANDARD_FREE_V1' : 'DOMESTIC_STANDARD_V1',
      amount: free ? 0 : flatRate,
      estimatedDeliveryDays: { min: 2, max: 5 },
    };
  }

  private internationalRate(): Pick<
    ShippingRate,
    'serviceLevel' | 'rateCode' | 'amount' | 'estimatedDeliveryDays'
  > {
    return {
      serviceLevel: 'STANDARD',
      rateCode: 'INTERNATIONAL_STANDARD_V1',
      amount: this.config.get<number>(
        'SHIPPING_INTERNATIONAL_RATE_MINOR',
        15_000,
      ),
      estimatedDeliveryDays: { min: 7, max: 14 },
    };
  }

  /** Throws the way a carrier's own address validation would: destination rejected, nothing quoted. */
  private validateDestination(destinationCountry: string): string {
    const country = destinationCountry.toUpperCase();

    if (!/^[A-Z]{2}$/.test(country))
      throw new BadRequestException(
        'destinationCountry must be a 2-letter ISO country code',
      );

    const unsupported = this.config
      .get<string>('SHIPPING_UNSUPPORTED_COUNTRIES', '')
      .split(',')
      .map((code) => code.trim().toUpperCase())
      .filter(Boolean);

    if (unsupported.includes(country))
      throw new BadRequestException(
        `Shipping is not currently available to ${country}`,
      );

    return country;
  }
}
