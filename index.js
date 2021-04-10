const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const session = require('express-session');
const { MongoClient } = require('mongodb');
const mongoUrl = `mongodb://localhost:27017/task_dungeon`;
const MongoStore = require('connect-mongo');
const bcrypt = require('bcrypt');

const defaultDungeon = {
  otherUsers: [],
};

require('./modules/initialization.js')(express, app, io, session, MongoStore, mongoUrl);
const auth = require('./modules/authentication.js')(
  MongoClient, bcrypt, mongoUrl, 'userID', 'task_dungeon', 'users');
require('./modules/routes.js')(app, auth, MongoClient, mongoUrl, defaultDungeon);
require('./modules/socket-server.js')(io, MongoClient, mongoUrl, defaultDungeon);

http.listen(3000, () => console.log(`App listening at http://localhost:3000`));