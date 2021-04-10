const socket = io();

socket.on('receive-profile', (profile) => {
  vue.profile = profile;
  vue.profileReceived = true;
});

socket.on('receive-dungeons', (dungeons) => {
  vue.dungeons = dungeons;
  vue.dungeonsReceived = true;
});

socket.on('receive-dungeon', (dungeon) => {
  vue.dungeon = dungeon;
  vue.dungeonReceived = true;
  document.title = `${dungeon ? dungeon.name : 'Not Found'} | Task Dungeon`;
});