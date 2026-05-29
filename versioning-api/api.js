import express from "express";
import cors from "cors";

import { commitController } from "./controllers/commit.js";
import { historyController } from "./controllers/history.js";

const app = express();
const port = 3000;

app.use(cors(process.env.ALLOWED_DOMAINS || '*'));
app.disable('x-powered-by');
app.use(express.json());

app.post('/commit/:repository', commitController);
app.get('/history/:repository/:entity/:name', historyController);

process.on('SIGTERM', () => {
  console.log('SIGTERM reçu, arrêt du serveur...');
  server.close(() => {
    console.log('API server stopped.');
    process.exit(0);
  });
});

const server = app.listen(port, () => {
  console.log(`API server started on port ${port}`);
});