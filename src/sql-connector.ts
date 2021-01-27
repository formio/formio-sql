import Knex from 'knex';
import Resquel from 'resquel';
import { SQLConnectorConfig, SQLConnectorRoute } from 'config';
import { Request, Response } from 'express';
import debug from 'debug';
import fetch from 'node-fetch';
import _ from 'lodash';
import cors from 'cors';
import { v4 as uuid } from 'uuid';
import express from 'express';

const log = debug('formio-sql:sql-connector');
export class SQLConnector extends Resquel {
  public static HOOK_TIMEOUT = 1000 * 30;

  private knexConnections: Record<string, Knex> = {};
  private initComplete = false;
  constructor(private config: SQLConnectorConfig) {
    // Using our own init process
    super(null);
  }

  public async init() {
    log(`Connector starting init process`);
    await this.configBuilder();
    log('');

    await super.init();
  }

  public attachApp(app: express.Application) {
    app.use(this.router);
    return;
  }

  protected routerSetup(): void {
    super.routerSetup(this.config.app.auth);
    log(`Adding cors`);
    this.router.use(cors());
  }

  protected loadRoutes() {
    this.config.routes.forEach((route) => this.addRoute(route));
  }

  private async runHook(
    route: SQLConnectorRoute,
    hook: 'before' | 'after',
    req: Request,
    res: Response,
  ): Promise<void> {
    if (route[hook]) {
      return new Promise((done) => {
        let timeout = setTimeout(() => {
          done();
          timeout = null;
          log(
            `${res.locals.requestId}] ERROR: route.${hook} took longer than ${
              SQLConnector.HOOK_TIMEOUT / 1000
            } seconds`,
          );
        }, SQLConnector.HOOK_TIMEOUT);
        route.before(req, res, async () => {
          if (timeout !== null) {
            clearTimeout(timeout);
            timeout = null;
            done();
            return;
          }
          // Well that's weird
          // Probably should be setting off some alarms if you see this
          //
          // If it's a normal timeout thing, send a support email and this can be made more configurable
          // It can also be a symptom of calling next() more than once
          //

          log(
            `${res.locals.requestId}] route.${hook} returned, but after timeout expired`,
          );
        });
      });
    }
  }

  /**
   * 🪄 Set up new routes without defining them in the config! 🪄
   */
  public async addRoute(route: SQLConnectorRoute) {
    const method = route.method.toLowerCase();
    log(`Adding route: ${method} ${route.endpoint}`);
    this.router[method](route.endpoint, async (req: Request, res: Response) => {
      res.locals.requestId = req.query.requestId || uuid();
      res.locals.route = route;
      log(`${res.locals.requestId}] ${route.method} ${route.endpoint}`);

      await this.runHook(route, 'before', req, res);

      // Mental note -
      // If a non-blocking mode is required later, add code here to send a response here to close http
      // If desired, it is valid to send a response from route.before
      //

      const knexClient = this.getKnex(route.db || 'default');
      const result = await this.processRouteQuery(route.query, req, knexClient);
      res.locals.result = result;

      await this.runHook(route, 'after', req, res);

      // Don't send responses if a route handler did
      if (res.writableEnded) {
        log(`${res.locals.requestId}] Response sent by route hook`);
        return;
      }
      log(`${res.locals.requestId}] Sending result`);
      this.sendResponse(res);
    });
    return;
  }

  /**
   * Big expansion on Resquel implementation -
   * This function is intended to replace `config.json` that is utilized w/ Resquel
   *
   * Configuration data from these sources are merged into a completed overall config:
   * - config.json
   * - environment variables
   * - external config
   *
   * This function will be expanded in the future with more config sources
   * If you have requests, send in an email to support@form.io
   */
  private async configBuilder(): Promise<void> {
    // Step 1: Merge environment variables into config
    const mapping = {
      PORT: 'app.port',
      FORMIO_KEY: 'app.formio.key',
      FORMIO_PROJECT: 'app.formio.project',
      AUTH_USERNAME: 'app.auth.username',
      AUTH_PASSWORD: 'app.auth.password',
      EXTERNAL_CONFIG: 'app.externalConfig.url',
    };
    Object.keys(mapping).forEach((key) => {
      if (process.env[key] !== undefined) {
        log(`Using process.env.${key} value for ${mapping[key]}`);
        _.set(this.config, mapping[key], process.env[key]);
      }
    });

    // Step 2: If defined, pull in external config and merge
    if (this.config.app.externalConfig) {
      // When in doubt, external config takes priority
      const external = this.config.app.externalConfig;
      log(`External config path provided`);
      const response = await fetch(external.url, external.extra);
      const externalConfig: SQLConnectorConfig = await response.json();
      log(externalConfig);

      if (externalConfig.app) {
        this.config.app.auth = externalConfig.app.auth || this.config.app.auth;
        this.config.app.formio =
          externalConfig.app.formio || this.config.app.formio;
        this.config.app.port = externalConfig.app.port || this.config.app.port;
      }
      if (externalConfig.db) {
        this.config.db = {
          ...this.config.db,
          ...externalConfig.db,
        };
      }
      if (externalConfig.routes) {
        this.config.routes = [...this.config.routes, ...externalConfig.routes];
      }
    }

    // Step 3: Grab routes from formio project
    log(`Fetching routes from formio project`);
    const formioRoutes = await this.getFormioRouteInfo();
    log(formioRoutes);
    this.config.routes = [...this.config.routes, ...formioRoutes];

    // TODO: Pull in ajv to validate the completed config
  }

  protected createKnexConnections(): void {
    Object.keys(this.config.db).forEach((key) => {
      this.knexConnections[key] = Knex(this.config.db[key]);
    });
  }

  /**
   * Retrieve Knex connection by name
   */
  public getKnex(connectionName: string): Knex | null {
    return this.knexConnections[connectionName] || null;
  }

  private async getFormioRouteInfo(): Promise<SQLConnectorRoute[]> {
    try {
      const url = `${this.config.app.formio.project}/sqlconnector`;
      log(`Loading connector data from: ${url}`);
      const body = await fetch(url, {
        headers: {
          'x-token': this.config.app.formio.key,
        },
      });
      return body.json();
    } catch (err) {
      log(`Failed to pull formio sqlconnector info`);
      log(err);
    }
    return [];
  }
}
export default SQLConnector;
