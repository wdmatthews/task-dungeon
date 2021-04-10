module.exports = function(express, app, io, session, MongoStore, mongoUrl) {
  app.disable('x-powered-by');
  app.use(express.static('public'));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  const sessionMiddleware = session({
    secret: 'secret',
    store: MongoStore.create({ mongoUrl }),
    resave: false,
    saveUninitialized: false,
    cookie: { secure: 'auto' },
  });
  app.use(sessionMiddleware);
  io.use((socket, next) => sessionMiddleware(socket.request, socket.request.res || {}, next));
}