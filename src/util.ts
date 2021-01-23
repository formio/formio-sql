import _ from "lodash";
import { join } from "path";
import { FormioSQLConfig } from "./types/config";

export class Util {
  private static sourceConfig:FormioSQLConfig = require(process.env.CONFIG_PATH || join(__dirname,"..","config","config.json"));
  private static _config:FormioSQLConfig = null;
  private static configLoaded = false;
  public static get config():FormioSQLConfig {
    if( this.configLoaded === false ) {
      this._config = _.assign({}, this.sourceConfig, _.pick(process.env,[]))
      this.configLoaded = true;
    }
    return this._config;
  };
}
