const { ObjectId } = require('bson');

module.exports = function(io, MongoClient, mongoUrl) {
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
    
    socket.on('fetch-dungeon', async (dungeonID) => {
      const session = socket.request.session;
      if (!dungeonID) dungeonID = '';
      if (!session || typeof session.userID !== 'string' || typeof dungeonID !== 'string') return;
      
      try {
        const dungeon = await runMongoCommand(async (client) => {
          if (dungeonID && !/^[0-9a-f]{24}$/.test(dungeonID)) return null;
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