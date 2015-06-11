QueueUp Server
===========

QueueUp is a collaborative playlist streaming service. Anybody can create a playlist, use Spotify to stream from QueueUp, and invite friends to contribute in real time.

A QueueUp *Player* is requried to stream from QueueUp. This repository is for the QueueUp *Server*. Read below about *Players*.

Live site
---
 - [q.louiswilliams.org](http://q.louiswilliams.org) (Any of [q,qup,queueup] subdomains will work)


![Playlist](public/images/screen1small.png)
![Playlist](public/images/screen3small.png)

Setup
-------
The `/spotify.key` configuration file is required to run the server  properly. An example configuration file is located in `/spotify.key.example`. All of the requried parameters can be obtained by creating Spotify Developer account, and then a [Spotify Application](https://developer.spotify.com/my-applications).


A MongoDB Server should be running on `localhost:27017`. This is configurable in `server.js`.

Install & Run
-------------
`npm install`

`npm start`


Players
=====================

A QueueUp Player is required to play from [QueueUp](http://qup.louiswilliams.org). It connects to the server, subscribes to a playlist, and updates automatically to play music from a playlist.

Available Players:

  - [Android Player](https://github.com/extrakt/queueup-player-android): An ready-to-run AndroidStudio project.
  - [Node.js Player](https://github.com/extrakt/queueup-spotify-client): Requires some setup, but effectively the same as the Android player, just on a desktop platform.
  - [iOS](https://github.com/reynoldsjay/queueup-player-ios): XCode project with iPhone player.

Notes:

  - All players require Spotify Premium accounts. This is a result of Spotify's streaming licensing, and there is no legal way around it. Consider buying one. As a student ($5/mo), it is one of the best decisions I've made in my adult life.
  - No web streaming API exists, again, because of music licensing issues with Spotify. Currently, the streaming APIs are limited to Android, iOS, and C (personal use developer accounts only).

Implementation
-------------

A Player can be implemented using a mixture of REST and Socket.IO APIs.

In terms of the API, a **Client** is a read-only listener that subscribes to playlist updates. A **Player** is a **Client** that can also send updates about the current state of the playing track. Only one **Player** is allowed to play at a time for a given playlist.


API: REST
---
For requests that do not require event-based socketed connections, like searching for and updating playlist information. See **Objects** section for schema.

*Note: Every response can have an `error` attribute, with an error description, `error.message`*

**Step 1:** Register or log in to obtain a `client_token` token.

- POST `/api/auth/register`: Register an account for the first time (without Facebook)
    - **Input**: Choose one:
        - `{email: String, password: String, name: String}`: Register with an name/email/password
    - **Returns**: `{user_id: String, client_token: String}`: **Save this. Required for all API requests**
- POST `/api/auth/login`: Log in to receive a `client_token` for API requests
    - **Input**: Choose ONE:
        - `{email: String, password: String}`: Log in with an email/password
        - `{facebook_access_token: String}`: Log in with a valid FB access token
    - **Returns**: `{user_id: String, client_token: String}`: **Save this. Required for all API requests**

**Step 2:** Use the API

Every request from this point on requires a `client_token` and `user_id` attribute in the input. The `client_token` is essentially a password, so keep it secure locally.

- POST `/api/playlists`: Get a list of playlists
    - **Input**: Nothing
    - **Returns**: `{playlists: [Playlist]}`: Array of *Playlist* objects (without tracks).
- POST `/api/playlists/:playlist_id`: Get details for a playlist, by `_id`.
    - **Input**: Nothing
    - **Returns**: `{playlist: Playlist}`: A *Playlist* object. 
- POST `/api/playlists/:playlist_id/skip`: Skip the current track (if allowed)
    - **Input**: Nothing
    - **Returns**: `{playlist: Playlist}`: An updated *Playlist* object.
- POST `/api/playlists/:playlist_id/update`: Submit changes to a playlist
    - **Input**: `{playlist: Playlist}`: A Playlist with attributes to change (if allowed)
    - **Returns**: `{playlist: Playlist}`: An updated *Playlist* object. 
- POST `/api/playlists/:playlist_id/vote`: Vote on a track
    - **Input**: `{track_id: String, vote: Boolean}`: True to vote, false to unvote
    - **Returns**: `{playlist: Playlist}`: An updated *Playlist* object.   
- POST `/api/users/:user_id`: Get User information
    - **Input**: Nothing
    - **Returns**: `user: User`: A *User* object.
- POST `/api/users/:user_id/playlists:`: Get User playlists
    - **Input**: Nothing
    - **Returns**: `playlists: [Playlist]`: Arraw of *Playlist* Objects (without tracks).

API: socket.io
---
For clients and players subscribing to playlist updates

**Step 1:** First authenticate to gain access:

- on `auth`: Initialize authentication by passing API credentials
    - **Parameters**:
        - `client_token`: Client token from the REST API `/auth/login`
        - `user_id`: UserId of client from Step 1
    - **Emits**: `auth_response`: On result. No error is a success.
        - `error`: Sent only if there was an error
            - `message: String`: Description of problem

**Step 2:** Register as a *Client* or *Player*.

**Register as a Client:** Read-only updates

- on `client_subscribe`: Subscribe to updates from a playlist
    - **Parameters**:
        - `playlist_id: String`: Playlist ID to subscribe to
    - **Emits**: `state_change`: On every playlist update until disconnect or unsubscribe
        - *State* object
- on `client_unsubscribe`: Stop receiving state change updates
    - **Parameters**: None
    - **Emits**: `client_unsubscribe_response`: Stops receiving `state_change`
        - `error`: Sent only if there was an error
            - `message: String`: Description of problem


**Register as a Player:** Only one allowed per playlist (registers as a client inherently):

- on `player_subscribe`: Subscribe to updates to play from a playlist
    - **Parameters**:
        - `playlist_id: String`: Playlist ID to play from
    - **Emits**: `state_change`: (every playlist update until disconnect or unsubscribe)
        - *State* object
    - **Emits**: `player_subscribe_response`: Result of subscription
        - `error`: Sent only if there was an error
            - `message: String`: Description of problem
- on `player_unsubscribe`: Stop acting as a player.
    - **Parameters**: None
    - **Emits**: `player_unsubscribe_response`: Stops receiving `state_change`
        - `error`: Sent only if there was an error
            - `message: String`: Description of problem

**As a Player, the following events are now available (and should be implemented):**

- on `track_finished`: The local track finished.
    - **Parameters**: None
    - **Broadcasts**: `state_change: State`: *State* object with new track.
- on `track_progress`: An ratio to update to the track's progression
    - **Parameters**: Send this no less frequently than once per second
        - `progress: Number`: Track progress (ms)
        - `duration: Number`: Track duration (ms)
- on `track_play_pause`: `{playing: true/false}`: The track was paused
    - **Parameters**:
        - `play: Boolean`: Play state to update the server with (true = playing)
    - **Broadcasts**: `state_change: State`: *State* object

Objects
=======
- *Playlist*: Playlist object that represents the entire playlist. Only used in the REST API.
    -  `_id` *String*: Internal ID. Used for Player authentication.
    -  `name` *String* Name of the playlist
    -  `current` *Track*: Currently playing Track
    -  `play` *Boolean*: `true` if playing, `false` otherwise
    -  `volume` *Number [0-100]*: Volume percentage
    -  `tracks` *[QueueItem]*:  Ordered items in the queue.
    -  `admin` Interal ID associate with the Adminisator user (creator)
    -  `date_created` *Number*: Date created (UNIX)
    -  `last_updated` *Number*: Date last updated (UNIX)
    -  `key` *String*: Non-unique short name for the playlist

- *User*: User object that stores basic  information
    - `_id`: *String*: Internal ID. 
    - `name`: *String*: Full name
    - `facebook` (If user is connected with Facebook)
        - `id`: *String*: Fabook profile ID
    - `spotify` (If user is connected with Spotify)
        - `id`: *String*: Spotify profile ID

- *State*: The following fields are always sent:
    - `play` *Boolean*: `true` if playing, `false` otherwise
    - `track` *Track*: Currently playing track.
    - `queue` *[QueueItem]*: Ordered Array of *QueueItem*s.
    - `trigger` *String*: Mostly for debugging. Identifies what action caused this broadcast.

- *Track*: Simplified version of [Spotify's Track (full)](https://developer.spotify.com/web-api/object-model/#track-object-full).
    -  `name` *String*: Track name
    -  `id` *String*: Spotify ID
    -  `uri` *String*: Spotify URI
    -  `artists` *[Object]*: Array of Spotify's Artist objects
        -  `id` *String*: Spotify ID
        -  `name` *String*: Artist name
        -  `type` *String*: Artist type
        -  `uri` *String*: Spotify URI
        -  `href` *String*: Spotify URLs
        -  `external_urls` *[String]*: Extra URLs
    -  `album` *Object*: Spotify's Album object
        - `id` *String*: Spotify ID
        - `name` *String*: Album name
        - `uri` *String*: Spotify URI
        - `images` *[Object]*: Array of Images
            - `height`: *Number*: Image height
            - `width`: *Number*: Image width
            - `url`: *String*: Image URL
- *QueueItem*: Item in the queue
    - `_id`: *String*: Internal ID
    - `track`: *[Track]*: Array of *Track* objects

Remarks
-------
Because I only get to spend so much of my time on this, I am opening this project up to contribution.

If there is a feature you want to see, you have a problem with the app, or you have a problem with me, send me message or open an Issue, thanks!
