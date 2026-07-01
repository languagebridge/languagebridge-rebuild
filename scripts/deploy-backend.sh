#!/bin/bash
#
# Deploy backend to Azure Functions
#
# The npm workspace hoists dependencies to the project root, but Azure Functions
# needs them in the deploy folder. This script creates a clean staging folder,
# installs deps independently, and deploys from there.
#
# Usage:
#   bash scripts/deploy-backend.sh
#

set -e

APP_NAME="languagebridge-api"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$PROJECT_ROOT/backend"
STAGING="/tmp/lb-deploy"

echo "Building TypeScript..."
cd "$PROJECT_ROOT"
npx tsc --project tsconfig.backend.json

echo "Creating staging folder..."
rm -rf "$STAGING"
mkdir -p "$STAGING"
cp -r "$BACKEND/dist" "$STAGING/"
cp "$BACKEND/host.json" "$STAGING/"
cp "$BACKEND/package.json" "$STAGING/"

echo "Installing production dependencies..."
cd "$STAGING"
npm install --production --silent

echo "Deploying to $APP_NAME..."
func azure functionapp publish "$APP_NAME" --javascript

echo ""
echo "Testing health..."
sleep 15
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://$APP_NAME.azurewebsites.net/api/onboarding/schools" \
  -H "x-lb-api-key: ${LB_API_KEY:-test}")

if [ "$STATUS" = "200" ] || [ "$STATUS" = "401" ]; then
  echo "Deploy successful — endpoints responding ($STATUS)"
else
  echo "WARNING: Got HTTP $STATUS — check Azure logs"
fi

echo "Cleaning up..."
rm -rf "$STAGING"
echo "Done."
