## quarry

A RESTful database request server. It listens for seven types of REST requests and responds with JSON resources.

### Install

```sh
npm install -g quarry
```

### Setup

Currently, Quarry is built exclusively for PostgreSQL databases. Support for other database options will be added in the future, and prior to the 1.0 release.

For now, you'll need PostgreSQL installed and started prior to running Quarry.

#### Quarry Config

Create a JSON config file for Quarry (default `quarry.json`) with the following "global" options:

- **connection** : A hash containing the connection options for the database server:
  - **host** : The host address to connect directly to the database server
  - **port** : The port number the database server is listening on
  - **user** : The name of the user/role to connect to the database with
  - **password** : The password for the user/role
- **databaseScripts** : An array of JavaScript file names used for specific database configurations (see below)
- **host** : The host address to bind the Quarry connection to
- **port** : The port number to listen for requests on

#### Database Scripts

Each database will need its own JavaScript file in order to outline its tables, fixtures, and permissions. This "database script" file will simply export an object with the following allowed nested parameters:

- **tables** : A hash of table definitions, where the key is the table name, and the value is an object with the following parameters:
  - **columns** : A hash of column definitions, where the key is the column name, and the value is a string representing the data type
  - **fixtures** : An array of hashes containing keys and values for the columns
  - **allow** : A hash of values or functions, where the key is the RESTful "action" name, and the value is either a boolean value, or a function that accepts the request data and returns a boolean value (when true, the request action is allowed). When an action is *not* mentioned in this hash, it is not allowed (equivalent to *false* value).

For convenience, and certainly not for security, you can simply set **allow** to *true*, in order to allow all the actions to be permitted on the table. This is definitely not recommended for stable or production projects, but is intended as an easy way to get up and running quickly.

#### RESTful Actions

The RESTful "actions" are a friendly way to refer to REST requests, and each represents a combination of an HTTP method and a URI format:

- *create* (POST /resources) Create a new entry in the collection
- *delete* (DELETE /resources/:id) Delete the addressed resource
- *deleteAll* (DELETE /resources) Delete the entire collection
- *find* (GET /resources/:id) Retrieve a representation of the resource
- *findAll* (GET /resources) Retrieve all the collection's resources
- *replaceAll* (PUT /resources) Replace the entire collection
- *update* (PUT /resources/:id) Replace the addressed resource (or create if null)

### Quarry Command

- **start** : Start the Quarry server in the current directory, with options:
  - *-c, --config [file]* : Use a specified config file, instead of the default "quarry.json"

### Examples

The following scripts would result in

#### Quarry config, "quarry.js"

```js
{
  "connection": {
    "host": "localhost",
    "port": 5432,
    "user": "quarry_user",
    "password": null
  },

  "databaseScripts": [
    "databases/example.js"
  ],

  "host": "db.example.com",
  "port": 54321
}
```

#### Database Script, "databases/example.js"

```js
module.exports = {
  tables: {
    colors: {
      columns: {
        id      : 'serial',
        name    : 'text',
        hexCode : 'text'
      },

      fixtures: [
        { name: 'Red',   hexCode: 'FF0000' },
        { name: 'Green', hexCode: '00FF00' },
        { name: 'Blue',  hexCode: '0000FF' }
      ],

      allow: {
        findAll: true,

        update: function ( request ) {
          return !!request.params.userId;
        }
      }
    }
  }
}
```
