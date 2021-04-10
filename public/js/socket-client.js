const socket = io();

socket.on('receive-profile', (profile) => {
  vue.profile = profile;
  vue.profileReceived = true;
  vue.selectedIcon = profile.icon;
});

socket.on('change-icon', () => {
  vue.profile.icon = vue.selectedIcon;
});

socket.on('receive-dungeons', (dungeons) => {
  vue.dungeons = dungeons;
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