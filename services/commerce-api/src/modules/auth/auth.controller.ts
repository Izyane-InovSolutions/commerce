import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Public } from '../../common/auth/public.decorator';
import {
  AuthTokensResponse,
  HandoffCodeResponse,
  PublicUser,
  SessionSummary,
} from './auth-response';
import { AuthService, RequestContext } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto';
import { ExchangeHandoffTokenDto } from './dto/exchange-handoff-token.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';

const AUTH_BRUTE_FORCE_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle(AUTH_BRUTE_FORCE_THROTTLE)
  @Post('register')
  register(
    @Body() dto: RegisterDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<AuthTokensResponse> {
    return this.authService.register(
      dto.email,
      dto.password,
      this.requestContext(ip, userAgent),
    );
  }

  @Public()
  @Throttle(AUTH_BRUTE_FORCE_THROTTLE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(
    @Body() dto: LoginDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<AuthTokensResponse> {
    return this.authService.login(
      dto.email,
      dto.password,
      this.requestContext(ip, userAgent),
    );
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(
    @Body() dto: RefreshTokenDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<AuthTokensResponse> {
    return this.authService.refresh(
      dto.refreshToken,
      this.requestContext(ip, userAgent),
    );
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RefreshTokenDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<void> {
    return this.authService.logout(
      user.id,
      dto.refreshToken,
      this.requestContext(ip, userAgent),
    );
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): Promise<PublicUser> {
    return this.authService.me(user.id);
  }

  @Patch('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<void> {
    return this.authService.changePassword(
      user.id,
      user.sessionId,
      dto.currentPassword,
      dto.newPassword,
      this.requestContext(ip, userAgent),
    );
  }

  @Public()
  @Throttle(AUTH_BRUTE_FORCE_THROTTLE)
  @Post('password-reset/request')
  @HttpCode(HttpStatus.NO_CONTENT)
  requestPasswordReset(
    @Body() dto: RequestPasswordResetDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<void> {
    return this.authService.requestPasswordReset(
      dto.email,
      this.requestContext(ip, userAgent),
    );
  }

  @Public()
  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  confirmPasswordReset(
    @Body() dto: ConfirmPasswordResetDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<void> {
    return this.authService.confirmPasswordReset(
      dto.token,
      dto.newPassword,
      this.requestContext(ip, userAgent),
    );
  }

  /** Called by the app the user is already signed into (e.g. apps/web),
   * server-to-server, to get a code for handing that session off to
   * another app's own login (e.g. apps/seller). */
  @Throttle(AUTH_BRUTE_FORCE_THROTTLE)
  @Post('handoff')
  @HttpCode(HttpStatus.OK)
  mintHandoff(
    @CurrentUser() user: AuthenticatedUser,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<HandoffCodeResponse> {
    return this.authService.mintHandoffToken(
      user.id,
      this.requestContext(ip, userAgent),
    );
  }

  /** Called by the receiving app (e.g. apps/seller), server-to-server, to
   * redeem a handoff code for a real token pair — public because whoever
   * calls it isn't signed in there yet; the code itself is the proof. */
  @Public()
  @Post('handoff/exchange')
  @HttpCode(HttpStatus.OK)
  exchangeHandoff(
    @Body() dto: ExchangeHandoffTokenDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<AuthTokensResponse> {
    return this.authService.exchangeHandoffToken(
      dto.code,
      this.requestContext(ip, userAgent),
    );
  }

  @Get('sessions')
  listSessions(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SessionSummary[]> {
    return this.authService.listSessions(user.id);
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) sessionId: string,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<void> {
    return this.authService.revokeSession(
      user.id,
      sessionId,
      this.requestContext(ip, userAgent),
    );
  }

  private requestContext(ip: string, userAgent?: string): RequestContext {
    return { ipAddress: ip, userAgent };
  }
}
