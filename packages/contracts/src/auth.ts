import { z } from 'zod';

/**
 * Authentication contract.
 *
 * Roles are a list because one person can be several things at once — a
 * shopper who also sells. Authorization is always enforced by the API; a
 * client reads roles only to decide what to show.
 */

export const roles = ['customer', 'seller', 'admin'] as const;
export const roleSchema = z.enum(roles);
export type Role = z.infer<typeof roleSchema>;

export const userSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string(),
  roles: z.array(roleSchema),
  /** The seller account this user acts for, once they have one. */
  sellerId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
});
export type User = z.infer<typeof userSchema>;

export const sessionSchema = z.object({
  token: z.string(),
  expiresAt: z.iso.datetime(),
  user: userSchema,
});
export type Session = z.infer<typeof sessionSchema>;

export const signInSchema = z.object({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});
export type SignInInput = z.input<typeof signInSchema>;

export const signUpSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name.').max(120),
  email: z.email('Enter a valid email address.'),
  password: z.string().min(8, 'Use at least 8 characters.').max(200),
});
export type SignUpInput = z.input<typeof signUpSchema>;

export function hasRole(user: Pick<User, 'roles'>, role: Role): boolean {
  return user.roles.includes(role);
}
