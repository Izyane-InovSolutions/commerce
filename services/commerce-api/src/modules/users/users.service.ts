import { Injectable } from '@nestjs/common';
import { Role, type Prisma, type User } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAccessById(id:string,tx:Prisma.TransactionClient=this.prisma):Promise<Pick<User,'role'|'isActive'>|null> {
    return tx.user.findUnique({where:{id},select:{role:true,isActive:true}});
  }

  async promoteCustomerToSeller(id:string,tx:Prisma.TransactionClient):Promise<void> {
    await tx.user.updateMany({where:{id,role:Role.CUSTOMER},data:{role:Role.SELLER}});
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email: this.normalizeEmail(email) },
    });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  create(email: string, passwordHash: string): Promise<User> {
    return this.prisma.user.create({
      data: { email: this.normalizeEmail(email), passwordHash },
    });
  }

  updatePasswordHash(
    id: string,
    passwordHash: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<User> {
    return tx.user.update({ where: { id }, data: { passwordHash } });
  }

  updateProfile(
    id: string,
    data: { firstName?: string; lastName?: string; phone?: string },
  ): Promise<User> {
    return this.prisma.user.update({ where: { id }, data });
  }

  normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}
