import { Injectable, NotFoundException } from '@nestjs/common';
import { ProductStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ProductReferencesService {
 constructor(private readonly prisma:PrismaService) {}
 async variantExists(id:string,tx:Prisma.TransactionClient=this.prisma):Promise<boolean> {
  return !!await tx.productVariant.findUnique({where:{id},select:{id:true}});
 }
 async requirePublishedVariant(id:string,tx:Prisma.TransactionClient=this.prisma):Promise<void> {
  const variant=await tx.productVariant.findFirst({where:{id,status:ProductStatus.PUBLISHED,product:{status:ProductStatus.PUBLISHED}},select:{id:true}});
  if(!variant) throw new NotFoundException('Published variant not found');
 }
 async hasMediaAssignments(ids:string[],tx:Prisma.TransactionClient=this.prisma):Promise<boolean> {
  if(!ids.length) return false;
  return (await tx.productMedia.count({where:{mediaAssetId:{in:[...new Set(ids)]}}}))>0;
 }
}
