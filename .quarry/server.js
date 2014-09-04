// Library requirements
var fs = require('fs');
var http = require('http');
var path = require('path');
var pg = require('pg');

// App-specific variables
var config = require('../config.json');
var connectionString;
var databases = {};

connectionString = 'postgres://' + config.database.user +
  (config.database.password ? ':' + config.database.password : '') +
  '@' + config.database.host + ':' + config.database.port + '/';

// Connect to PostgreSQL database
// Setup and initialize databases
fs.readdirSync( 'databases' ).forEach(function (databaseConfigScript) {
  var databaseName = path.basename(databaseConfigScript, '.json');
  var databaseConfig = require('../databases/' + databaseConfigScript);

  // TODO: Setup database if it doesn't exist
  console.log('Setting up database "' + databaseName + '"...');

  databases[databaseName] = {
    config: databaseConfig,
    connectionString: connectionString + databaseName
  };
});

// Start HTTP server and listening service
http.createServer(function (request, response) {
  var databaseName;
  var recordId;
  var tableName;
  var url = request.url.split('/');

  databaseName = url[1];
  tableName = url[2];
  recordId = url[3];

  // TODO: Return "403 Forbidden" if permission check fails

  if (!databases.hasOwnProperty(databaseName) || !databases[databaseName].hasOwnProperty('config')) {
    response.writeHead(404);
    return response.end('Database "' + databaseName + '" not found');
  }

  var database = databases[databaseName];
  if (!database.config.hasOwnProperty('tables') || !database.config.tables.hasOwnProperty(tableName)) {
    response.writeHead(404);
    return response.end('Database table not found');
  }

  // GET resources     list     List the URIs and perhaps other details
  // PUT resources     replace  Replace the entire collection
  // POST resources    create   Create a new entry in the collection
  // DELETE resources  clear    Delete the entire collection
  // GET resource      get      Retrieve a representation of the resource
  // PUT resource      update   Replace the addressed resource (or create if null)
  // DELETE resource   delete   Delete the addressed resource

  var data;
  var params = [];
  var query;

  query = 'SELECT * FROM ' + tableName;

  pg.connect(database.connectionString, function (error, client, done) {
    if (error) {
      response.writeHead(500);
      return response.end('Error connecting to database: ' + error);
    }

    client.query(query, params, function (error, result) {
      if (error) {
        response.writeHead(500);
        return response.end('Error running query: ' + error);
      }

      data = JSON.stringify(result.rows);

      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(data);

      done();
    });
  });
}).listen(config.port, config.host);

console.log('Server running at http://' + config.host + ':' + config.port);
