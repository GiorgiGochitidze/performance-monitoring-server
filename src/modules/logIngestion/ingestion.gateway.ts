import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class IngestionGateway {
  @WebSocketServer()
  server!: Server;

  broadcastMetrics(batchLogs: any[], criticalAlerts: any[] = []) {
    this.server.emit('metrics-update', {
      logs: batchLogs,
      alerts: criticalAlerts,
    });
  }
}
