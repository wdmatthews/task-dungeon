const { ObjectId } = require('bson');

module.exports = function(io, MongoClient, mongoUrl, defaultDungeon) {
  async function runMongoCommand(fn) {
    let client = null;
    let result = null;
    
    try {
      client = await MongoClient.connect(mongoUrl, { useUnifiedTopology: true });
      result = await fn(client);
    } finally {
      await client.close();
    }
    
    return result;
  }
  
  io.on('connection', (socket) => {
    socket.on('fetch-profile', async () => {
      const session = socket.request.session;
      if (!session || typeof session.userID !== 'string') return;
      
      try {
        const profile = await runMongoCommand(async (client) => {
          const user = await client
            .db('task_dungeon')
            .collection('users')
            .findOne({ _id: ObjectId(session.userID) });
          delete user._id;
          delete user.username;
          delete user.password;
          return user;
        });
        
        socket.emit('receive-profile', profile);
      } catch (error) {
        console.log(error);
      }
    });
    
    socket.on('change-icon', async (icon) => {
      const session = socket.request.session;
      if (!session || typeof session.userID !== 'string' || typeof icon !== 'string') return;
      icon = icon.replace(/[^a-z\-]/g, '');
      
      try {
        await runMongoCommand(async (client) => {
          await client
            .db('task_dungeon')
            .collection('users').updateOne({ _id: ObjectId(session.userID) }, {
              $set: { icon },
            });
        });
        
        socket.emit('change-icon');
      } catch (error) {
        console.log(error);
      }
    });
    
    socket.on('fetch-dungeons', async () => {
      const session = socket.request.session;
      if (!session || typeof session.userID !== 'string') return;
      
      const dungeons = await runMongoCommand(async (client) => {
        const userDungeons = await client
          .db('task_dungeon')
          .collection(`user_${session.userID}`)
          .find().toArray();
        return userDungeons;
      });
      
      socket.emit('receive-dungeons', dungeons);
    });
    
    socket.on('create-dungeon', async (name) => {
      const session = socket.request.session;
      if (!session || typeof session.userID !== 'string' || typeof name !== 'string') return;
      if (name.length > 30) name = name.substring(0, 30);
      
      const createdDungeon = await runMongoCommand(async (client) => {
        const dungeons = client
          .db('task_dungeon')
          .collection(`user_${session.userID}`);
        let dungeon = await dungeons.findOne({ name });
        if (dungeon) return null;
        await dungeons.insertOne({ name, ...defaultDungeon });
        dungeon = await dungeons.findOne({ name });
        return dungeon;
      });
      
      if (createdDungeon) socket.emit('create-dungeon', createdDungeon);
    });
    
    socket.on('delete-dungeon', async (dungeonID) => {
      if (dungeonID && !/^[0-9a-f]{24}$/.test(dungeonID)) return;
      const session = socket.request.session;
      if (!session || typeof session.userID !== 'string' || typeof dungeonID !== 'string') return;
      
      const deleted = await runMongoCommand(async (client) => {
        const dungeons = client
          .db('task_dungeon')
          .collection(`user_${session.userID}`);
        const userDungeon = await dungeons.findOne({ name: 'My Dungeon' });
        if (userDungeon._id.toString() === dungeonID) return false;
        await dungeons.deleteOne({ _id: ObjectId(dungeonID) });
        return true;
      });
      
      if (deleted) socket.emit('delete-dungeon');
    });
    
    socket.on('fetch-dungeon', async (dungeonID) => {
      if (dungeonID && !/^[0-9a-f]{24}$/.test(dungeonID)) return null;
      if (!dungeonID) dungeonID = '';
      const session = socket.request.session;
      if (!session || typeof session.userID !== 'string' || typeof dungeonID !== 'string') return null;
      
      try {
        const dungeon = await runMongoCommand(async (client) => {
          const query = dungeonID && /^[0-9a-f]{24}$/.test(dungeonID) ? { _id: ObjectId(dungeonID) } : { name: 'My Dungeon' };
          const userDungeon = await client
            .db('task_dungeon')
            .collection(`user_${session.userID}`)
            .findOne(query);
          return userDungeon;
        });
        
        socket.emit('receive-dungeon', dungeon);
      } catch (error) {
        console.log(error);
      }
    });
    
    socket.on('disconnect', () => {
      
    });
  });
}