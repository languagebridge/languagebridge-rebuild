#!/bin/bash
set -e

echo "Building TypeScript..."
cd "$(dirname "$0")/.."
npm run build:backend

echo "Preparing deployment package..."
DEPLOY_DIR=/tmp/lb-deploy
rm -rf $DEPLOY_DIR
mkdir -p $DEPLOY_DIR

# Copy compiled output and required files
cp -r backend/dist $DEPLOY_DIR/dist
cp backend/host.json $DEPLOY_DIR/host.json
cp backend/package.json $DEPLOY_DIR/package.json
cp backend/local.settings.json $DEPLOY_DIR/local.settings.json

# Install production dependencies only
echo "Installing production dependencies..."
cd $DEPLOY_DIR
npm install --omit=dev --no-package-lock

# Deploy from the package directory
echo "Deploying to Azure..."
func azure functionapp publish languagebridge-functions --no-build

echo "Done."
