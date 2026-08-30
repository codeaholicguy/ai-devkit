import { parentPort, workerData } from 'node:worker_threads';
import { DatabaseConnection } from '../../../src/database/connection.js';

const connection = new DatabaseConnection({ dbPath: workerData.dbPath as string });
connection.close();
parentPort?.postMessage('opened');
