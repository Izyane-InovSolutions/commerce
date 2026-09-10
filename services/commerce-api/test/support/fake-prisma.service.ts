import { randomUUID } from 'node:crypto';
import { ProductStatus, Role } from '@prisma/client';

type FakeUser = {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type FakeSession = {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
};

type FakePasswordResetToken = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};

/**
 * A minimal in-memory stand-in for PrismaClient covering only the operations
 * AuthService uses, so auth e2e flows can run without a real database.
 */
export class FakePrismaService {
  private readonly users = new Map<string, FakeUser>();
  private readonly sessions = new Map<string, FakeSession>();
  private readonly passwordResetTokens = new Map<
    string,
    FakePasswordResetToken
  >();

  $connect(): Promise<void> {
    return Promise.resolve();
  }

  $disconnect(): Promise<void> {
    return Promise.resolve();
  }

  // Supports both Prisma $transaction forms: an array of already-started
  // operations, and a callback that receives a transaction client (here,
  // just `this` again — the fake has no real transactional isolation).
  $transaction<T>(
    arg: unknown[] | ((tx: this) => Promise<T>),
  ): Promise<unknown> {
    if (typeof arg === 'function') {
      return arg(this);
    }

    return Promise.all(arg);
  }

  user = {
    findUnique: ({
      where,
    }: {
      where: { id?: string; email?: string };
    }): Promise<FakeUser | null> => {
      if (where.id) {
        return Promise.resolve(this.users.get(where.id) ?? null);
      }

      return Promise.resolve(
        [...this.users.values()].find((user) => user.email === where.email) ??
          null,
      );
    },
    create: ({
      data,
    }: {
      data: { email: string; passwordHash: string };
    }): Promise<FakeUser> => {
      const now = new Date();
      const user: FakeUser = {
        id: randomUUID(),
        email: data.email,
        passwordHash: data.passwordHash,
        role: Role.CUSTOMER,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
      this.users.set(user.id, user);
      return Promise.resolve(user);
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<FakeUser>;
    }): Promise<FakeUser> => {
      const user = this.users.get(where.id);

      if (!user) {
        throw new Error(`Fake user ${where.id} not found`);
      }

      Object.assign(user, data, { updatedAt: new Date() });
      return Promise.resolve(user);
    },
  };

