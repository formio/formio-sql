import _, { Dictionary } from 'lodash';
import Ajv, { DefinedError } from 'ajv';
import CONFIG from '../schemas/config.json';
import cors from 'cors';
import fetch from 'node-fetch';
import Knex from 'knex';
import logger from './log';
import Resquel from 'resquel';
import { Request, Response } from 'express';
import { SQLConnectorConfig, SQLConnectorRoute } from 'config';
import { v4 as uuid } from 'uuid';
const configSchema: Dictionary<unknown> = CONFIG;

const { log, warn, debug, error } = logger('sql-connector');

const sleep = (ms): Promise<void> =>
  new Promise((i) => setTimeout(() => i(), ms));

// Built to be extended and used as a class as well as a service
export class SQLConnector extends Resquel {
  protected knexConnections: Record<string, Knex> = {};

  // I tried to warn you!
  // Easy off button for your configuration validation woes.
  public static BYPASS_CONFIG_VALIDATION =
    (process.env.BYPASS_CONFIG_VALIDATION || false).toString() === 'true';
  // -1 to disable
  public static HOOK_TIMEOUT = Number(process.env.HOOK_TIMEOUT || 1000 * 30);
  public static ROUTE_INFO_MAX_RETRIES = Number(
    process.env.ROUTE_INFO_MAX_RETRIES || 50,
  );

  constructor(private config: SQLConnectorConfig) {
    super(null);
  }

  /**
   * 🪄 Set up new routes without defining them in the config! 🪄
   */
  public async addRoute(route: SQLConnectorRoute): Promise<void> {
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

      const knexClient = await this.getKnex(route);
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
  }

  /**
   * Retrieve Knex connection via route
   *
   * Possible feature expansions:
   *  - Mapping request method to certain databases (GET goes to read db, POST goes to write, etc)
   */
  public async getKnex(route: SQLConnectorRoute): Promise<Knex | null> {
    const connectionName = route.db || 'default';
    return this.knexConnections[connectionName] || null;
  }

  public async init(): Promise<void> {
    log(`Connector init`);
    await this.configBuilder();
    await super.init();
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
  protected async configBuilder(): Promise<void> {
    // Step 1: Merge environment variables into config
    const mapping = {
      // [environment variable]: 'config.object.path',
      PORT: 'app.port',
      FORMIO_KEY: 'app.formio.key',
      FORMIO_PROJECT: 'app.formio.project',
      AUTH_USERNAME: 'app.auth.username',
      AUTH_PASSWORD: 'app.auth.password',
      EXTERNAL_CONFIG: 'app.externalConfig.url',
    };
    Object.keys(mapping).forEach((key) => {
      if (process.env[key] !== undefined) {
        warn(`Using process.env.${key} value for ${mapping[key]}`);
        _.set(this.config, mapping[key], process.env[key]);
      }
    });

    // Step 2: If defined, pull in external config and merge
    if (this.config.app.externalConfig) {
      // When in doubt, external config takes priority
      const external = this.config.app.externalConfig;
      warn(`External config path provided`);
      const response = await fetch(external.url, external.extra);
      const externalConfig: SQLConnectorConfig = await response.json();
      debug(externalConfig);

      // app merging
      if (externalConfig.app) {
        this.config.app.cors = externalConfig.app.cors || this.config.app.cors;
        this.config.app.auth = externalConfig.app.auth || this.config.app.auth;
        this.config.app.formio =
          externalConfig.app.formio || this.config.app.formio;
        this.config.app.port = externalConfig.app.port || this.config.app.port;
      }

      // db merging
      if (externalConfig.db) {
        this.config.db = {
          ...this.config.db,
          ...externalConfig.db,
        };
      }

      // routes merging
      if (externalConfig.routes) {
        this.config.routes = [...this.config.routes, ...externalConfig.routes];
      }
    }

    // Step 3: Grab routes from formio project
    log(`Fetching routes from formio project`);
    const formioRoutes = await this.getFormRouteInfo();
    debug(formioRoutes);
    this.config.routes = [...this.config.routes, ...formioRoutes];
    this.validateConfig();
  }

  protected createKnexConnections(): void {
    Object.keys(this.config.db).forEach((key) => {
      this.knexConnections[key] = Knex(this.config.db[key]);
    });
  }

  protected loadRoutes(): void {
    this.config.routes.forEach((route) => this.addRoute(route));
  }

  protected routerSetup(): void {
    super.routerSetup(this.config.app.auth);
    this.router.use(cors(this.config.app.cors));
  }

  protected async runHook(
    route: SQLConnectorRoute,
    hook: 'before' | 'after',
    req: Request,
    res: Response,
  ): Promise<void> {
    if (route[hook]) {
      return new Promise((done) => {
        let timeout: NodeJS.Timeout | true = true;
        if (SQLConnector.HOOK_TIMEOUT !== -1) {
          timeout = setTimeout(() => {
            done();
            timeout = null;
            error(
              `${res.locals.requestId}] ERROR: route.${hook} took longer than ${
                SQLConnector.HOOK_TIMEOUT / 1000
              } seconds`,
            );
          }, SQLConnector.HOOK_TIMEOUT);
        }
        route.before(req, res, async () => {
          if (timeout !== null) {
            if (timeout !== true) {
              clearTimeout(timeout);
            }
            timeout = null;
            done();
            return;
          }
          // Well that's weird. You can update HOOK_TIMEOUT to modify
          //
          error(
            `${res.locals.requestId}] route.${hook} returned, but after timeout expired`,
          );
        });
      });
    }
  }

  private async getFormRouteInfo(
    failures = 0,
  ): Promise<SQLConnectorRoute[]> | never {
    if (failures > SQLConnector.ROUTE_INFO_MAX_RETRIES) {
      error(
        `MAX_RETRIES exceeded, verify formio-server is running and the project url is correct`,
      );
      process.exit(0);
    }
    if (failures > 0) {
      log('sleep(5000)');
      await sleep(5000);
    }
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
      error(`Failed to pull formio sqlconnector info %O`, err);
      return this.getFormRouteInfo(failures + 1);
    }
  }

  private validateConfig(): void | never {
    if (SQLConnector.BYPASS_CONFIG_VALIDATION) {
      return;
    }
    const ajv = new Ajv();
    const validate = ajv.compile(configSchema);
    if (validate(this.config)) {
      return;
    }
    error('config failed validation!');
    debug(this.config as SQLConnectorConfig);
    debug(validate.errors as DefinedError[]);
    process.exit(0);
  }
}
export default SQLConnector;
