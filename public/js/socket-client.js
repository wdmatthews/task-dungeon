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
  vue.dungeonReceived = true;
  document.title = `${dungeon ? dungeon.name : 'Not Found'} | Task Dungeon`;
});

socket.on('add-user', (user) => {
  vue.dungeon.otherUsers.push(user);
});

socket.on('remove-user', () => {
  if (vue.userIndexToRemove < 0 || vue.userIndexToRemove >= vue.dungeon.otherUsers.length) return;
  vue.dungeon.otherUsers.splice(vue.userIndexToRemove, 1);
  vue.userIndexToRemove = -1;
});