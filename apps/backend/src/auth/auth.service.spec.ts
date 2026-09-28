import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';

// Testes unitários de AuthService com PrismaService/JwtService "falsos".
// Cobre login (sucesso/falha), rotação de refresh token e o cenário mais
// crítico de segurança: reuso de um refresh token já rotacionado
// (REUSE_DETECTED) revogando todas as sessões do dispositivo.

function createPrismaMock() {
  return {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      // Default { count: 0 } — login() sempre chama updateMany para revogar
      // sessões anteriores (sessão única por usuário); testes que não são
      // sobre esse comportamento específico não precisam mockar isso.
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
}

function createConfigServiceMock(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
    ...overrides,
  };
  return {
    get: jest.fn(
      (key: string, defaultValue?: string) => values[key] ?? defaultValue,
    ),
  } as unknown as ConfigService;
}

describe('AuthService', () => {
  const jwtService = new JwtService({
    secret: 'unit-test-secret-key-at-least-32-chars',
  });

  describe('hashPassword (Argon2id)', () => {
    it('produces an argon2id hash that verifies against the original password', async () => {
      const hash = await AuthService.hashPassword('minhaSenhaForte123');

      expect(hash).toMatch(/^\$argon2id\$/);
      await expect(argon2.verify(hash, 'minhaSenhaForte123')).resolves.toBe(
        true,
      );
      await expect(argon2.verify(hash, 'senhaErrada')).resolves.toBe(false);
    });
  });

  describe('login', () => {
    it('issues a valid access token and an opaque refresh token on correct credentials', async () => {
      const prisma = createPrismaMock();
      const passwordHash = await AuthService.hashPassword('correct-password');
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        organizationId: 'org-1',
        role: 'PESQUISADOR',
        isActive: true,
        passwordHash,
        name: 'Fulano',
        email: 'fulano@example.com',
      });

      const service = new AuthService(
        prisma as any,
        jwtService,
        createConfigServiceMock(),
      );

      const result = await service.login({
        email: 'fulano@example.com',
        password: 'correct-password',
        deviceId: 'device-1',
      });

      const decoded = await jwtService.verifyAsync(result.tokens.accessToken);
      expect(decoded).toMatchObject({
        sub: 'user-1',
        organizationId: 'org-1',
        role: 'PESQUISADOR',
        deviceId: 'device-1',
      });
      expect(result.tokens.refreshToken).toMatch(/^[0-9a-f]{96}$/);
      expect(result.tokens.expiresIn).toBe(15 * 60);
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
    });

    it('revokes any prior active session of the user (single session per user) before issuing new tokens', async () => {
      const prisma = createPrismaMock();
      const passwordHash = await AuthService.hashPassword('correct-password');
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        organizationId: 'org-1',
        role: 'PESQUISADOR',
        isActive: true,
        passwordHash,
        name: 'Fulano',
        email: 'fulano@example.com',
      });
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      const service = new AuthService(
        prisma as any,
        jwtService,
        createConfigServiceMock(),
      );

      await service.login({
        email: 'fulano@example.com',
        password: 'correct-password',
        deviceId: 'device-2',
      });

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: expect.objectContaining({
          revokedAt: expect.any(Date),
          revokeReason: 'NEW_LOGIN',
        }),
      });
      // A revogação das sessões antigas precisa acontecer ANTES de criar a
      // nova (senão a sessão recém-criada por este mesmo login seria
      // revogada também).
      const revokeOrder =
        prisma.refreshToken.updateMany.mock.invocationCallOrder[0];
      const createOrder =
        prisma.refreshToken.create.mock.invocationCallOrder[0];
      expect(revokeOrder).toBeLessThan(createOrder);
    });

    it('rejects an incorrect password with INVALID_CREDENTIALS', async () => {
      const prisma = createPrismaMock();
      const passwordHash = await AuthService.hashPassword('correct-password');
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        organizationId: 'org-1',
        role: 'PESQUISADOR',
        isActive: true,
        passwordHash,
      });

      const service = new AuthService(
        prisma as any,
        jwtService,
        createConfigServiceMock(),
      );

      await expect(
        service.login({
          email: 'fulano@example.com',
          password: 'wrong-password',
          deviceId: 'device-1',
        }),
      ).rejects.toMatchObject({
        response: { code: 'INVALID_CREDENTIALS' },
      });
    });

    it('rejects login for an inactive or non-existent user without leaking which', async () => {
      const prisma = createPrismaMock();
      prisma.user.findUnique.mockResolvedValue(null);
      const service = new AuthService(
        prisma as any,
        jwtService,
        createConfigServiceMock(),
      );

      await expect(
        service.login({
          email: 'ninguem@example.com',
          password: 'qualquer',
          deviceId: 'device-1',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('refresh — rotação de token', () => {
    it('rotates the refresh token: marks the old one ROTATED and issues a new one', async () => {
      const prisma = createPrismaMock();
      prisma.refreshToken.findFirst.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        deviceId: 'device-1',
        deviceName: 'Pixel',
        platform: 'android',
        revokedAt: null,
        revokeReason: null,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        organizationId: 'org-1',
        role: 'PESQUISADOR',
        isActive: true,
      });

      const service = new AuthService(
        prisma as any,
        jwtService,
        createConfigServiceMock(),
      );
      const result = await service.refresh({
        refreshToken: 'raw-old-token',
        deviceId: 'device-1',
      });

      expect(result.accessToken).toBeDefined();
      expect(prisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rt-1' },
          data: expect.objectContaining({
            revokeReason: 'ROTATED',
            replacedByTokenHash: expect.any(String),
          }),
        }),
      );
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
    });

    it('rejects an expired (but not revoked) refresh token with TOKEN_EXPIRED', async () => {
      const prisma = createPrismaMock();
      prisma.refreshToken.findFirst.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        deviceId: 'device-1',
        revokedAt: null,
        revokeReason: null,
        expiresAt: new Date(Date.now() - 1000),
      });

      const service = new AuthService(
        prisma as any,
        jwtService,
        createConfigServiceMock(),
      );

      await expect(
        service.refresh({
          refreshToken: 'raw-old-token',
          deviceId: 'device-1',
        }),
      ).rejects.toMatchObject({ response: { code: 'TOKEN_EXPIRED' } });
    });

    it('detects reuse of an already-rotated refresh token and revokes every session for that device', async () => {
      const prisma = createPrismaMock();
      prisma.refreshToken.findFirst.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        deviceId: 'device-1',
        revokedAt: new Date(),
        revokeReason: 'ROTATED',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      });

      const service = new AuthService(
        prisma as any,
        jwtService,
        createConfigServiceMock(),
      );

      await expect(
        service.refresh({
          refreshToken: 'stolen-old-token',
          deviceId: 'device-1',
        }),
      ).rejects.toMatchObject({ response: { code: 'TOKEN_REVOKED' } });

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { deviceId: 'device-1', revokedAt: null },
        data: { revokedAt: expect.any(Date), revokeReason: 'REUSE_DETECTED' },
      });
    });

    it('rejects reuse of a manually-revoked token without re-triggering reuse detection', async () => {
      const prisma = createPrismaMock();
      prisma.refreshToken.findFirst.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        deviceId: 'device-1',
        revokedAt: new Date(),
        revokeReason: 'MANUAL',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      });

      const service = new AuthService(
        prisma as any,
        jwtService,
        createConfigServiceMock(),
      );

      await expect(
        service.refresh({
          refreshToken: 'logged-out-token',
          deviceId: 'device-1',
        }),
      ).rejects.toMatchObject({ response: { code: 'TOKEN_REVOKED' } });

      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('revokeSession — hierarquia de perfis', () => {
    it('allows a GESTOR to revoke a PESQUISADOR session', async () => {
      const prisma = createPrismaMock();
      prisma.refreshToken.findMany.mockResolvedValue([
        { userId: 'researcher-1' },
      ]);
      prisma.user.findUnique.mockResolvedValue({
        id: 'researcher-1',
        role: 'PESQUISADOR',
      });

      const service = new AuthService(
        prisma as any,
        jwtService,
        createConfigServiceMock(),
      );
      await service.revokeSession(
        {
          sub: 'gestor-1',
          organizationId: 'org-1',
          role: 'GESTOR',
          deviceId: 'gestor-device',
        },
        'researcher-device',
      );

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { deviceId: 'researcher-device', revokedAt: null },
        data: { revokedAt: expect.any(Date), revokeReason: 'MANUAL' },
      });
    });

    it('blocks a SUPERVISOR from revoking a GESTOR session (same-or-higher level)', async () => {
      const prisma = createPrismaMock();
      prisma.refreshToken.findMany.mockResolvedValue([{ userId: 'gestor-1' }]);
      prisma.user.findUnique.mockResolvedValue({
        id: 'gestor-1',
        role: 'GESTOR',
      });

      const service = new AuthService(
        prisma as any,
        jwtService,
        createConfigServiceMock(),
      );

      await expect(
        service.revokeSession(
          {
            sub: 'supervisor-1',
            organizationId: 'org-1',
            role: 'SUPERVISOR',
            deviceId: 'supervisor-device',
          },
          'gestor-device',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });
});
