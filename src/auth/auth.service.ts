import {
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Request, Response } from 'express';
import { Repository } from 'typeorm';
import { timingSafeEqual } from 'crypto';
import { AdminUserEntity } from './entities/admin-user.entity';

interface AdminPayload {
  sub: string;
  nickname: string;
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly accessCookieName = 'access_token';
  private readonly refreshCookieName = 'refresh_token';
  private readonly accessMaxAgeMs = Number(
    process.env.JWT_ACCESS_MAX_AGE_MS ?? 60 * 60 * 1000,
  );
  private readonly refreshMaxAgeMs = Number(
    process.env.JWT_REFRESH_MAX_AGE_MS ?? 7 * 24 * 60 * 60 * 1000,
  );

  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(AdminUserEntity)
    private readonly adminUserRepository: Repository<AdminUserEntity>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureAdminUser();
  }

  async login(nickname: string, password: string, response: Response) {
    const requestNickname = nickname.trim();
    const requestPassword = password.trim();
    const adminUser = await this.adminUserRepository.findOne({
      where: { nickname: requestNickname },
    });

    if (
      !adminUser ||
      !this.isPasswordMatch(adminUser.password, requestPassword)
    ) {
      throw new UnauthorizedException('Invalid admin credentials');
    }

    const tokens = await this.createTokens({
      sub: adminUser.id,
      nickname: adminUser.nickname,
    });
    this.setAuthCookies(response, tokens);

    return { authenticated: true, nickname: adminUser.nickname };
  }

  async refresh(request: Request, response: Response) {
    const refreshToken = this.extractRefreshToken(request);
    const payload = await this.verifyRefreshToken(refreshToken);

    const tokens = await this.createTokens(payload);
    this.setAuthCookies(response, tokens);

    return { authenticated: true, nickname: payload.nickname };
  }

  async me(request: Request) {
    const accessToken = this.extractAccessToken(request);
    const payload = await this.verifyAccessToken(accessToken);

    const adminUser = await this.adminUserRepository.findOne({
      where: { id: payload.sub },
    });

    if (!adminUser) {
      throw new UnauthorizedException('Admin user not found');
    }

    return { authenticated: true, nickname: adminUser.nickname };
  }

  async verifyAdminRequest(request: Request): Promise<AdminPayload> {
    const accessToken = this.extractAccessToken(request);
    const payload = await this.verifyAccessToken(accessToken);
    const adminUser = await this.adminUserRepository.findOne({
      where: { id: payload.sub },
    });

    if (!adminUser) {
      throw new UnauthorizedException('Admin user not found');
    }

    return payload;
  }

  logout(response: Response) {
    response.clearCookie(this.accessCookieName, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
    });

    response.clearCookie(this.refreshCookieName, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
    });

    return { authenticated: false };
  }

  private async createTokens(payload: AdminPayload): Promise<AuthTokens> {
    const accessSecret = process.env.JWT_ACCESS_SECRET ?? 'access-secret';
    const refreshSecret = process.env.JWT_REFRESH_SECRET ?? 'refresh-secret';

    const signPayload = {
      sub: payload.sub,
      nickname: payload.nickname,
    };

    const accessToken = await this.jwtService.signAsync(signPayload, {
      expiresIn: Math.floor(this.accessMaxAgeMs / 1000),
      secret: accessSecret,
    });

    const refreshToken = await this.jwtService.signAsync(signPayload, {
      expiresIn: Math.floor(this.refreshMaxAgeMs / 1000),
      secret: refreshSecret,
    });

    return { accessToken, refreshToken };
  }

  private setAuthCookies(response: Response, tokens: AuthTokens): void {
    response.cookie(this.accessCookieName, tokens.accessToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: this.accessMaxAgeMs,
    });

    response.cookie(this.refreshCookieName, tokens.refreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: this.refreshMaxAgeMs,
    });
  }

  private async verifyAccessToken(token: string): Promise<AdminPayload> {
    try {
      return await this.jwtService.verifyAsync<AdminPayload>(token, {
        secret: process.env.JWT_ACCESS_SECRET ?? 'access-secret',
      });
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }
  }

  private async verifyRefreshToken(token: string): Promise<AdminPayload> {
    try {
      return await this.jwtService.verifyAsync<AdminPayload>(token, {
        secret: process.env.JWT_REFRESH_SECRET ?? 'refresh-secret',
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private async ensureAdminUser(): Promise<void> {
    const adminNickname = (process.env.ADMIN_NICKNAME ?? 'admin').trim();
    const adminPassword = (process.env.ADMIN_PASSWORD ?? 'admin1234').trim();

    const existingUser = await this.adminUserRepository.findOne({
      where: { nickname: adminNickname },
    });

    if (existingUser) {
      return;
    }

    await this.adminUserRepository.save(
      this.adminUserRepository.create({
        nickname: adminNickname,
        password: adminPassword,
      }),
    );
  }

  private isPasswordMatch(stored: string, provided: string): boolean {
    const storedBuffer = Buffer.from(stored);
    const providedBuffer = Buffer.from(provided);

    if (storedBuffer.length !== providedBuffer.length) {
      return false;
    }

    return timingSafeEqual(storedBuffer, providedBuffer);
  }

  private extractAccessToken(request: Request): string {
    const cookies = request.cookies as
      | Record<string, string | undefined>
      | undefined;
    const token = cookies?.[this.accessCookieName];
    if (!token) {
      throw new UnauthorizedException('Access token not found');
    }
    return token;
  }

  private extractRefreshToken(request: Request): string {
    const cookies = request.cookies as
      | Record<string, string | undefined>
      | undefined;
    const token = cookies?.[this.refreshCookieName];
    if (!token) {
      throw new UnauthorizedException('Refresh token not found');
    }
    return token;
  }
}
