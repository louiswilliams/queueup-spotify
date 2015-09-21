db.users.find({
    "facebook.id": {$in: ["10153192120175348", "10152755968579562", "1042695869076526"]}
}).forEach(function (friend) {
  print(friend._id);
  db.playlists.find({admin: friend._id}).forEach(function (playlist) {
    print("  ", playlist.name);
  });
});