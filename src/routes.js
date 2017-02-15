'use strict';

var _ = require('lodash');
var Q = require('q');
var debug = {
  loadRoutes: require('debug')('formio-sql:routes:loadRoutes')
};

module.exports = function(settings) {
  var filterInvalidRoutes = function(routes) {
    var invalid = [];
    var keys = undefined;
    var bad = false;
    _.each(routes, function(route) {
      keys = Object.keys(route);
      bad =_.find(['method', 'endpoint', 'query'], function(item) {
        if (keys.indexOf(item) === -1 || !_.get(route, item)) {
          return true;
        }
      });

      if (bad) {
        invalid.push(route);
      }
    });

    if (invalid.length !== 0) {
      throw new Error('Some invalid routes exist, please fix them before proceeding. \n' + JSON.stringify(invalid));
    }

    return Q(routes);
  };

  var loadRoutes = function() {
    var routes;
    try {
      routes = require('../routes.json');
    }
    catch (e) {
      console.warn(e);
      console.warn('Ignoring routes file..');
      routes = [];
    }
    debug.loadRoutes(routes);
    return Q.fcall(filterInvalidRoutes, routes);
  };

  return {
    loadRoutes: loadRoutes
  };
};
