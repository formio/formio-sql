import { SQLConnectorConfig } from 'config';
import SQLConnector from './sql-connector';
import express from 'express';
import debug from 'debug';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const config: SQLConnectorConfig = require('../config/config.json');
const log = debug('formio-sql');

const run = async () => {
  const connector = new SQLConnector(config);
  await connector.init();
  const app = express();
  app.use(connector.router);

  app.listen(config.app.port);
  log(`Listening on ${config.app.port}`);
};
run();
