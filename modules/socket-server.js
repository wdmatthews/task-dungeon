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
          delete user.joinedDungeons;
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
        userDungeons.forEach(dungeon => {
          delete dungeon.otherUsers;
        });
        return userDungeons;
      });
      const otherDungeons = await runMongoCommand(async (client) => {
        const user = await client
          .db('task_dungeon')
          .collection('users')
          .findOne({ _id: ObjectId(session.userID) });
        const joinedDungeonReferences = user.joinedDungeons;
        let joinedDungeons = [];
        
        for (const dungeonReference of joinedDungeonReferences) {
          const dungeon = await client
            .db('task_dungeon')
            .collection(`user_${dungeonReference.userID}`)
            .findOne({ _id: ObjectId(dungeonReference.dungeonID) });
          joinedDungeons.push(dungeon);
        }
        
        return joinedDungeons;
      });
      
      socket.emit('receive-dungeons', dungeons, otherDungeons);
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
        delete dungeon.otherUsers;
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
    
    socket.on('fetch-dungeon', async (dungeonID, joiningIndex) => {
      if (!dungeonID) dungeonID = '';
      if (joiningIndex == null) joiningIndex = -1;
      const session = socket.request.session;
      if (!session || typeof session.userID !== 'string' || typeof dungeonID !== 'string' || typeof joiningIndex !== 'number') return null;
      if (dungeonID && !/^[0-9a-f]{24}$/.test(dungeonID)) {
        socket.emit('receive-dungeon', null);
        return;
      }
      
      try {
        const dungeon = await runMongoCommand(async (client) => {
          let joinedDungeon = null;
          
          if (!dungeonID && joiningIndex >= 0) {
            const user = await client
              .db('task_dungeon')
              .collection('users')
              .findOne({ _id: ObjectId(session.userID) });
            if (joiningIndex >= user.joinedDungeons.length) return null;
            joinedDungeon = user.joinedDungeons[joiningIndex];
            dungeonID = joinedDungeon.dungeonID;
          }
          
          const query = dungeonID && /^[0-9a-f]{24}$/.test(dungeonID) ? { _id: ObjectId(dungeonID) } : { name: 'My Dungeon' };
          const userDungeon = await client
            .db('task_dungeon')
            .collection(!joinedDungeon ? `user_${session.userID}` : `user_${joinedDungeon.userID}`)
            .findOne(query);
          
          if (userDungeon && userDungeon.otherUsers) {
            userDungeon.otherUsers.forEach(user => {
              delete user._id;
            });
          }
          
          return userDungeon;
        });
        
        socket.emit('receive-dungeon', dungeon);
      } catch (error) {
        console.log(error);
      }
    });
    
    socket.on('add-user', async (dungeonID, username) => {
      const session = socket.request.session;
      if (!session || typeof session.userID !== 'string' || typeof dungeonID !== 'string' || typeof username !== 'string') return;
      if (username.length > 20) username = username.substring(0, 20);
      if (dungeonID && !/^[0-9a-f]{24}$/.test(dungeonID)) return;
      
      try {
        const joinedUser = await runMongoCommand(async (client) => {
          const dungeons = client
            .db('task_dungeon')
            .collection(`user_${session.userID}`);
          const userDungeon = await dungeons.findOne({ _id: ObjectId(dungeonID) });
          if (userDungeon.name === 'My Dungeon') return null;
          
          const users = client
            .db('task_dungeon')
            .collection('users');
          const user = await users.findOne({ username });
          const userID = user._id.toString();
          if (userID === session.userID) return null;
          
          for (const userReference of userDungeon.otherUsers) {
            if (userReference._id === userID) return null;
          }
          
          const userToAdd = {
            _id: userID,
            name: user.name,
          };
          userDungeon.otherUsers.push(userToAdd);
          user.joinedDungeons.push({
            userID: session.userID,
            dungeonID,
            name: userDungeon.name,
          });
          
          await dungeons.updateOne({ _id: ObjectId(dungeonID) }, {
            $set: { otherUsers: userDungeon.otherUsers },
          });
          await users.updateOne({ _id: ObjectId(userID) }, {
            $set: { joinedDungeons: user.joinedDungeons },
          });
          
          delete userToAdd._id;
          return userToAdd;
        });
        
        if (joinedUser) socket.emit('add-user', joinedUser);
      } catch (error) {
        console.log(error);
      }
    });
    
    socket.on('remove-user', async (dungeonID, userIndexToRemove) => {
      const session = socket.request.session;
      if (!session || typeof session.userID !== 'string' || typeof dungeonID !== 'string' || typeof userIndexToRemove !== 'number') return;
      if (dungeonID && !/^[0-9a-f]{24}$/.test(dungeonID)) return;
      
      try {
        const removedUser = await runMongoCommand(async (client) => {
          const dungeons = client
            .db('task_dungeon')
            .collection(`user_${session.userID}`);
          const userDungeon = await dungeons.findOne({ _id: ObjectId(dungeonID) });
          if (userDungeon.name === 'My Dungeon') return false;
          if (userIndexToRemove < 0 || userIndexToRemove >= userDungeon.otherUsers.length) return false;
          let userID = userDungeon.otherUsers[userIndexToRemove]._id;
          
          const users = client
            .db('task_dungeon')
            .collection('users');
          const user = await users.findOne({ _id: ObjectId(userID) });
          
          userDungeon.otherUsers.splice(userIndexToRemove, 1);
          for (let i = user.joinedDungeons.length - 1; i >= 0; i--) {
            const joinedDungeon = user.joinedDungeons[i];
            if (joinedDungeon.userID === session.userID && joinedDungeon.dungeonID === dungeonID) {
              user.joinedDungeons.splice(i, 1);
              break;
            }
          }
          
          await dungeons.updateOne({ _id: ObjectId(dungeonID) }, {
            $set: { otherUsers: userDungeon.otherUsers },
          });
          await users.updateOne({ _id: ObjectId(userID) }, {
            $set: { joinedDungeons: user.joinedDungeons },
          });
          
          return true;
        });
        
        if (removedUser) socket.emit('remove-user');
      } catch (error) {
        console.log(error);
      }
    });
  });
}