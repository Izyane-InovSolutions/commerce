import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SellerReviewFilterDto } from '../sellers/dto/seller-review-filter.dto';
import { ListAdminReviewsDto } from './admin/dto/list-admin-reviews.dto';

describe('review report filters', () => {
  it.each(['true', 'false'])(
    'preserves the actual boolean value of %s',
    (value) => {
      const admin = plainToInstance(ListAdminReviewsDto, {
        hasOpenReport: value,
      });
      const seller = plainToInstance(SellerReviewFilterDto, {
        reported: value,
      });
      expect(admin.hasOpenReport).toBe(value === 'true');
      expect(seller.reported).toBe(value === 'true');
      expect(validateSync(admin)).toEqual([]);
      expect(validateSync(seller)).toEqual([]);
    },
  );
  it.each(['yes', '0', '', ['false', 'true']])(
    'rejects ambiguous query input %j',
    (value) => {
      expect(
        validateSync(
          plainToInstance(ListAdminReviewsDto, { hasOpenReport: value }),
        ),
      ).not.toHaveLength(0);
      expect(
        validateSync(
          plainToInstance(SellerReviewFilterDto, { reported: value }),
        ),
      ).not.toHaveLength(0);
    },
  );
  it('keeps an omitted filter undefined', () => {
    expect(
      plainToInstance(ListAdminReviewsDto, {}).hasOpenReport,
    ).toBeUndefined();
    expect(plainToInstance(SellerReviewFilterDto, {}).reported).toBeUndefined();
  });
});
