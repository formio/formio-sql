import debug from 'debug';
import request from 'request';
import { Util } from './util';

const log = debug('formio-sql:formio');

export class FormioSQL {
  public async startup() {
    const routes = await this.getRoutes();
    log(routes);
    return;
  }
  public async getRoutes() {
    return new Promise((accept, reject) => {
      request(
        {
          method: 'GET',
          headers: {
            'x-token': Util.config.formio.key,
          },
          url: `${Util.config.formio.project}/sqlconnector`,
        },
        (err, response, body) => {
          if (err) {
            return reject(err);
          }
          log(body);
          accept(body);
        },
      );
    });
  }
}
