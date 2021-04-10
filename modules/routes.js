const defaultDungeon = {
  
};

module.exports = function(app, auth, MongoClient, mongoUrl) {
  const resFileOptions = { root: './views' };
  
  app.get('/', (req, res) => {
    res.sendFile('index.html', resFileOptions);
  });
  
  app.get('/register', auth.requireNoAuth('/dungeon'), (req, res) => {
    res.sendFile('register.html', resFileOptions);
  });
  
  app.get('/login', auth.requireNoAuth('/dungeon'), (req, res) => {
    res.sendFile('login.html', resFileOptions);
  });
  
  app.get('/dungeons', auth.requireAuth('/login'), (req, res) => {
    res.sendFile('dungeons.html', resFileOptions);
  });
  
  app.get('/dungeon', auth.requireAuth('/login'), (req, res) => {
    res.sendFile('dungeon.html', resFileOptions);
  });
  
  app.get('/logout', auth.requireAuth('/dungeon'), auth.logout, (req, res) => res.redirect('/login'));
  
  app.post('/api/register', auth.requireNoAuth('/dungeon'), async (req, res) => {
    const name = req.body.name;
    const username = req.body.username;
    const password = req.body.password;
    
    if (typeof name !== 'string' || typeof username !== 'string' || typeof password !== 'string') {
      res.redirect('/register?error');
      return;
    }
    
    const registerResult = await auth.register(username, password, { name: name, xp: 0 });
    
    if (registerResult) {
      let client = null;
      try {
        client = await MongoClient.connect(mongoUrl, { useUnifiedTopology: true });
        const dungeons = client
          .db('task_dungeon')
          .collection(`user_${registerResult}`);
        await dungeons.insertOne({ name: 'My Dungeon', ...defaultDungeon });
      } finally {
        await client.close();
      }
      
      req.session.userID = registerResult;
      res.redirect('/dungeon');
    }
    else res.redirect('/register?error');
  });
  
  app.post('/api/login', auth.requireNoAuth('/dungeon'), async (req, res) => {
    const username = req.body.username;
    const password = req.body.password;
    
    if (typeof username !== 'string' || typeof password !== 'string') {
      res.redirect('/login?error');
      return;
    }
    
    const loginResult = await auth.login(username, password);
    
    if (loginResult) {
      req.session.userID = loginResult;
      res.redirect('/dungeon');
    }
    else res.redirect('/login?error');
  });
  
  app.get('*', (req, res) => res.sendFile('404.html', resFileOptions));
  app.post('*', (req, res) => res.sendFile('404.html', resFileOptions));
}