  session = {
    create: ({
      data,
    }: {
      data: { userId: string; refreshTokenHash: string; expiresAt: Date };
    }): Promise<FakeSession> => {
      const session: FakeSession = {
        id: randomUUID(),
        userId: data.userId,
        refreshTokenHash: data.refreshTokenHash,
        expiresAt: data.expiresAt,
        revokedAt: null,
        createdAt: new Date(),
      };
      this.sessions.set(session.id, session);
      return Promise.resolve(session);
    },
    findUnique: ({
      where,
    }: {
      where: { id?: string; refreshTokenHash?: string };
    }): Promise<FakeSession | null> => {
      if (where.id) {
        return Promise.resolve(this.sessions.get(where.id) ?? null);
      }

      return Promise.resolve(
        [...this.sessions.values()].find(
          (session) => session.refreshTokenHash === where.refreshTokenHash,
        ) ?? null,
      );
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<FakeSession>;
    }): Promise<FakeSession> => {
      const session = this.sessions.get(where.id);

      if (!session) {
        throw new Error(`Fake session ${where.id} not found`);
      }

      Object.assign(session, data);
      return Promise.resolve(session);
    },
    updateMany: ({
      where,
      data,
    }: {
      where: { userId: string; revokedAt: null; id?: { not: string } };
      data: Partial<FakeSession>;
    }): Promise<{ count: number }> => {
      let count = 0;

      for (const session of this.sessions.values()) {
        if (session.userId !== where.userId || session.revokedAt !== null) {
          continue;
        }

        if (where.id && session.id === where.id.not) {
          continue;
        }

        Object.assign(session, data);
        count += 1;
      }

      return Promise.resolve({ count });
    },
    findMany: ({
      where,
    }: {
      where: { userId: string };
    }): Promise<FakeSession[]> => {
      return Promise.resolve(
        [...this.sessions.values()].filter(
          (session) =>
            session.userId === where.userId &&
            session.revokedAt === null &&
            session.expiresAt > new Date(),
        ),
      );
    },
  };

  passwordResetToken = {
    create: ({
      data,
    }: {
      data: { userId: string; tokenHash: string; expiresAt: Date };
    }): Promise<FakePasswordResetToken> => {
      const record: FakePasswordResetToken = {
        id: randomUUID(),
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        usedAt: null,
        createdAt: new Date(),
      };
      this.passwordResetTokens.set(record.id, record);
      return Promise.resolve(record);
    },
    findUnique: ({
      where,
    }: {
      where: { tokenHash: string };
    }): Promise<FakePasswordResetToken | null> => {
      return Promise.resolve(
        [...this.passwordResetTokens.values()].find(
          (record) => record.tokenHash === where.tokenHash,
        ) ?? null,
      );
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<FakePasswordResetToken>;
    }): Promise<FakePasswordResetToken> => {
      const record = this.passwordResetTokens.get(where.id);

      if (!record) {
        throw new Error(`Fake password reset token ${where.id} not found`);
      }

      Object.assign(record, data);
      return Promise.resolve(record);
    },
  };

  auditEvent = {
    create: ({
      data,
    }: {
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const record = { id: randomUUID(), createdAt: new Date(), ...data };
      return Promise.resolve(record);
    },
  };

  // --- Catalog (Phase 1.1) -------------------------------------------------
  // Loose, dynamic-record collections: catalog e2e coverage only needs enough
  // fidelity to exercise the admin-create -> publish -> public-list pipeline,
  // not a full relational engine.
  private readonly categories = new Map<string, Record<string, unknown>>();
  private readonly brands = new Map<string, Record<string, unknown>>();
  private readonly attributes = new Map<string, Record<string, unknown>>();
  private readonly attributeValues = new Map<string, Record<string, unknown>>();
  private readonly mediaAssets = new Map<string, Record<string, unknown>>();
  private readonly products = new Map<string, Record<string, unknown>>();
  private readonly productVariants = new Map<string, Record<string, unknown>>();
  private readonly variantAttributeValues: {
    variantId: string;
    attributeValueId: string;
  }[] = [];
  private readonly productMediaRows = new Map<
    string,
    Record<string, unknown>
  >();
  private readonly offers = new Map<string, Record<string, unknown>>();
  private readonly prices = new Map<string, Record<string, unknown>>();

  private attributeValueDetail(id: string): Record<string, unknown> {
    const value = this.attributeValues.get(id);
    const attribute = this.attributes.get(value?.attributeId as string);
    return { ...value, attribute };
  }

  private variantDetail(
    id: string,
    publicOnly = false,
  ): Record<string, unknown> {
    const variant = this.productVariants.get(id)!;
    const attributeValues = this.variantAttributeValues
      .filter((row) => row.variantId === id)
      .map((row) => ({
        ...row,
        attributeValue: this.attributeValueDetail(row.attributeValueId),
      }));
    const offers = [...this.offers.values()]
      .filter((offer) => offer.variantId === id)
      .filter(
        (offer) => !publicOnly || offer.status === ProductStatus.PUBLISHED,
      )
      .map((offer) => ({
        ...offer,
        prices: [...this.prices.values()].filter(
          (price) => price.offerId === offer.id,
        ),
      }));
    return { ...variant, attributeValues, offers };
  }

  // ProductsService always pairs a top-level `status: PUBLISHED` filter with
  // nested `variants`/`offers` filtered the same way for its public queries,
  // and never filters by status at all for admin queries — so the top-level
  // status alone tells us whether to also filter the nested collections.
  private productDetail(
    id: string,
    publicOnly = false,
  ): Record<string, unknown> | undefined {
    const product = this.products.get(id);
    if (!product) return undefined;
    const variants = [...this.productVariants.values()]
      .filter((variant) => variant.productId === id)
      .filter(
        (variant) => !publicOnly || variant.status === ProductStatus.PUBLISHED,
      )
      .map((variant) => this.variantDetail(variant.id as string, publicOnly));
    const media = [...this.productMediaRows.values()]
      .filter((row) => row.productId === id)
      .sort((a, b) => (a.position as number) - (b.position as number))
      .map((row) => ({
        ...row,
        mediaAsset: this.mediaAssets.get(row.mediaAssetId as string),
      }));
    return {
      ...product,
      brand: product.brandId
        ? (this.brands.get(product.brandId as string) ?? null)
        : null,
      category: product.categoryId
        ? (this.categories.get(product.categoryId as string) ?? null)
        : null,
      variants,
      media,
    };
  }

  category = {
    findMany: (): Promise<Record<string, unknown>[]> =>
      Promise.resolve([...this.categories.values()]),
    findUnique: ({
      where,
    }: {
      where: { id?: string; slug?: string };
    }): Promise<Record<string, unknown> | null> => {
      const row = where.id
        ? this.categories.get(where.id)
        : [...this.categories.values()].find(
            (category) => category.slug === where.slug,
          );
      if (!row) return Promise.resolve(null);
      const children = [...this.categories.values()].filter(
        (category) => category.parentId === row.id,
      );
      return Promise.resolve({ ...row, children });
    },
    create: ({
      data,
    }: {
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const now = new Date();
      const row = {
        id: randomUUID(),
        position: 0,
        parentId: null,
        description: null,
        createdAt: now,
        updatedAt: now,
        ...data,
      };
      this.categories.set(row.id as string, row);
      return Promise.resolve(row);
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const row = this.categories.get(where.id)!;
      Object.assign(row, data, { updatedAt: new Date() });
      return Promise.resolve(row);
    },
    delete: ({ where }: { where: { id: string } }): Promise<void> => {
      this.categories.delete(where.id);
      return Promise.resolve();
    },
  };

  brand = {
    findMany: (): Promise<Record<string, unknown>[]> =>
      Promise.resolve([...this.brands.values()]),
    findUnique: ({
      where,
    }: {
      where: { id?: string; slug?: string };
    }): Promise<Record<string, unknown> | null> => {
      const row = where.id
        ? this.brands.get(where.id)
        : [...this.brands.values()].find((brand) => brand.slug === where.slug);
      return Promise.resolve(row ?? null);
    },
    create: ({
      data,
    }: {
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const now = new Date();
      const row = {
        id: randomUUID(),
        description: null,
        createdAt: now,
        updatedAt: now,
        ...data,
      };
      this.brands.set(row.id as string, row);
      return Promise.resolve(row);
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const row = this.brands.get(where.id)!;
      Object.assign(row, data, { updatedAt: new Date() });
      return Promise.resolve(row);
    },
    delete: ({ where }: { where: { id: string } }): Promise<void> => {
      this.brands.delete(where.id);
      return Promise.resolve();
    },
  };

  attribute = {
    findMany: (): Promise<Record<string, unknown>[]> =>
      Promise.resolve(
        [...this.attributes.values()].map((attribute) => ({
          ...attribute,
          values: [...this.attributeValues.values()].filter(
            (value) => value.attributeId === attribute.id,
          ),
        })),
      ),
    findUnique: ({
      where,
    }: {
      where: { id: string };
    }): Promise<Record<string, unknown> | null> => {
      const row = this.attributes.get(where.id);
      if (!row) return Promise.resolve(null);
      return Promise.resolve({
        ...row,
        values: [...this.attributeValues.values()].filter(
          (value) => value.attributeId === row.id,
        ),
      });
    },
    create: ({
      data,
    }: {
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const now = new Date();
      const row = { id: randomUUID(), createdAt: now, updatedAt: now, ...data };
      this.attributes.set(row.id as string, row);
      return Promise.resolve(row);
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const row = this.attributes.get(where.id)!;
      Object.assign(row, data, { updatedAt: new Date() });
      return Promise.resolve(row);
    },
    delete: ({ where }: { where: { id: string } }): Promise<void> => {
      this.attributes.delete(where.id);
      return Promise.resolve();
    },
  };

  attributeValue = {
    findUnique: ({
      where,
    }: {
      where: { id: string };
    }): Promise<Record<string, unknown> | null> =>
      Promise.resolve(this.attributeValues.get(where.id) ?? null),
    create: ({
      data,
    }: {
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const row = { id: randomUUID(), createdAt: new Date(), ...data };
      this.attributeValues.set(row.id as string, row);
      return Promise.resolve(row);
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const row = this.attributeValues.get(where.id)!;
      Object.assign(row, data);
      return Promise.resolve(row);
    },
    delete: ({ where }: { where: { id: string } }): Promise<void> => {
      this.attributeValues.delete(where.id);
      return Promise.resolve();
    },
  };

  mediaAsset = {
    findUnique: ({
      where,
    }: {
      where: { id: string };
    }): Promise<Record<string, unknown> | null> =>
      Promise.resolve(this.mediaAssets.get(where.id) ?? null),
    // Test seam: not a real Prisma method, used by e2e tests to seed an
    // AVAILABLE media asset without going through the media upload flow.
    __seed: (row: Record<string, unknown>): void => {
      this.mediaAssets.set(row.id as string, row);
    },
  };

  product = {
    findMany: ({ where }: { where?: Record<string, unknown> } = {}): Promise<
      Record<string, unknown>[]
    > => {
      const publicOnly = where?.status === ProductStatus.PUBLISHED;
      const rows = [...this.products.keys()]
        .map((id) => this.productDetail(id, publicOnly)!)
        .filter((row) => this.matchesProductWhere(row, where));
      return Promise.resolve(rows);
    },
    findFirst: ({
      where,
    }: {
      where: Record<string, unknown>;
    }): Promise<Record<string, unknown> | null> => {
      const publicOnly = where.status === ProductStatus.PUBLISHED;
      const row = [...this.products.keys()]
        .map((id) => this.productDetail(id, publicOnly)!)
        .find((candidate) => this.matchesProductWhere(candidate, where));
      return Promise.resolve(row ?? null);
    },
    findUnique: ({
      where,
    }: {
      where: { id: string };
    }): Promise<Record<string, unknown> | null> =>
      Promise.resolve(this.productDetail(where.id) ?? null),
    count: ({
      where,
    }: { where?: Record<string, unknown> } = {}): Promise<number> => {
      const publicOnly = where?.status === ProductStatus.PUBLISHED;
      const rows = [...this.products.keys()]
        .map((id) => this.productDetail(id, publicOnly)!)
        .filter((row) => this.matchesProductWhere(row, where));
      return Promise.resolve(rows.length);
    },
    create: ({
      data,
    }: {
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const now = new Date();
      const row = {
        id: randomUUID(),
        status: ProductStatus.DRAFT,
        description: null,
        brandId: null,
        categoryId: null,
        createdAt: now,
        updatedAt: now,
        ...data,
      };
      this.products.set(row.id as string, row);
      return Promise.resolve(row);
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const row = this.products.get(where.id)!;
      Object.assign(row, data, { updatedAt: new Date() });
      return Promise.resolve(row);
    },
    delete: ({ where }: { where: { id: string } }): Promise<void> => {
      this.products.delete(where.id);
      return Promise.resolve();
    },
  };

  private matchesProductWhere(
    row: Record<string, unknown>,
    where?: Record<string, unknown>,
  ): boolean {
    if (!where) return true;

    if (where.status && row.status !== where.status) return false;

    const category = where.category as { slug?: string } | undefined;
    if (
      category?.slug &&
      (row.category as { slug?: string } | null)?.slug !== category.slug
    )
      return false;

    const brand = where.brand as { slug?: string } | undefined;
    if (
      brand?.slug &&
      (row.brand as { slug?: string } | null)?.slug !== brand.slug
    )
      return false;

    if (
      typeof row.slug !== 'undefined' &&
      where.slug &&
      row.slug !== where.slug
    )
      return false;

    return true;
  }

  productVariant = {
    findUnique: ({
      where,
    }: {
      where: { id: string };
    }): Promise<Record<string, unknown> | null> => {
      if (!this.productVariants.has(where.id)) return Promise.resolve(null);
      return Promise.resolve(this.variantDetail(where.id));
    },
    create: ({
      data,
    }: {
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const now = new Date();
      const row = {
        id: randomUUID(),
        status: ProductStatus.DRAFT,
        name: null,
        createdAt: now,
        updatedAt: now,
        ...data,
      };
      this.productVariants.set(row.id as string, row);
      return Promise.resolve(row);
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const row = this.productVariants.get(where.id)!;
      Object.assign(row, data, { updatedAt: new Date() });
      return Promise.resolve(row);
    },
    delete: ({ where }: { where: { id: string } }): Promise<void> => {
      this.productVariants.delete(where.id);
      return Promise.resolve();
    },
  };

  productVariantAttributeValue = {
    createMany: ({
      data,
    }: {
      data: { variantId: string; attributeValueId: string }[];
    }): Promise<{ count: number }> => {
      this.variantAttributeValues.push(...data);
      return Promise.resolve({ count: data.length });
    },
    deleteMany: ({
      where,
    }: {
      where: { variantId: string };
    }): Promise<{ count: number }> => {
      const remaining = this.variantAttributeValues.filter(
        (row) => row.variantId !== where.variantId,
      );
      const removed = this.variantAttributeValues.length - remaining.length;
      this.variantAttributeValues.length = 0;
      this.variantAttributeValues.push(...remaining);
      return Promise.resolve({ count: removed });
    },
  };

  productMedia = {
    findUnique: ({
      where,
    }: {
      where: { id: string };
    }): Promise<Record<string, unknown> | null> =>
      Promise.resolve(this.productMediaRows.get(where.id) ?? null),
    create: ({
      data,
    }: {
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const row = {
        id: randomUUID(),
        position: 0,
        isPrimary: false,
        createdAt: new Date(),
        ...data,
      };
      this.productMediaRows.set(row.id as string, row);
      return Promise.resolve(row);
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const row = this.productMediaRows.get(where.id)!;
      Object.assign(row, data);
      return Promise.resolve(row);
    },
    updateMany: ({
      where,
      data,
    }: {
      where: { productId: string };
      data: Record<string, unknown>;
    }): Promise<{ count: number }> => {
      let count = 0;
      for (const row of this.productMediaRows.values()) {
        if (row.productId === where.productId) {
          Object.assign(row, data);
          count += 1;
        }
      }
      return Promise.resolve({ count });
    },
    delete: ({ where }: { where: { id: string } }): Promise<void> => {
      this.productMediaRows.delete(where.id);
      return Promise.resolve();
    },
  };

  offer = {
    findUnique: ({
      where,
    }: {
      where: { id: string };
    }): Promise<Record<string, unknown> | null> => {
      const row = this.offers.get(where.id);
      if (!row) return Promise.resolve(null);
      return Promise.resolve({
        ...row,
        prices: [...this.prices.values()].filter(
          (price) => price.offerId === row.id,
        ),
      });
    },
    create: ({
      data,
    }: {
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const now = new Date();
      const row = {
        id: randomUUID(),
        status: ProductStatus.DRAFT,
        createdAt: now,
        updatedAt: now,
        ...data,
      };
      this.offers.set(row.id as string, row);
      return Promise.resolve(row);
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const row = this.offers.get(where.id)!;
      Object.assign(row, data, { updatedAt: new Date() });
      return Promise.resolve(row);
    },
    delete: ({ where }: { where: { id: string } }): Promise<void> => {
      this.offers.delete(where.id);
      return Promise.resolve();
    },
  };

  price = {
    create: ({
      data,
    }: {
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      // Real Prisma treats an explicit `undefined` value as "field not
      // provided" (schema defaults still apply); a naive spread below would
      // instead let it clobber the default, so strip undefined keys first.
      data = Object.fromEntries(
        Object.entries(data).filter(([, value]) => value !== undefined),
      );
      const row = {
        id: randomUUID(),
        startsAt: new Date(),
        endsAt: null,
        createdAt: new Date(),
        ...data,
      };
      this.prices.set(row.id as string, row);
      return Promise.resolve(row);
    },
  };
}
