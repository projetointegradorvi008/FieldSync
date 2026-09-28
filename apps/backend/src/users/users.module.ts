import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

// Importa AuthModule para reusar os guards (JwtAuthGuard, RolesGuard,
// HierarchyGuard) exportados por ele.
@Module({
  imports: [AuthModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
