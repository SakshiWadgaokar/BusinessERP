import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../../common/prisma/prisma.service';
import { getEnv } from '../../common/config/env';

@WebSocketGateway({
  namespace: '/events',
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly env = getEnv();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ||
        (client.handshake.headers.authorization?.replace('Bearer ', '') ?? '');

      if (!token) {
        client.disconnect(true);
        return;
      }

      const payload = await this.jwtService.verifyAsync<{ sub: string; sid: string }>(token, {
        secret: this.env.JWT_ACCESS_SECRET,
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: {
          userRoles: { include: { role: true } },
          dealer: { select: { id: true } },
          employee: { select: { id: true } },
        },
      });

      if (!user || user.status !== 'ACTIVE') {
        client.disconnect(true);
        return;
      }

      client.join(`user:${user.id}`);
      for (const ur of user.userRoles) {
        client.join(`role:${ur.role.code}`);
      }
      if (user.dealer) {
        client.join(`dealer:${user.dealer.id}`);
      }
      if (user.employee) {
        client.join(`employee:${user.employee.id}`);
      }

      this.logger.debug(`WS connected: user=${user.email}`);
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`WS disconnected: ${client.id}`);
  }

  emitToRoles(roles: string[], event: string, payload: unknown) {
    if (!this.server) return;
    for (const role of roles) {
      this.server.to(`role:${role}`).emit(event, payload);
    }
  }

  emitToUser(userId: string, event: string, payload: unknown) {
    if (!this.server) return;
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  emitToDealer(dealerId: string, event: string, payload: unknown) {
    if (!this.server) return;
    this.server.to(`dealer:${dealerId}`).emit(event, payload);
  }

  emitToEmployee(employeeId: string, event: string, payload: unknown) {
    if (!this.server) return;
    this.server.to(`employee:${employeeId}`).emit(event, payload);
  }
}
