db.users.find({facebook: {$exists: true}, name: null}).forEach(function (elem) {
  db.users.update(elem, {$set: {
    name: elem.facebook.name
  }});
  print (elem.facebook.name);
});
