## quarry

A simple RESTful database request server. It lets you send requests for a URL like `/database/table/id` and get back a JSON representation of the result(s).

### Install

```sh
npm install -g quarry
```

### Setup

Currently, Quarry is built exclusively for PostgreSQL databases. Support for other database options will be added in the future.

You'll need PostgreSQL installed and started prior to running Quarry.

### Usage

Create a JSON config file for Quarry (default `quarry.json`) with the following "global" options:

- **connection** : A hash containing the connection options for the database server:
  - **host** : The host address to connect directly to the database server
  - **port** : The port number the database server is listening on
  - **user** : The name of the user/role to connect to the database with
  - **password** : The password for the user/role
- **databaseScripts** : An array of JavaScript file names used for specific database configurations (see below)
- **host** : The host address to bind the Quarry connection to
- **port** : The port number to listen for requests on

Each database will need its own JavaScript file in order to outline its tables, fixtures, and permissions. This "database script" file will simply export an object with the following allowed nested parameters:

- **tables** : A hash of table definitions, where the key is the table name, and the value is an object with the following parameters:
  - **columns** : A hash of column definitions, where the key is the column name, and the value is a string representing the data type
  - **fixtures** : An array of hashes containing keys and values for the columns
  - **allow** : A hash of values or functions, where the key is the RESTful "action" name, and the value is either a boolean value, or a function that accepts the request data and returns a boolean value (when true, the request action is allowed). When an action is *not* mentioned in this hash, it is not allowed (equivalent to *false* value).

The RESTful "actions" are a friendly way to refer to REST requests, and each represents a combination of an HTTP method and a URI format:

- *create* (POST /resources) Create a new entry in the collection
- *delete* (DELETE /resources/:id) Delete the addressed resource
- *deleteAll* (DELETE /resources) Delete the entire collection
- *find* (GET /resources/:id) Retrieve a representation of the resource
- *findAll* (GET /resources) Retrieve all the collection's resources
- *replaceAll* (PUT /resources) Replace the entire collection
- *update* (PUT /resources/:id) Replace the addressed resource (or create if null)

#### Example Database Script, "example.js"

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
