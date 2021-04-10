module.exports = function(app, auth, MongoClient, mongoUrl, defaultDungeon) {
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
  
  app.get('/profile', auth.requireAuth('/login'), (req, res) => {
    res.sendFile('profile.html', resFileOptions);
  });
  
  app.get('/dungeons', auth.requireAuth('/login'), (req, res) => {
    res.sendFile('dungeons.html', resFileOptions);
  });
  
  app.get('/dungeon', auth.requireAuth('/login'), (req, res) => {
    res.sendFile('dungeon.html', resFileOptions);
  });
  
  app.get('/logout', auth.requireAuth('/dungeon'), auth.logout, (req, res) => res.redirect('/login'));
  
  app.post('/api/register', auth.requireNoAuth('/dungeon'), async (req, res) => {
    let name = req.body.name;
    let username = req.body.username;
    let password = req.body.password;
    
    if (typeof name !== 'string' || typeof username !== 'string' || typeof password !== 'string') {
      res.redirect('/register?error');
      return;
    }
    
    if (name.length > 30) name = name.substring(0, 30);
    if (username.length > 20) username = username.substring(0, 20);
    if (password.length > 20) password = password.substring(0, 20);
    const registerResult = await auth.register(username, password, { name: name, xp: 0, icon: 'brutal-helm' });
    
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
    let username = req.body.username;
    let password = req.body.password;
    
    if (typeof username !== 'string' || typeof password !== 'string') {
      res.redirect('/login?error');
      return;
    }
    
    if (username.length > 20) username = username.substring(0, 20);
    if (password.length > 20) password = password.substring(0, 20);
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