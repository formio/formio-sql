'use strict';

var Q = require('q');
var request = require('request');
var debug = require('debug')('formio-sql:formio');

module.exports = function(settings) {
  var getRoutes = function() {
    var q = Q.defer();

    request({
      method: 'GET',
      headers: {
        'x-token': settings.formio.key
      },
      url: settings.formio.project + '/sqlconnector'
    }, function(error, response, body) {
      if (error) {
        q.reject(error);
      }

      debug(body);
      return q.resolve(body);
    });

    return q.promise;
  };

  return {
    getRoutes: getRoutes
  };
};
