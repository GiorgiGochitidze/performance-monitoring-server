import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:3000', 'https://mapwise-one.vercel.app'],
    credentials: true,
  },
})
export class IngestionGateway {
  @WebSocketServer() server!: Server;

  broadcastMetrics(batchLogs: any[], criticalAlerts: any[] = []) {
    this.server.emit('metrics-update', {
      logs: batchLogs,
      alerts: criticalAlerts,
    });
  }

  // Tells connected clients the demo has stopped, whether by manual toggle,
  // TTL expiry, or hitting MAX_LOGS_PER_SESSION
  broadcastDemoStopped() {
    this.server.emit('demo-stopped');
  }

  // Pure liveness ping - no Redis writes here anymore.
  // This used to overwrite demo-state:active and was the original bug.
  @SubscribeMessage('ping-demo')
  handleDemoPing() {
    return { pong: true };
  }
}
