import 'dotenv/config.js';

import express from "express";
import cors from "cors";

import { apiTokenCheck } from './lib/apiTokenCheck.js';

import { commitController } from "./controllers/commit.js";
import { historyController } from "./controllers/history.js";
import { diffController } from "./controllers/diff.js";
import { deleteController } from './controllers/delete.js';
import { auditController } from './controllers/audits.js';

const app = express();
const port = 3000;

app.use(cors(process.env.ALLOWED_DOMAINS || '*'));
app.disable('x-powered-by');
app.use(express.json());

app.use(apiTokenCheck);

app.post('/commit/:repository', commitController);
app.get('/history/:repository/:entity/:name', historyController);
app.get('/diff/:repository/:entity/:name/:commit1/:commit2', diffController);
app.delete('/delete/:repository/:entity/:name', deleteController);
app.get('/audit', auditController);

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