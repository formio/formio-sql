'use strict';

// Parse the env file (if exists) and prepare the settings.
require('dotenv').config({silent: true});
var settings = require('./src/settings')();
var routes = require('./src/routes')(settings);
var formio = require('./src/formio')(settings);
var _ = require('lodash');
var resquel = require('resquel');
var express = require('express');
var Q = require('q');
var cors = require('cors');

// Create our app.
var app = express();

// TODO configure domains via settings.
// use cors.
app.use(cors());

// Gather the Resquel specific settings.
var config = _.pick(settings, ['db', 'type', 'auth']);

Q()
  .then(formio.getRoutes)
  .then(function(routes) {
    if (routes && typeof routes === 'string') {
      try {
        routes = JSON.parse(routes);
      }
      catch (e) {
        throw e;
      }
    }

    // Mount the loaded routes.
    config.routes = routes || [];
  })
  .then(routes.loadRoutes)
  .then(function(routes) {
    // modify the loaded routes, with the local routes.
    config.routes = config.routes.concat(routes);

    // Mount Resquel and continue.
    app.use(resquel(config));
    app.listen(settings.port);
  })
  .catch(function(err) {
    console.error(err); // eslint-disable-line no-console
    process.exit(1);
  })
  .done();
