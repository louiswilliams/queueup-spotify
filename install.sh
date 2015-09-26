#!/bin/bash

NAME=$1

USAGE="Usage: install ENV_NAME"

if [[ "$USER" == "root" ]]; then
    echo "Do not run as root!"
    exit 1
fi

if [[ -z "$NAME" ]]; then
    echo $USAGE
    exit 1
fi

if [ ! -f spotify.key ]; then
    echo "Create spotify.key before continuing!"
    exit 1 
fi

if [ ! -f routes/facebookSecret.key ]; then
    echo "Create routes/facebookSecret.key before continuing!"
    exit 1 
fi

if [ ! -f env.json ]; then
    echo "Create env.json before continuing!"
    exit 1
fi

if type forever >/dev/null; then
    echo "Forever exists"
else
    echo "Forever does not exist. Please run 'sudo npm install -g forever'"
    exit 1
fi

echo "Installing QueueUp ${NAME}"

npm install

FOREVER=`which forever`
DIR=`pwd`
COMMAND="$FOREVER start $DIR/server.js"

echo "Starting queueup server..."
echo $COMMAND

$COMMAND

echo "@reboot ${USER} $COMMAND" | sudo tee /etc/cron.d/queueup-${NAME}

