import { PrismaClient, Role } from '@prisma/client';
import { isEmail } from 'class-validator';
import { hashPassword } from '../src/modules/auth/password.util';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  if (!['development', 'test'].includes(process.env.NODE_ENV ?? '')) {
    throw new Error(
      'Dummy admin seeding requires NODE_ENV=development or test',
    );
  }

  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@example.test')
    .trim()
    .toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'DemoAdmin123!';
  if (
    !isEmail(email) ||
    password.length < 8 ||
    Buffer.byteLength(password, 'utf8') > 72
  ) {
    throw new Error(
      'Seed requires a valid email and a password of at least 8 characters and at most 72 UTF-8 bytes',
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.role !== Role.ADMIN || !existing.isActive) {
      throw new Error(
        'Seed email already belongs to a non-admin or inactive account; choose another SEED_ADMIN_EMAIL',
      );
    }
    console.log(
      `Admin ${email} already exists; password and account unchanged.`,
    );
    return;
  }

  await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      firstName: 'Demo',
      lastName: 'Admin',
      role: Role.ADMIN,
      isActive: true,
    },
  });
  console.log(`Created development admin: ${email}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
