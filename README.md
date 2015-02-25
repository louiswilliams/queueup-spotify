QueueUp Server
==============

[Live site](http://queueup.louiswilliams.org)

Queueup is a collaborative, real-time playlist queue. Spotify users can create playlists, and collaborators can add tracks to play in real-time. 

This repository is for the Queueup server, which maintains the current state of playlists. 

A queueup player ([queueup-spotify-client](https://github.com/extrakt/queueup-spotify-
client)) listens to the Queueup server for updates on current track information.

Setup
-------
The `/spotify.key` configuration file is required to run the server  properly. An example configuration file is located in `/spotify.key.example`. All of the requried parameters can be obtained by creating Spotify Developer account, and then a [Spotify Application](https://developer.spotify.com/my-applications).


A MongoDB Server should be running on port 27017. This is configurable in `server.js`.

Run
---

`npm start`