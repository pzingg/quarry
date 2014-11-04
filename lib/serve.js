module.exports = function (config) {

  // Library requirements
  var fs   = require('fs');
  var http = require('http');
  var path = require('path');
  var pg   = require('pg');
  var url  = require('url');
  var u_   = require('underscore');

  // Local library scripts
  var setup = require('./setup');
  var util  = require('./util');

  // App-specific variables
  var connectionPreString;
  var databases = {};
  var headers = {
    'Access-Control-Allow-Headers': [
      'Content-Type',
      'X-Requested-With'
    ],
    'Access-Control-Allow-Methods': [
      'DELETE', 'GET', 'OPTIONS', 'POST', 'PUT'
    ],
    'Access-Control-Allow-Origin': config.hasOwnProperty('allowOrigin') ? config.allowOrigin : '*',
    'Content-Type': 'application/json'
  };

  connectionPreString = 'postgres://' + config.connection.user +
    (config.connection.password ? ':' + config.connection.password : '') +
    '@' + config.connection.host + ':' + config.connection.port;

  function respond(response, status, data) {
    response.writeHead(status, headers);
    response.end(JSON.stringify(data));
  }

  function startServer() {
    http.createServer(function (request, response) {
      var database;
      var table;
      var parsedUrl = url.parse(request.url, true);
      var requestPath = parsedUrl.pathname.split('/');
      var databaseName = requestPath[1];
      var tableName = requestPath[2];
      var recordId = requestPath[3];
      var returnCollection = !recordId;

      // Return "404 Not Found" if the database is not defined
      if (!databases.hasOwnProperty(databaseName) || !databases[databaseName].hasOwnProperty('config')) {
        return respond(response, 404, { error: 'Database "' + databaseName + '" not found' });
      }
      database = databases[databaseName];

      // Return "404 Not Found" if the table is not defined
      if (!database.config.hasOwnProperty('tables') || !database.config.tables.hasOwnProperty(tableName)) {
        return respond(response, 404, { error: 'Database table "' + tableName + '" not found' });
      }
      table = database.config.tables[tableName];

      pg.connect(database.connectionString, function (error, client, done) {
        if (error) {
          return respond(response, 500, { error: 'Error connecting to database' });
        }

        var action;
        var body = '';
        var data = {};
        var query;
        var queryParams = [];

        // GET     /resources      findAll     List the URIs and perhaps other details
        // PUT     /resources      replaceAll  Replace the entire collection
        // POST    /resources      create      Create a new entry in the collection
        // DELETE  /resources      deleteAll   Delete the entire collection
        // GET     /resources/:id  find        Retrieve a representation of the resource
        // PUT     /resources/:id  update      Replace the addressed resource (or create if null)
        // DELETE  /resources/:id  delete      Delete the addressed resource

        switch (request.method) {
          case 'DELETE':
            action = returnCollection ? 'deleteAll' : 'delete';
            break;

          case 'GET':
            action = returnCollection ? 'findAll' : 'find';
            break;

          case 'OPTIONS':
            var options = [];

            if (tableAllowsAll(table)) {
              options = ['DELETE', 'GET', 'PUT'];
              if (returnCollection) {
                options.push('POST');
              }
            } else {
              if (returnCollection) {
                if (tableAccepts(table, 'deleteAll'))  { options.push('DELETE'); }
                if (tableAccepts(table, 'findAll'))    { options.push('GET'); }
                if (tableAccepts(table, 'create'))     { options.push('POST'); }
                if (tableAccepts(table, 'replaceAll')) { options.push('PUT'); }
              } else {
                if (tableAccepts(table, 'delete')) { options.push('DELETE'); }
                if (tableAccepts(table, 'find'))   { options.push('GET'); }
                if (tableAccepts(table, 'update')) { options.push('PUT'); }
              }
            }

            return respond(response, 200, options);

          case 'PUT':
            action = returnCollection ? 'replaceAll' : 'update';
            break;

          case 'POST':
            if (returnCollection) {
              action = 'create';
              break;
            }

          default:
            return respond(response, 405, { error: 'Method and request do not form a valid action' });
        }

        // Return "403 Forbidden" if the table does not allow the action with
        // the supplied request
        if (!tableAllows(table, action, request)) {
          return respond(response, 403, { error: 'Forbidden' });
        }

        request.on('data', function (chunk) {
          body += chunk.toString();
        });

        request.on('end', function () {
          var column;
          var columns = [];
          var record;
          var values = [];
          var valueVars = [];
          var page;
          var maxResults;
          var total;
          var resultData;
          var recordType = util.singularize(tableName);
          var pk = tablePk(table);

          if (body) {
            request.body = body = JSON.parse(body);
          }
          request.params = parsedUrl.query;
          maxResults = parseInt(request.params.max_results || table.max_results || database.config.max_results || -1);
          page = parseInt(request.params.page || 1);
          total = -1;

          switch (action) {
            case 'create':
              record = body[recordType];

              for (column in record) {
                if (record.hasOwnProperty(column)) {
                  columns.push(column);
                  valueVars.push('$' + (valueVars.length + 1));
                  queryParams.push(record[column]);
                }
              }
              query = 'INSERT INTO ' + tableName + ' (' + columns.join(', ') + ') VALUES (' + valueVars.join(', ') + ')';
              break;

            case 'delete':
              query = 'DELETE FROM ' + tableName + ' WHERE ' + pk + ' = $1';
              queryParams.push(recordId);
              break;

            case 'deleteAll':
              query = 'DELETE FROM ' + tableName;
              break;

            case 'find':
              query = 'SELECT * FROM ' + tableName + ' WHERE ' + pk + ' = $1';
              queryParams.push(recordId);
              break;

            case 'findAll':
              if (maxResults > 0) {
                query = 'SELECT COUNT(*) AS count FROM ' + tableName;
                client.query(query, queryParams, function (error, result) {
                  if (error) {
                    util.logError('Error running query $1 with params $2', query, queryParams);
                    return respond(response, 500, { error: 'Error running query' });
                  }
                  total = parseInt(result.rows[0]['count']);
                });
                query = 'SELECT * FROM ' + tableName + ' LIMIT ' + maxResults;
                if (page) {
                  page = parseInt(page)
                  query += ' OFFSET ' + ((page-1)*maxResults); 
                }
              } else {
                query = 'SELECT * FROM ' + tableName;
              }
              break;

            // TODO: Add "replaceAll"

            case 'update':
              recordType = util.singularize(tableName);
              record = body[recordType];

              query = 'UPDATE ' + tableName + ' SET ';

              for (column in record) {
                if (record.hasOwnProperty(column)) {
                  columns.push(column + ' = $' + (columns.length + 1));
                  queryParams.push(record[column]);
                }
              }
              query = 'UPDATE ' + tableName + ' SET ' + columns.join(', ') +  ' WHERE ' + pk + ' = $' + (columns.length + 1);
              queryParams.push(recordId);
              break;
          }

          client.query(query, queryParams, function (error, result) {
            if (error) {
              util.logError('Error running query $1 with params $2', query, queryParams);
              return respond(response, 500, { error: 'Error running query' });
            }

            if (table.hasOwnProperty('filtered')) {
              resultData = [ ];
              u_.each(result.rows, function(el) {
                  var filtered_el = u_.pick(el, function(value, key, object) {
                    return table.filtered(value, key, request);
                  });
                  resultData.push(filtered_el);
              });
            } else {
              resultData = result.rows;
            }
            if (returnCollection) {
              if (maxResults < 0 || total < 0) {
                maxResults = resultData.length;
                total = resultData.length;
                page = 1;
              }
              var lastPage = Math.floor((total + maxResults - 1) / maxResults);
              
              data['_items'] = resultData;
              data['_etag'] = 'todo';
              data['_meta'] = {
                  'max_results': maxResults,
                  'total': total,
                  'page': page
              };
              data['_links'] = {
                'self': {
                  'href':  parsedUrl.path,
                  'title': tableName
                },
                'parent': {
                  'href':  '/',
                  'title': 'home'
                },
                'last': {
                  'href':  parsedUrl.pathname + '?page=' + lastPage + '&max_results=' + maxResults,
                  'title': tableName
                }
              };
              if (page > 1) {
                data['_links']['prev'] = {
                  'href':  parsedUrl.pathname + '?page=' + (page-1) + '&max_results=' + maxResults,
                  'title': tableName
                };
              } 
              if (page < lastPage) {
                data['_links']['next'] = {
                  'href':  parsedUrl.pathname + '?page=' + (page+1) + '&max_results=' + maxResults,
                  'title': tableName
                };
              } 
            } else {
              if (resultData.length > 0) {
                data = resultData[0];
                data['_etag'] = 'todo';
                data['_links'] = {
                  'self': {
                    'href':  parsedUrl.path,
                    'title': recordType
                  },
                  'parent': {
                    'href':  '/',
                    'title': 'home'
                  },
                  'collection': {
                    'href':  '/' + databaseName + '/' + tableName,
                    'title': tableName
                  }
                };
              }
            }
            respond(response, 200, data);

            done();
          });
        });
      });
    }).listen(config.port, config.host);

    console.log('Server running at http://' + config.host + ':' + config.port);
  }
  
  function tablePk(table) {
    return table.hasOwnProperty('pk') ? table.pk : 'id';
  }

  function tableAccepts(table, type) {
    return table.hasOwnProperty('allow') &&
      table.allow === true || table.allow.hasOwnProperty(type);
  }

  function tableAllowsAll(table) {
    return table.hasOwnProperty('allow') && table.allow === true;
  }

  function tableAllows(table, type, request) {
    return table.hasOwnProperty('allow') &&
      table.allow === true ||
      (table.allow.hasOwnProperty(type) &&
        typeof table.allow[type] === 'function' ?
          table.allow[type](request) :
          table.allow[type]
      );
  }

  // Setup and initialize databases
  config.databaseScripts.forEach(function (databaseScript) {
    var connectionString;
    var database = { config: require(process.cwd() + '/' + databaseScript) };

    if (database.config.hasOwnProperty('name')) {
      database.name = database.config.name;
    } else {
      database.name = path.basename(databaseScript, '.js');
    }

    database.connectionString = connectionPreString + '/' + database.name;

    // Added postgres DB name to fix 'Database "pz" does not exist' error
    pg.connect(connectionPreString + '/postgres', function (error, client, done) {
      if (error) {
        util.logError('Error connecting to Postgres');
        return console.log(error.toString());
      }

      // Check if the database exists
      client.query('SELECT 1 FROM pg_database WHERE datname = $1', [ database.name ], function (error, result) {
        if (error) {
          util.logError('Error connecting to database $1', database.name);
          return console.log(error.toString());
        }

        if (result.rowCount > 0) {
          done();
          util.logNotice('Found database $1', database.name);
          return startServer();
        }

        // Create the database if it doesn't exist
        var owner = database.config.owner || config.connection.user;
        client.query('CREATE DATABASE ' + database.name + ' OWNER = ' + owner, function (error, result) {
          if (error) {
            util.logError('Error creating database $1', database.name);
            return console.log(error.toString);
          }

          util.logSuccess('Created database $1', database.name);
          done();

          setup.createTables(database);
        });
      });
    });

    databases[database.name] = database;
  });
};
