import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';

import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Public } from '../../common/auth/public.decorator';
import { ReserveUploadDto } from './dto/reserve-upload.dto';
import {
  MediaService,
  ReservedMediaUpload,
  SignedMediaUrl,
} from './media.service';

type UploadedMedia = { buffer: Buffer; mimetype: string; size: number };

@ApiTags('media')
@ApiBearerAuth()
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('uploads')
  @ApiOperation({
    summary: 'Reserve a local media upload and receive a signed URL',
  })
  reserve(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReserveUploadDto,
  ): Promise<ReservedMediaUpload> {
    return this.media.reserve(user.id, dto);
  }

  @Put(':id/content')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @HttpCode(HttpStatus.NO_CONTENT)
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('expires') expires: string,
    @Query('signature') signature: string,
    @UploadedFile() file?: UploadedMedia,
  ): Promise<void> {
    return this.media.upload(user.id, id, expires, signature, file);
  }

  @Get(':id/url')
  downloadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SignedMediaUrl> {
    return this.media.createDownloadUrl(user.id, id);
  }

  @Public()
  @Get(':id/download')
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('expires') expires: string,
    @Query('signature') signature: string,
    @Res() response: Response,
  ): Promise<void> {
    const object = await this.media.download(id, expires, signature);
    response.type(object.mimeType).send(object.body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.media.delete(user.id, id);
  }
}
