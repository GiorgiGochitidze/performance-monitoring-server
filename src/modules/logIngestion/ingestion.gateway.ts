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

  broadcastMetrics(data: any[]) {
    this.server.emit('metrics-update', data);
  }
}
