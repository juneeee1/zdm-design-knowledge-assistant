import { createApp } from '../server/index.mjs';
const server = createApp();
const handler = server.listeners('request')[0];
export default handler;
