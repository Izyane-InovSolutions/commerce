import { validateSync } from 'class-validator';
import { ChangePasswordDto } from './change-password.dto';
import { ConfirmPasswordResetDto } from './confirm-password-reset.dto';

describe('Password DTO validation', () => {
  it.each([123, {}, [], true])(
    'rejects a non-string credential %p',
    (value) => {
      expect(
        validateSync(
          Object.assign(new ChangePasswordDto(), {
            currentPassword: value,
            newPassword: 'password123',
          }),
        ).length,
      ).toBeGreaterThan(0);
      expect(
        validateSync(
          Object.assign(new ConfirmPasswordResetDto(), {
            token: value,
            newPassword: 'password123',
          }),
        ).length,
      ).toBeGreaterThan(0);
    },
  );
});
