import WebSocket from 'ws';
import { Server } from 'http';
import { scraperEvents } from './scraper';

export function setupWebSocket(server: Server) {
    const wss = new WebSocket.Server({ server });

    wss.on('connection', (ws) => {
        console.log('Client connected to WebSocket');

        const progressHandler = (data: any) => {
            ws.send(JSON.stringify(data));
        };

        // Subscribe to scraper events
        scraperEvents.on('progress', progressHandler);

        ws.on('close', () => {
            // Clean up event listener when client disconnects
            scraperEvents.removeListener('progress', progressHandler);
            console.log('Client disconnected from WebSocket');
        });
    });
}
