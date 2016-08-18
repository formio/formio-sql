'use strict';

// Parse the env file (if exists) and prepare the settings.
require('dotenv').config({silent: true});
var settings = require('./src/settings')();
var routes = require('./src/routes')(settings);
var _ = require('lodash');
var resquel = require('resquel');
var express = require('express');

// Create our app.
var app = express();

// Gather the Resquel specific settings.
var config = _.pick(settings, ['db', 'type', 'auth']);

routes.loadRoutes()
  .then(function(routes) {
    // Mount the loaded routes
    config.routes = routes;

    // Mount Resquel and continue.
    app.use(resquel(config));
    app.listen(settings.port);
  })
  .catch(function(err) {
    console.error(err);
    process.exit(1);
  })
  .done();
