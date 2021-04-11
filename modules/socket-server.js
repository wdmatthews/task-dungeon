const { ObjectId } = require('bson');

module.exports = function(io, MongoClient, mongoUrl, defaultDungeon, xpIncrement) {
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
    
    async function getDungeonAndOwner(dungeonID, joiningIndex) {
      const session = socket.request.session;
      const { dungeon, ownerID } = await runMongoCommand(async (client) => {
        let joinedDungeon = null;
        
        if (joiningIndex >= 0) {
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
          .collection(joinedDungeon ? `user_${joinedDungeon.userID}` : `user_${session.userID}`)
          .findOne(query);
        
        return { dungeon: userDungeon, ownerID: joinedDungeon ? joinedDungeon.userID : session.userID };
      });
      
      return { dungeon, ownerID };
    }
    
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
        const { dungeon } = await getDungeonAndOwner(dungeonID, joiningIndex);
        
        if (dungeon && dungeon.otherUsers) {
          dungeon.otherUsers.forEach(user => {
            delete user._id;
          });
        }
        
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
          if (!user) return null;
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
        
        socket.emit('add-user', joinedUser);
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
    
    socket.on('save-quest', async (dungeonID, joiningIndex, roomIndex, questIndex, name, note, date, time) => {
      if (joiningIndex == null) joiningIndex = -1;
      const session = socket.request.session;
      if (!session || typeof session.userID !== 'string'
        || typeof dungeonID !== 'string' || typeof joiningIndex !== 'number'
        || typeof roomIndex !== 'number' || typeof questIndex !== 'number'
        || typeof name !== 'string' || typeof note !== 'string'
        || typeof date !== 'string' || typeof time !== 'string') return;
      if (dungeonID && !/^[0-9a-f]{24}$/.test(dungeonID)) return;
      if (name.length > 30) name = name.substring(0, 30);
      if (note.length > 50) note = note.substring(0, 50);
      if (date.length > 10) date = date.substring(0, 10);
      if (time.length > 5) time = time.substring(0, 5);
      
      try {
        const savedQuest = await runMongoCommand(async (client) => {
          const { dungeon, ownerID } = await getDungeonAndOwner(dungeonID, joiningIndex);
          if (!dungeon) return false;
          const dungeons = client
            .db('task_dungeon')
            .collection(`user_${ownerID}`);
          if (roomIndex < 0 || roomIndex >= dungeon.rooms.length) return false;
          const room = dungeon.rooms[roomIndex];
          if (questIndex < 0 || questIndex >= room.quests.length) return false;
          const quest = room.quests[questIndex];
          
          quest.name = name;
          quest.note = note;
          quest.date = date;
          quest.time = time;
          
          await dungeons.updateOne({ _id: ObjectId(dungeonID) }, {
            $set: { rooms: dungeon.rooms },
          });
          
          return true;
        });
        
        if (savedQuest) socket.emit('save-quest', roomIndex, questIndex, name, note, date, time);
      } catch (error) {
        console.log(error);
      }
    });
    
    socket.on('complete-quest', async (dungeonID, joiningIndex, roomIndex, questIndex, isCompleted) => {
      if (joiningIndex == null) joiningIndex = -1;
      const session = socket.request.session;
      if (!session || typeof session.userID !== 'string'
        || typeof dungeonID !== 'string' || typeof joiningIndex !== 'number'
        || typeof roomIndex !== 'number' || typeof questIndex !== 'number'
        || typeof isCompleted !== 'boolean') return;
      if (dungeonID && !/^[0-9a-f]{24}$/.test(dungeonID)) return;
      
      try {
        const completedQuest = await runMongoCommand(async (client) => {
          const { dungeon, ownerID } = await getDungeonAndOwner(dungeonID, joiningIndex);
          if (!dungeon) return false;
          if (roomIndex < 0 || roomIndex >= dungeon.rooms.length) return false;
          const room = dungeon.rooms[roomIndex];
          if (questIndex < 0 || questIndex >= room.quests.length) return false;
          const quest = room.quests[questIndex];
          
          quest.completed = isCompleted;
          const previouslyCompleted = quest.previouslyCompleted;
          if (isCompleted && !previouslyCompleted) {
            quest.previouslyCompleted = true;
          }
          
          await client
            .db('task_dungeon')
            .collection(`user_${ownerID}`)
            .updateOne({ _id: ObjectId(dungeonID) }, {
              $set: { rooms: dungeon.rooms },
            });
          
          let userIDs = [ownerID];
          dungeon.otherUsers.forEach(user => userIDs.push(user._id));
          
          if (isCompleted && !previouslyCompleted) {
            for (const userID of userIDs) {
              await client
                .db('task_dungeon')
                .collection('users')
                .updateOne({ _id: ObjectId(userID) }, {
                  $inc: { xp: xpIncrement },
                });
            }
          }
          
          return true;
        });
        
        if (completedQuest) socket.emit('completed-quest', roomIndex, questIndex, isCompleted);
      } catch (error) {
        console.log(error);
      }
    });
    
    socket.on('create-quest', async (dungeonID, joiningIndex, roomIndex, name, note, date, time) => {
      if (joiningIndex == null) joiningIndex = -1;
      const session = socket.request.session;
      if (!session || typeof session.userID !== 'string'
        || typeof dungeonID !== 'string' || typeof joiningIndex !== 'number'
        || typeof roomIndex !== 'number' || typeof name !== 'string'
        || typeof note !== 'string' || typeof date !== 'string'
        || typeof time !== 'string') return;
      if (dungeonID && !/^[0-9a-f]{24}$/.test(dungeonID)) return;
      if (name.length > 30) name = name.substring(0, 30);
      if (note.length > 50) note = note.substring(0, 50);
      if (date.length > 10) date = date.substring(0, 10);
      if (time.length > 5) time = time.substring(0, 5);
      
      try {
        const createdQuest = await runMongoCommand(async (client) => {
          const { dungeon, ownerID } = await getDungeonAndOwner(dungeonID, joiningIndex);
          if (!dungeon) return false;
          const dungeons = client
            .db('task_dungeon')
            .collection(`user_${ownerID}`);
          if (roomIndex < 0 || roomIndex >= dungeon.rooms.length) return false;
          const room = dungeon.rooms[roomIndex];
          
          room.quests.push({
            name,
            completed: false,
            previouslyCompleted: false,
            note,
            date,
            time,
          });
          
          await dungeons.updateOne({ _id: ObjectId(dungeonID) }, {
            $set: { rooms: dungeon.rooms },
          });
          
          return true;
        });
        
        if (createdQuest) socket.emit('created-quest', roomIndex, name, note, date, time);
      } catch (error) {
        console.log(error);
      }
    });
    
    socket.on('delete-quest', async (dungeonID, joiningIndex, roomIndex, questIndex) => {
      if (joiningIndex == null) joiningIndex = -1;
      const session = socket.request.session;
      if (!session || typeof session.userID !== 'string'
        || typeof dungeonID !== 'string' || typeof joiningIndex !== 'number'
        || typeof roomIndex !== 'number' || typeof questIndex !== 'number') return;
      if (dungeonID && !/^[0-9a-f]{24}$/.test(dungeonID)) return;
      
      try {
        const deletedQuest = await runMongoCommand(async (client) => {
          const { dungeon, ownerID } = await getDungeonAndOwner(dungeonID, joiningIndex);
          if (!dungeon) return false;
          if (roomIndex < 0 || roomIndex >= dungeon.rooms.length) return false;
          const room = dungeon.rooms[roomIndex];
          if (questIndex < 0 || questIndex >= room.quests.length) return false;
          
          room.quests.splice(questIndex, 1);
          
          await client
            .db('task_dungeon')
            .collection(`user_${ownerID}`)
            .updateOne({ _id: ObjectId(dungeonID) }, {
              $set: { rooms: dungeon.rooms },
            });
          
          return true;
        });
        
        if (deletedQuest) socket.emit('deleted-quest');
      } catch (error) {
        console.log(error);
      }
    });
  });
}