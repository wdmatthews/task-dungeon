module.exports = function(MongoClient, bcrypt, mongoUrl, authKey, databaseName, usersCollection) {
  return {
    async register(username, password, defaultData) {
      let client = null;
      let success = false;
      try {
        client = await MongoClient.connect(mongoUrl, { useUnifiedTopology: true });
        const users = client
          .db(databaseName)
          .collection(usersCollection);
        let user = await users.findOne({ username });
        if (!user) {
          const hashedPassword = await bcrypt.hash(password, 10);
          await users.insertOne({ username, password: hashedPassword, ...defaultData });
          user = await users.findOne({ username });
          success = user._id;
        }
      } finally {
        await client.close();
      }
      return success;
    },
    async login(username, password) {
      let client = null;
      let success = false;
      try {
        client = await MongoClient.connect(mongoUrl, { useUnifiedTopology: true });
        const users = client
          .db(databaseName)
          .collection(usersCollection);
        const user = await users.findOne({ username });
        if (user) {
          const passwordMatches = await bcrypt.compare(password, user.password);
          success = passwordMatches ? user._id : false;
        }
      } finally {
        await client.close();
      }
      return success;
    },
    logout(req, res, next) {
      if (req.session) req.session.destroy(next);
      else next();
    },
    requireAuth(failureURL) {
      return (req, res, next) => {
        if (!req.session[authKey]) res.redirect(failureURL);
        else next();
      };
    },
    requireNoAuth(failureURL) {
      return (req, res, next) => {
        if (req.session[authKey]) res.redirect(failureURL);
        else next();
      };
    },
  };
};