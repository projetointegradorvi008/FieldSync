import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UsersService } from './users.service';

// Testes unitários com um PrismaService "falso" — cobre as regras novas de
// proteção do usuário-raiz (isRootAdmin), logout forçado ao desativar, e
// exclusão de usuário (auto-exclusão, hierarquia, dados dependentes).
function createPrismaMock() {
  return {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    refreshToken: {
      updateMany: jest.fn(),
    },
    survey: { count: jest.fn() },
    response: { count: jest.fn() },
    device: { deleteMany: jest.fn() },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
}

const ADMIN = {
  sub: 'admin-1',
  organizationId: 'org-1',
  role: 'ADMINISTRADOR' as const,
  deviceId: 'admin-device',
};

describe('UsersService', () => {
  describe('update — proteção do usuário-raiz e logout forçado', () => {
    it('rejects deactivating the root admin user', async () => {
      const prisma = createPrismaMock();
      prisma.user.findUnique.mockResolvedValue({
        id: 'root-1',
        role: 'ADMINISTRADOR',
        isRootAdmin: true,
      });

      const service = new UsersService(prisma as any);
      await expect(
        service.update(ADMIN, 'root-1', { isActive: false }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('revokes all active sessions of a user when deactivated (force logout)', async () => {
      const prisma = createPrismaMock();
      prisma.user.findUnique.mockResolvedValue({
        id: 'researcher-1',
        role: 'PESQUISADOR',
        isRootAdmin: false,
      });
      prisma.user.update.mockResolvedValue({
        id: 'researcher-1',
        isActive: false,
      });

      const service = new UsersService(prisma as any);
      await service.update(ADMIN, 'researcher-1', { isActive: false });

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'researcher-1', revokedAt: null },
        data: expect.objectContaining({
          revokedAt: expect.any(Date),
          revokeReason: 'USER_DEACTIVATED',
        }),
      });
    });

    it('does not revoke sessions when only the name changes', async () => {
      const prisma = createPrismaMock();
      prisma.user.findUnique.mockResolvedValue({
        id: 'researcher-1',
        role: 'PESQUISADOR',
        isRootAdmin: false,
      });
      prisma.user.update.mockResolvedValue({ id: 'researcher-1' });

      const service = new UsersService(prisma as any);
      await service.update(ADMIN, 'researcher-1', { name: 'Novo nome' });

      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('rejects deleting your own account', async () => {
      const prisma = createPrismaMock();
      prisma.user.findUnique.mockResolvedValue({
        id: 'admin-1',
        role: 'ADMINISTRADOR',
        isRootAdmin: false,
      });

      const service = new UsersService(prisma as any);
      await expect(service.remove(ADMIN, 'admin-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rejects deleting the root admin user', async () => {
      const prisma = createPrismaMock();
      prisma.user.findUnique.mockResolvedValue({
        id: 'root-1',
        role: 'ADMINISTRADOR',
        isRootAdmin: true,
      });

      const service = new UsersService(prisma as any);
      await expect(service.remove(ADMIN, 'root-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rejects deleting a user of the same or higher hierarchy level', async () => {
      const prisma = createPrismaMock();
      prisma.user.findUnique.mockResolvedValue({
        id: 'admin-2',
        role: 'ADMINISTRADOR',
        isRootAdmin: false,
      });

      const service = new UsersService(prisma as any);
      await expect(service.remove(ADMIN, 'admin-2')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('throws USER_NOT_FOUND for a non-existent target', async () => {
      const prisma = createPrismaMock();
      prisma.user.findUnique.mockResolvedValue(null);

      const service = new UsersService(prisma as any);
      await expect(service.remove(ADMIN, 'ghost')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects deleting a user with surveys they created (has dependent data)', async () => {
      const prisma = createPrismaMock();
      prisma.user.findUnique.mockResolvedValue({
        id: 'gestor-2',
        role: 'GESTOR',
        isRootAdmin: false,
      });
      prisma.survey.count.mockResolvedValue(2);

      const service = new UsersService(prisma as any);
      await expect(service.remove(ADMIN, 'gestor-2')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it('deletes the user when they created no surveys', async () => {
      const prisma = createPrismaMock();
      prisma.user.findUnique.mockResolvedValue({
        id: 'researcher-1',
        role: 'PESQUISADOR',
        isRootAdmin: false,
      });
      prisma.survey.count.mockResolvedValue(0);

      const service = new UsersService(prisma as any);
      await service.remove(ADMIN, 'researcher-1');

      expect(prisma.user.delete).toHaveBeenCalledWith({
        where: { id: 'researcher-1' },
      });
    });

    it('allows deleting a researcher who already collected responses — the responses stay, only the author reference is dropped (SetNull)', async () => {
      const prisma = createPrismaMock();
      prisma.user.findUnique.mockResolvedValue({
        id: 'researcher-1',
        role: 'PESQUISADOR',
        isRootAdmin: false,
      });
      prisma.survey.count.mockResolvedValue(0);

      const service = new UsersService(prisma as any);
      await service.remove(ADMIN, 'researcher-1');

      expect(prisma.response.count).not.toHaveBeenCalled();
      expect(prisma.user.delete).toHaveBeenCalledWith({
        where: { id: 'researcher-1' },
      });
    });
  });
});
