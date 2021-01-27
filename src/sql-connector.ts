import _, { AnyKindOfDictionary, Dictionary } from 'lodash';
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

export declare interface ResLocals {
  requestId?: string;
  route?: SQLConnectorRoute;
  queries?: {
    queryString: string;
    params: unknown[];
    result: AnyKindOfDictionary[];
  }[];
  result: AnyKindOfDictionary[];
  status?: number;
}

// Built to be extended and used as a class as well as a service
// To use as a service, view example configuration in docker-compose.yaml
// All environment variables listed there
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
      const locals = res.locals as ResLocals;
      locals.requestId = (req.query.requestId || uuid()) as string;
      locals.route = route;
      log(`[${locals.requestId}] ${route.method} ${route.endpoint}`);

      await this.runHook(route, 'before', req, res);

      // Mental note -
      // If a non-blocking mode is required later, add code here to send a response here to close http
      // If desired, it is valid to send a response from route.before
      //

      const knexClient = await this.getKnex(route);
      if (knexClient === null) {
        // This should have really been caught in validation
        // Did someone delete a connection post-init or something?
        error(`knex client does not exist for ${route.db}`);
        debug(route);
        return;
      }
      const result = await this.processRouteQuery(route.query, req, knexClient);
      if (typeof result === 'number') {
        this.sendError(
          res,
          'processRouteQuery failed, did you send all the needed args for the query? See error logs for details',
          result,
        );
        return;
      }

      locals.result = result;
      await this.runHook(route, 'after', req, res);

      // Don't send responses if a route handler did
      if (res.writableEnded) {
        log(`[${locals.requestId}] Response sent by route hook`);
        return;
      }
      log(`[${locals.requestId}] Sending result`);
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
    this.validateConfig();
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

    if (this.config.app.auth) {
      warn(`SQLConnector config defines app.auth`);
    }

    // Step 3: Grab routes from formio project
    log(`Fetching routes from formio project`);
    const formioRoutes = await this.getFormRouteInfo();
    debug(JSON.stringify(formioRoutes, null, '  '));
    this.config.routes = [...this.config.routes, ...formioRoutes];
  }

  protected createKnexConnections(): void {
    Object.keys(this.config.db).forEach((key) => {
      warn(
        `Creating knex connection for: ${key} (${this.config.db[key].client})`,
      );
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
    const locals = res.locals as ResLocals;
    if (route[hook]) {
      return new Promise((done) => {
        let timeout: NodeJS.Timeout | true = true;
        if (SQLConnector.HOOK_TIMEOUT !== -1) {
          timeout = setTimeout(() => {
            done();
            timeout = null;
            error(
              `[${locals.requestId}] ERROR: route.${hook} took longer than ${
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
            `[${locals.requestId}] route.${hook} returned, but after timeout expired`,
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
      const url = `${this.config.app.formio.project}/sqlconnector?format=v2`;
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
      warn(`Config validation bypassed`);
      return;
    }
    let validate;
    try {
      const ajv = new Ajv({
        allowMatchingProperties: true,
      });
      validate = ajv.compile(configSchema);
      if (validate(this.config)) {
        const invalidRoutes = this.config.routes.filter((route) => {
          if (typeof this.knexConnections[route.db] === 'undefined') {
            error(`Unknown db: ${route.db}`);
            error(route);
            return true;
          }
          return false;
        });
        if (invalidRoutes.length !== 0) {
          error(
            `${invalidRoutes.length} routes refer to unregistered db connections`,
          );
          process.exit(0);
        }
        log(`Config passed validation`);
        return;
      }
    } catch (err) {
      error(err);
    }
    error('config failed validation!');
    debug(JSON.stringify(this.config as SQLConnectorConfig, null, '  '));
    debug(validate.errors as DefinedError[]);
    process.exit(0);
  }
}
export default SQLConnector;
