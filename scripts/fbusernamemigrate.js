db.users.find({}).forEach(function (user) {
  db.playlists.update({admin_name: null, admin: user._id}, {$set: {
    admin_name: user.name
  }});
  print (user.name);
});
