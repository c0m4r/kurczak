#!/usr/bin/env bash

BASEDIR=$(dirname "$0")

cd "$BASEDIR" || exit 1
cd ..

if ! command -v docker &>/dev/null ; then
    echo "docker not found" ; exit 1
fi

docker run -d \
  -p 1234:1234 \
  -v $(pwd)/data:/app/data \
  --add-host=host.docker.internal:host-gateway \
  --name kurczak \
  kurczak
