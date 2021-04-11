const socket = io();

socket.on('receive-profile', (profile) => {
  vue.profile = profile;
  vue.profileReceived = true;
  vue.selectedIcon = profile.icon;
});

socket.on('change-icon', () => {
  vue.profile.icon = vue.selectedIcon;
});

socket.on('receive-dungeons', (dungeons, otherDungeons) => {
  vue.dungeons = dungeons;
  vue.otherDungeons = otherDungeons;
  vue.dungeonsReceived = true;
});

socket.on('create-dungeon', (dungeon) => {
  vue.dungeons.push(dungeon);
});

socket.on('delete-dungeon', () => {
  if (vue.dungeonIndexToDelete < 0 || vue.dungeonIndexToDelete >= vue.dungeons.length) return;
  vue.dungeons.splice(vue.dungeonIndexToDelete, 1);
  vue.dungeonIndexToDelete = -1;
});

socket.on('receive-dungeon', (dungeon) => {
  vue.dungeon = dungeon;
  vue.dungeonID = dungeon?._id;
  vue.dungeonReceived = true;
  document.title = `${dungeon ? dungeon.name : 'Not Found'} | Task Dungeon`;
});

socket.on('add-user', (user) => {
  if (user) vue.dungeon.otherUsers.push(user);
  else vue.showUserNotAdded = true;
});

socket.on('remove-user', () => {
  if (vue.userIndexToRemove < 0 || vue.userIndexToRemove >= vue.dungeon.otherUsers.length) return;
  vue.dungeon.otherUsers.splice(vue.userIndexToRemove, 1);
  vue.userIndexToRemove = -1;
});

function getQuest(roomIndex, questIndex) {
  if (roomIndex < 0 || roomIndex >= vue.dungeon.rooms.length) return;
  const room = vue.dungeon.rooms[roomIndex];
  if (questIndex < 0 || questIndex >= room.quests.length) return;
  return room.quests[questIndex];
}

socket.on('save-quest', (roomIndex, questIndex, name, note, date, time) => {
  const quest = getQuest(roomIndex, questIndex);
  if (!quest) return;
  quest.name = name;
  quest.note = note;
  quest.date = date;
  quest.time = time;
});

socket.on('completed-quest', (roomIndex, questIndex, isCompleted) => {
  const quest = getQuest(roomIndex, questIndex);
  if (!quest) return;
  quest.completed = isCompleted;
});

socket.on('created-quest', (roomIndex, name, note, date, time) => {
  if (roomIndex < 0 || roomIndex >= vue.dungeon.rooms.length) return;
  const room = vue.dungeon.rooms[roomIndex];
  room.quests.push({ name, note, date, time });
});

socket.on('deleted-quest', () => {
  if (vue.roomIndexQuestToDelete < 0 || vue.roomIndexQuestToDelete >= vue.dungeon.rooms.length) return;
  const room = vue.dungeon.rooms[vue.roomIndexQuestToDelete];
  if (vue.questIndexQuestToDelete < 0 || vue.questIndexQuestToDelete >= room.quests.length) return;
  room.quests.splice(vue.questIndexQuestToDelete, 1);
  vue.roomIndexQuestToDelete = -1;
  vue.questIndexQuestToDelete = -1;
});