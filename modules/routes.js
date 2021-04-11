const { ObjectId } = require('bson');

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
  
  app.get('/deleteaccount', auth.requireAuth('/login'), async (req, res) => {
    const session = req.session;
    let client = null;
    
    try {
      client = await MongoClient.connect(mongoUrl, { useUnifiedTopology: true });
      const users = client
        .db('task_dungeon')
        .collection('users');
      const user = await users.findOne({ _id: ObjectId(session.userID) });
      const dungeons = await client
        .db('task_dungeon')
        .collection(`user_${session.userID}`)
        .find().toArray();
      
      for (const dungeon of dungeons) {
        if (!dungeon.otherUsers || dungeon.otherUsers.length === 0) continue;
        
        for (const otherUser of dungeon.otherUsers) {
          const userData = await users.findOne({ _id: ObjectId(otherUser._id) });
          
          for (let i = userData.joinedDungeons.length - 1; i >= 0; i--) {
            const joinedDungeon = userData.joinedDungeons[i];
            if (joinedDungeon.userID === session.userID && joinedDungeon.dungeonID === dungeon._id.toString()) {
              userData.joinedDungeons.splice(i, 1);
              break;
            }
          }
          
          await users.updateOne({ _id: ObjectId(otherUser._id) }, {
            $set: { joinedDungeons: userData.joinedDungeons },
          });
        }
      }
      
      for (const joinedDungeon of user.joinedDungeons) {
        const dungeonCollection = client
          .db('task_dungeon')
          .collection(`user_${joinedDungeon.userID}`);
        const dungeon = await dungeonCollection.findOne({ _id: ObjectId(joinedDungeon.dungeonID) });
        if (!dungeon.otherUsers || dungeon.otherUsers.length === 0) return;
        
        for (let i = dungeon.otherUsers.length - 1; i >= 0; i--) {
          const otherUser = dungeon.otherUsers[i];
          if (otherUser._id === session.userID) {
            dungeon.otherUsers.splice(i, 1);
            break;
          }
        }
        
        await dungeonCollection.updateOne({ _id: ObjectId(joinedDungeon.dungeonID) }, {
          $set: { otherUsers: dungeon.otherUsers },
        });
      }
      
      await client
        .db('task_dungeon')
        .collection(`user_${session.userID}`)
        .drop();
      await users.deleteOne({ _id: ObjectId(session.userID) });
    } finally {
      await client.close();
    }
    
    res.redirect('/logout');
  });
  
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
    const registerResult = await auth.register(username, password, {
      name: name,
      xp: 0,
      icon: 'brutal-helm',
      joinedDungeons: [],
    });
    
    if (registerResult) {
      let client = null;
      
      try {
        const dungeon = { name: 'My Dungeon', otherUsers: [], rooms: [] };
        dungeon.rooms.push({ name: 'General', quests: [
          {
            name: 'Create a Quest',
            completed: false,
            previouslyCompleted: false,
            note: 'Press the "New Room" button below.',
            date: '',
            time: '',
          },
          {
            name: 'Edit a Quest',
            completed: false,
            previouslyCompleted: false,
            note: 'Press the Pencil/Edit Icon to the right.',
            date: '',
            time: '',
          },
          {
            name: 'Complete a Quest',
            completed: false,
            previouslyCompleted: false,
            note: 'Press the checkbox to the left.',
            date: '',
            time: '',
          },
          {
            name: 'Delete a Quest',
            completed: false,
            previouslyCompleted: false,
            note: 'Press the X/Delete Icon to the right.',
            date: '',
            time: '',
          },
          {
            name: 'Delete a Room',
            completed: false,
            previouslyCompleted: false,
            note: 'Press the X/Delete Icon to the top right of this room.',
            date: '',
            time: '',
          },
        ] });
        delete dungeon.otherUsers;
        const otherDungeon = { name: 'Other Dungeon', otherUsers: [], rooms: [] };
        otherDungeon.rooms.push({ name: 'General', quests: [
          {
            name: 'Add a User',
            completed: false,
            previouslyCompleted: false,
            note: 'Press the "Add" button above, and enter another user\'s username.',
            date: '',
            time: '',
          },
          {
            name: 'Remove a User',
            completed: false,
            previouslyCompleted: false,
            note: 'Press the X/Remove Icon to the right of an added user.',
            date: '',
            time: '',
          },
        ] });
        client = await MongoClient.connect(mongoUrl, { useUnifiedTopology: true });
        const dungeons = client
          .db('task_dungeon')
          .collection(`user_${registerResult}`);
        await dungeons.insertMany([dungeon, otherDungeon]);
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