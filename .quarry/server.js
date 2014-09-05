// Library requirements
var fs   = require('fs');
var http = require('http');
var path = require('path');
var pg   = require('pg');
var util = require('util');

// Color shell strings
var blue   = '\033[0;34m';
var green  = '\033[0;32m';
var normal = '\033[0;m';
var red    = '\033[0;31m';
var white  = '\033[1;37m';

// App-specific variables
var config = require('../config.json');
var connectionPreString;
var databases = {};
var headers = {
  'Access-Control-Allow-Headers': config.allowHeaders.join(', '),
  'Access-Control-Allow-Origin': config.allowOrigin,
  'Content-Type': 'application/json'
};

connectionPreString = 'postgres://' + config.database.user +
  (config.database.password ? ':' + config.database.password : '') +
  '@' + config.database.host + ':' + config.database.port;

function createFixtures(database) {
  if (!database.config.hasOwnProperty('fixtures') || database.config.fixtures.length < 1) {
    return;
  }

  util.print('Connecting to ' + white + database.name + normal + '... ');
  pg.connect(database.connectionString, function (error, client, done) {
    if (error) {
      return logError(error);
    }
    logSuccess('Okay');

    for (var tableName in database.config.fixtures) {
      if (database.config.fixtures.hasOwnProperty(tableName)) {
        database.config.fixtures[tableName].forEach(function (fixture) {
          var columnNames = database.config.fixtures[tableName];
          var columns = [];
          var values = [];
          var valueVars = [];

          query = 'INSERT INTO ' + tableName + ' (';
          for (var columnName in fixture) {
            if (fixture.hasOwnProperty(columnName)) {
              columns.push(columnName);
              values.push(fixture[columnName]);
              valueVars.push('$' + (valueVars.length + 1));
            }
          }

          query += columns.join(', ') + ') VALUES (' + valueVars.join(', ') + ')';
          console.log(query);
          /*
          client.query(query, values, function (error, result) {
            if (error) {
              done();
              logError('Error inserting fixture: $1', error);
            }
          });
          // */
        });
      }
    }

    done();

    /*
    client.on('drain', function () {
      logSuccess('Inserted $1 fixtures', database.name);
      done();
    });
    // */
  });
}

function createTables(database) {
  if (!database.config.hasOwnProperty('tables') || database.config.tables.length < 1) {
    return;
  }

  util.print('Connecting to ' + white + database.name + normal + '... ');
  pg.connect(database.connectionString, function (error, client, done) {
    if (error) {
      return logError(error);
    }
    logSuccess('Okay');

    var columns;
    var columnName;
    var columnNames;
    var query;
    var tableName;
    var type;

    for (tableName in database.config.tables) {
      if (database.config.tables.hasOwnProperty(tableName)) {
        columnNames = database.config.tables[tableName];
        columns = [];
        query = 'CREATE TABLE ' + tableName + ' (';

        for (columnName in columnNames) {
          if (columnNames.hasOwnProperty(columnName)) {
            type = columnNames[columnName];
            columns.push(columnName + ' ' + type);
          }
        }

        query += columns.join(', ') + ')';

        util.print(
          'Creating table ' + white + tableName + normal +
          ' in database ' + white + database.name + normal + '... '
        );
        client.query(query, function (error, result) {
          if (error) {
            logError(error);
          }

          logSuccess('Okay');
        });
      }
    }

    client.on('drain', function () {
      done();
      createFixtures(database);
    });
  });
}

function logError(message) { console.log(red + message.toString() + normal); }
function logNotice(message) { console.log(blue + message.toString() + normal); }
function logSuccess(message) { console.log(green + message.toString() + normal); }

function startServer() {
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

    // GET resources     list      List the URIs and perhaps other details
    // PUT resources     replace   Replace the entire collection
    // POST resources    create    Create a new entry in the collection
    // DELETE resources  clear     Delete the entire collection
    // GET resource      retrieve  Retrieve a representation of the resource
    // PUT resource      update    Replace the addressed resource (or create if null)
    // DELETE resource   delete    Delete the addressed resource

    var data;
    var params = [];
    var query;

    query = 'SELECT * FROM ' + tableName;

    pg.connect(database.connectionString, function (error, client, done) {
      if (error) {
        response.writeHead(500, headers);
        return response.end({ error: 'Error connecting to database: ' + error});
      }

      client.query(query, params, function (error, result) {
        if (error) {
          response.writeHead(500, headers);
          return response.end({ error: 'Error running query: ' + error });
        }

        data = JSON.stringify(result.rows);

        response.writeHead(200, headers);
        response.end(data);

        done();
      });
    });
  }).listen(config.port, config.host);

  console.log('Server running at http://' + config.host + ':' + config.port);
}

// Setup and initialize databases
fs.readdirSync( 'databases' ).forEach(function (databaseConfigScript) {
  var connectionString;
  var database = {
    config: require('../databases/' + databaseConfigScript),
    name: path.basename(databaseConfigScript, '.json')
  };

  database.connectionString = connectionPreString + '/' + database.name;

  util.print('Connecting to Postgres... ');
  pg.connect(connectionPreString, function (error, client, done) {
    if (error) {
      return logError(error);
    }
    logSuccess('Okay');

    // Check if the database exists
    util.print('Checking database ' + white + database.name + normal + '... ');
    client.query('SELECT 1 FROM pg_database WHERE datname = $1', [ database.name ], function (error, result) {
      if (error) {
        return logError(error);
      }

      if (result.rowCount > 0) {
        done();
        return logNotice('Found');
      }

      // Create the database if it doesn't exist
      util.print('Creating... ');
      var owner = database.config.owner || config.database.user;
      client.query('CREATE DATABASE ' + database.name + ' OWNER = ' + owner, function (error, result) {
        if (error) {
          return logError(error);
        }

        logSuccess('Okay');
        done();

        createTables(database);
      });
    });
  });

  databases[database.name] = database;
});
